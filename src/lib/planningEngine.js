// Die eigentliche Ladeentscheidung. Bewusst getrennt von der UI (Abschnitt 29),
// rein funktional (kein State, kein I/O) und deterministisch -> vollständig mit
// node:test abgedeckt (siehe planningEngine.test.mjs, Fälle TEST 1-12 aus
// Abschnitt 31 der Spec).
//
// Feste Randbedingungen (nicht verhandelbar, aus der Chat-Klärung):
//   1. Lade-Sperrzeiten werden nie ignoriert.
//   2. Die 40-%-Fahrzeugreserve wird durch bewusstes Warten nie unterschritten.
//   3. Die 70-%-Hausspeicher-Nachtreserve hat Vorrang vor dem Auto.
// Diese drei stehen über allem anderen. Termine, Wochenendziel und
// PV-Optimierung sind Ziele, die *innerhalb* dieser Grenzen bestmöglich
// erreicht werden - nie durch deren Verletzung. Reine Netzladung wird nie
// automatisch vorgeschlagen; ist ein Ziel ohne Netzladen nicht zu halten, wird
// das klar als "gefährdet" kommuniziert (Klärung Punkt 5).

import { addDays, isoWeekday } from './date.js'
import { freeWindowsForDay, pvPowerSeries, bestChargingWindow, timeToMinutes, minutesToTime } from './pvModel.js'

const STEP_MINUTES = 15

/** Tagesrate (%/Tag) je nach Wochentag aus der gelernten Verbrauchsschätzung. */
function dailyRate(date, consumption) {
  const wd = isoWeekday(date)
  const rate = wd <= 5 ? consumption.weekdayRatePct : consumption.weekendRatePct
  return rate ?? consumption.fallbackRatePct ?? 3 // konservativer Default, falls noch keine Lerndaten existieren
}

/** Projizierter SoC zu Beginn von targetDate, ausgehend von startSoc an startDate (ohne Laden). */
export function projectSocAtStartOfDay(startSoc, startDate, targetDate, consumption) {
  let soc = startSoc
  let cursor = startDate
  let guard = 0
  while (cursor < targetDate && guard < 60) {
    soc -= dailyRate(cursor, consumption)
    cursor = addDays(cursor, 1)
    guard++
  }
  return soc
}

/** Energie, die auf einem Tag maximal "frei fürs Auto" ist: PV-Überschuss minus Speicher-Vorrang (TEST 9). */
export function carAvailablePvKwh(weatherDay, houseBatteryConfig) {
  if (!weatherDay) return 0
  return Math.max(0, weatherDay.pvSurplusEstimateKwh - houseBatteryConfig.dailyReplenishmentReserveKwh)
}

/**
 * Wie viel Hausspeicher-Energie zusätzlich zum PV-Überschuss fürs Auto "zugeschaltet"
 * werden darf, wenn reiner PV-Überschuss ein Ziel an einem Tag nicht erreicht - siehe
 * findBestChargeDay(). Nutzt bewusst nur den Anteil OBERHALB der konfigurierten
 * Nachtreserve (houseBattery.nightReservePct) - die Reserve selbst bleibt damit weiterhin
 * eine harte Grenze (Randbedingung 3). Da die App keine Live-Speicher-SoC-Anbindung hat,
 * ist das eine Modellannahme ("Speicher ist tagsüber eher voll"), keine Messung - wird
 * deshalb in reason()/der UI immer klar als "Annahme" gekennzeichnet, nie als Fakt
 * dargestellt (Abschnitt 33). Über houseBattery.allowBatteryAssistCharging abschaltbar.
 */
export function assumedBatteryAssistKwh(houseBatteryConfig) {
  if (!houseBatteryConfig.allowBatteryAssistCharging) return 0
  const usableAboveReserve = (houseBatteryConfig.capacityKwh * (100 - houseBatteryConfig.nightReservePct)) / 100
  return Number(Math.max(0, usableAboveReserve).toFixed(2))
}

function clipWindowsBefore(freeWindows, maxMinute) {
  return freeWindows
    .map((w) => ({ start: w.start, end: Math.min(w.end, maxMinute) }))
    .filter((w) => w.end > w.start)
}

/**
 * Baut die Liste der zu erfüllenden Anforderungen (Sicherheitsreserve,
 * Wochenendziel, Nutzertermine) für den Planungshorizont.
 */
function buildRequirements({ today, currentSoc, currentSocDate, consumption, horizonDates, chargingGoals, setup }) {
  const requirements = []

  // 1) Explizite Nutzertermine (Abschnitt 8)
  for (const goal of chargingGoals.filter((g) => g.active)) {
    requirements.push({
      source: 'termin',
      label: `Termin: ${goal.targetSoc} % am ${goal.date}`,
      byDate: goal.date,
      byTime: '00:00',
      minSoc: goal.targetSoc,
      hard: false,
    })
  }

  // 2) Wochenendziel (Abschnitt 4, Klärung Punkt 7: Freitag 20:00 Uhr)
  const nextFriday = horizonDates.find((d) => isoWeekday(d) === 5)
  if (nextFriday) {
    const projectedAtFriday = projectSocAtStartOfDay(currentSoc, currentSocDate, nextFriday, consumption)
    if (projectedAtFriday < setup.weekend.targetPct) {
      requirements.push({
        source: 'wochenende',
        label: `Wochenendziel: ${setup.weekend.targetPct} % bis Freitag 20:00`,
        byDate: nextFriday,
        byTime: setup.weekend.deadline.time,
        minSoc: setup.weekend.targetPct,
        hard: false,
      })
    }
  }

  // 3) 40-%-Sicherheitsreserve (hart, Abschnitt 3)
  for (const d of horizonDates) {
    const projected = projectSocAtStartOfDay(currentSoc, currentSocDate, d, consumption)
    if (projected < setup.vehicle.safetyReservePct) {
      requirements.push({
        source: 'sicherheitsreserve',
        label: `40-%-Reserve wäre am ${d} unterschritten`,
        byDate: d,
        byTime: '00:00',
        minSoc: setup.vehicle.safetyReservePct,
        hard: true,
      })
      break // die erste Unterschreitung ist die relevante - danach ist ohnehin geladen
    }
  }

  return requirements.sort((a, b) => (a.byDate + a.byTime > b.byDate + b.byTime ? 1 : -1))
}

/**
 * Sucht unter den Kandidatentagen den PV-optimalen Tag, der die Anforderung
 * erfüllen kann (oder, falls keiner ausreicht, den mit dem größten Teilerfolg).
 */
function findBestChargeDay({ candidateDates, requirement, plannedByDate, currentSoc, currentSocDate, consumption, weatherByDate, availabilityBlocks, setup }) {
  let best = null

  for (const date of candidateDates) {
    const alreadyPlanned = plannedByDate.get(date)
    const startSoc = alreadyPlanned
      ? alreadyPlanned.targetSoc
      : projectSocAtStartOfDay(currentSoc, currentSocDate, date, consumption)

    // Es reicht nicht, an diesem Tag nur exakt requirement.minSoc zu erreichen -
    // zwischen Ladetag und Deadline wird ja weiter verbraucht. Daher: Zielwert an
    // diesem Ladetag = minSoc + Verbrauch bis zur Deadline.
    const decayToDeadline = -projectSocAtStartOfDay(0, date, requirement.byDate, consumption)
    // Nach oben auf 100% gedeckelt: mehr als "voll" geht nicht. Verbrauch, der
    // NACH dem Laden aber vor der Deadline anfällt, ist normale Nutzung, kein
    // Zielverfehlen - siehe Klärung zu Ladezielen (Abschnitt 8).
    const requiredStartSoc = Math.min(100, requirement.minSoc + decayToDeadline)
    const neededPct = Math.max(0, requiredStartSoc - startSoc)
    if (neededPct <= 0) continue // an diesem Tag ist die Anforderung bereits erfüllt
    const neededEnergyKwh = (neededPct / 100) * setup.vehicle.batteryCapacityKwh

    const blocksForDay = availabilityBlocks.filter((b) => b.date === date && b.active)
    let freeWindows = freeWindowsForDay(blocksForDay)
    if (date === requirement.byDate && requirement.byTime !== '00:00') {
      freeWindows = clipWindowsBefore(freeWindows, timeToMinutes(requirement.byTime))
    }
    if (freeWindows.length === 0) continue // Tag komplett gesperrt

    const weatherDay = weatherByDate.get(date)
    const pvOnlyKwh = carAvailablePvKwh(weatherDay, setup.houseBattery)
    const pvOnlySeries = pvPowerSeries(date, pvOnlyKwh, setup.pv, setup.location.lat, STEP_MINUTES)
    let win = bestChargingWindow(pvOnlySeries, STEP_MINUTES, freeWindows, neededEnergyKwh, setup.wallboxKw)
    let energySource = 'PV_UEBERSCHUSS'

    // Reicht reiner PV-Überschuss an diesem Tag nicht aus, optional zusätzlich
    // Hausspeicher-"Zuschalt"-Energie einplanen (siehe assumedBatteryAssistKwh) -
    // nur übernehmen, wenn es tatsächlich mehr bringt als die reine PV-Variante.
    const assistKwh = assumedBatteryAssistKwh(setup.houseBattery)
    if (!win.reachedTarget && assistKwh > 0) {
      const boostedSeries = pvPowerSeries(date, pvOnlyKwh + assistKwh, setup.pv, setup.location.lat, STEP_MINUTES)
      const boostedWin = bestChargingWindow(boostedSeries, STEP_MINUTES, freeWindows, neededEnergyKwh, setup.wallboxKw)
      if (boostedWin.reachedTarget || boostedWin.energyKwh > win.energyKwh) {
        win = boostedWin
        energySource = 'PV_UND_SPEICHER'
      }
    }

    const candidate = {
      date,
      startSoc,
      requiredStartSoc,
      neededEnergyKwh,
      window: win,
      energySource,
      pvSurplusEstimateKwh: weatherDay?.pvSurplusEstimateKwh ?? 0,
      confidence: weatherDay?.confidence ?? 'niedrig',
      stale: weatherDay?.stale ?? true,
    }

    if (!best) {
      best = candidate
      continue
    }
    // 1. Tage, die das Ziel voll erreichen, schlagen Tage, die es nicht tun.
    if (win.reachedTarget !== best.window.reachedTarget) {
      if (win.reachedTarget) best = candidate
      continue
    }
    // 2. unter gleichwertigen Tagen: der PV-stärkere Tag gewinnt (Konfliktlogik, Abschnitt 10).
    if (win.reachedTarget && best.window.reachedTarget) {
      if (candidate.pvSurplusEstimateKwh > best.pvSurplusEstimateKwh) best = candidate
      continue
    }
    // 3. reicht keiner: der Tag mit der größten erreichbaren Teilenergie gewinnt.
    if (!win.reachedTarget && !best.window.reachedTarget) {
      if (win.energyKwh > best.window.energyKwh) best = candidate
    }
  }

  return best
}

function formatReason({ requirement, best, targetSoc }) {
  const from = Math.round(best.startSoc)
  const parts = [`${requirement.label}.`]
  if (best.window.reachedTarget) {
    parts.push(`Bestes verfügbares PV-Fenster nutzt den Überschuss, um ${from} % → ${targetSoc} % zu laden.`)
  } else {
    parts.push(
      `Verfügbare PV reicht an diesem Tag voraussichtlich nicht für ${targetSoc} % (nur ~${best.window.energyKwh} kWh erreichbar).`
    )
  }
  if (best.energySource === 'PV_UND_SPEICHER') {
    parts.push(
      'Reiner PV-Überschuss reicht dafür nicht - der Plan bezieht zusätzlich Energie aus dem Hausspeicher oberhalb der Reserve (Annahme, keine Live-Messung des Speicherstands).'
    )
  }
  return parts.join(' ')
}

/**
 * Haupteinstieg der Planning Engine.
 * @returns {{ days: import('./types.js').Plan[], weekMessage: string, todayHeadline: object }}
 */
export function planWeek(input) {
  const { today, currentSoc, currentSocDate, consumption, weatherDays, availabilityBlocks, chargingGoals, setup } = input

  const horizonDates = weatherDays.map((w) => w.date).length
    ? weatherDays.map((w) => w.date)
    : Array.from({ length: 7 }, (_, i) => addDays(today, i))
  const weatherByDate = new Map(weatherDays.map((w) => [w.date, w]))

  const requirements = buildRequirements({
    today,
    currentSoc,
    currentSocDate,
    consumption,
    horizonDates,
    chargingGoals,
    setup,
  })

  /** @type {Map<string, any>} */
  const plannedByDate = new Map()
  const conflicts = []

  for (const requirement of requirements) {
    // Wurde die Anforderung durch bereits geplante Ladungen ohnehin schon erfüllt?
    const projectedByDeadline = (() => {
      let soc = currentSoc
      let cursor = currentSocDate
      let guard = 0
      while (cursor < requirement.byDate && guard < 60) {
        const planned = plannedByDate.get(cursor)
        soc = planned ? planned.targetSoc : soc - dailyRate(cursor, consumption)
        cursor = addDays(cursor, 1)
        guard++
      }
      return soc
    })()
    if (projectedByDeadline >= requirement.minSoc) continue // kein künstlicher Ladetag (Abschnitt 4/15)

    // Bei Deadlines "zu Tagesbeginn" (00:00, z.B. Sicherheitsreserve oder Termin
    // "Donnerstag brauche ich...") muss VOR diesem Tag geladen sein, nicht mehr an
    // ihm selbst. Nur die Wochenend-Deadline (20:00) erlaubt den Tag selbst noch.
    // Ausnahme: Ist die Deadline bereits heute (SoC ist schon unter der Reserve),
    // gibt es keinen "Tag davor" mehr - heute muss als Kandidat zählen.
    const deadlineIncludesOwnDay = requirement.byTime !== '00:00' || requirement.byDate === today
    const candidateDates = horizonDates.filter(
      (d) => d >= today && (deadlineIncludesOwnDay ? d <= requirement.byDate : d < requirement.byDate)
    )
    const best = findBestChargeDay({
      candidateDates,
      requirement,
      plannedByDate,
      currentSoc,
      currentSocDate,
      consumption,
      weatherByDate,
      availabilityBlocks,
      setup,
    })

    if (!best) {
      conflicts.push(
        `⚠️ ${requirement.label} ist gefährdet: An keinem Tag bis dahin ist ein Ladefenster verfügbar. ${
          setup.allowGridChargingSuggestion ? '' : 'Ohne Netzladen ist das nicht erreichbar.'
        }`
      )
      continue
    }

    const targetSoc = Math.min(
      100,
      Math.max(best.requiredStartSoc, requirement.minSoc, plannedByDate.get(best.date)?.targetSoc ?? 0)
    )
    const reason = formatReason({ requirement, best, targetSoc })
    if (!best.window.reachedTarget) {
      conflicts.push(
        `⚠️ ${requirement.label} ist gefährdet. ${
          candidateDates[candidateDates.length - 1] === best.date ? `${best.date} ist das letzte geeignete Ladefenster.` : ''
        } Ohne Netzladen ist es voraussichtlich nicht vollständig erreichbar.`
      )
    }

    plannedByDate.set(best.date, {
      date: best.date,
      action: 'CHARGE',
      startSoc: Math.round(best.startSoc),
      targetSoc: Math.round(targetSoc),
      // Kein sinnvolles Fenster anzeigen, wenn ohnehin nichts erreichbar ist (0 kWh) -
      // ein "00:00-23:59"-Fenster würde sonst eine PV-Nutzung suggerieren, die es nicht gibt.
      chargingWindow:
        best.window.startMin != null && best.window.energyKwh > 0
          ? { date: best.date, start: minutesToTime(best.window.startMin), end: minutesToTime(Math.min(best.window.endMin, 1439)) }
          : null,
      expectedEnergyKwh: Number((((targetSoc - best.startSoc) / 100) * setup.vehicle.batteryCapacityKwh).toFixed(1)),
      reason,
      confidence: best.confidence,
      energySource: best.energySource,
      conflicts: best.window.reachedTarget ? [] : [`${requirement.label} nur teilweise erreichbar`],
      source: requirement.source,
    })
  }

  const days = horizonDates.map((date) => {
    const planned = plannedByDate.get(date)
    if (planned) return planned
    const weatherDay = weatherByDate.get(date)
    return {
      date,
      action: 'NO_CHARGE',
      startSoc: null,
      targetSoc: null,
      chargingWindow: null,
      expectedEnergyKwh: 0,
      reason: 'Kein Ladebedarf an diesem Tag.',
      confidence: weatherDay?.confidence ?? 'mittel',
      energySource: null,
      conflicts: [],
      source: null,
    }
  })

  const todayPlan = days.find((d) => d.date === today)
  const futureCharge = days.find((d) => d.date > today && d.action === 'CHARGE')

  let todayHeadline
  if (todayPlan && todayPlan.action === 'CHARGE') {
    todayHeadline = {
      action: 'HEUTE_LADEN',
      title: '☀️ HEUTE LADEN',
      window: todayPlan.chargingWindow,
      subtitle: `${todayPlan.startSoc} % → ${todayPlan.targetSoc} %`,
      reason: todayPlan.reason,
    }
  } else if (futureCharge) {
    todayHeadline = {
      action: 'WARTEN',
      title: '⏳ WARTEN',
      window: null,
      subtitle: `Besseres PV-Fenster am ${futureCharge.date}`,
      reason: futureCharge.reason,
    }
  } else {
    todayHeadline = {
      action: 'NICHT_LADEN',
      title: '🚫 NICHT LADEN',
      window: null,
      subtitle: 'Diese Woche nicht laden',
      reason: 'Aktueller SoC und Prognose decken den Bedarf ohne weitere Ladung.',
    }
  }

  const weekMessage =
    plannedByDate.size === 0 ? 'Diese Woche nicht laden.' : `${plannedByDate.size} Ladetermin(e) diese Woche geplant.`

  return { days, weekMessage, todayHeadline, conflicts, requirements }
}
