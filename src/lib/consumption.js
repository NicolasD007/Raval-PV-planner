// SoC-Lernfunktion: leitet aus der SoC-Historie einen individuellen
// Werktags- und Wochenend-Verbrauch her (Lastenheft Abschnitt 6 + Klärung 8a/8b).
//
// Rein funktional, keine Seiteneffekte -> mit node:test direkt testbar
// (siehe consumption.test.mjs).

import { isoWeekday, calendarDaysBetween, diffDays, median } from './date.js'
import { CONSUMPTION_CONFIG } from './types.js'

/**
 * @param {import('./types.js').SocEntry} entry
 * @returns {'gueltig'|'ausgeschlossen'}
 */
export function entryStatus(entry) {
  return entry.externalCharge || entry.homeCharge ? 'ausgeschlossen' : 'gueltig'
}

/**
 * Klassifiziert ein Intervall zwischen zwei Messpunkten nach Werktag/Wochenende.
 * 'weekday'  = jeder Kalendertag im Intervall ist Mo-Fr
 * 'weekend'  = jeder Kalendertag im Intervall ist Sa/So
 * 'mixed'    = Intervall überspannt beides -> für die getrennte Schätzung nicht nutzbar
 */
export function classifyInterval(fromTimestamp, toTimestamp) {
  const days = calendarDaysBetween(fromTimestamp, toTimestamp)
  const weekdays = days.filter((d) => isoWeekday(d) <= 5)
  const weekendDays = days.filter((d) => isoWeekday(d) >= 6)
  if (weekendDays.length === 0) return 'weekday'
  if (weekdays.length === 0) return 'weekend'
  return 'mixed'
}

/**
 * Baut die Liste aller Intervalle zwischen aufeinanderfolgenden, sortierten
 * SoC-Einträgen inkl. Nutzbarkeits-Einstufung.
 * @param {import('./types.js').SocEntry[]} entries
 */
export function buildIntervals(entries) {
  const sorted = [...entries].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
  const intervals = []
  for (let i = 1; i < sorted.length; i++) {
    const from = sorted[i - 1]
    const to = sorted[i]
    const days = diffDays(from.timestamp, to.timestamp)
    const deltaSocPct = from.soc - to.soc // positiv = Verbrauch (SoC gesunken)
    const toStatus = entryStatus(to)
    const reasons = []
    let usable = true

    if (toStatus === 'ausgeschlossen') {
      usable = false
      reasons.push(to.externalCharge ? 'extern zwischengeladen' : 'zuhause zwischengeladen')
    }
    if (days <= 0) {
      usable = false
      reasons.push('ungültiger Zeitabstand')
    }
    if (deltaSocPct < 0) {
      // SoC ist gestiegen, ohne dass der Endpunkt als Ladeereignis markiert war
      // -> unklarer Datenzusammenhang, nicht für den Verbrauchsschnitt verwenden.
      usable = false
      reasons.push('unklarer Datenzusammenhang (SoC gestiegen, kein Ladeereignis vermerkt)')
    }

    const category = usable ? classifyInterval(from.timestamp, to.timestamp) : 'mixed'
    if (usable && category === 'mixed') {
      reasons.push('Intervall überspannt Werktag und Wochenende')
    }

    intervals.push({
      fromId: from.id,
      toId: to.id,
      fromTimestamp: from.timestamp,
      toTimestamp: to.timestamp,
      days,
      deltaSocPct,
      dailyRatePct: days > 0 ? deltaSocPct / days : null,
      category, // 'weekday' | 'weekend' | 'mixed'
      usableForEstimate: usable && category !== 'mixed',
      excluded: !usable,
      reasons,
    })
  }
  return intervals
}

/** Entfernt Ausreißer relativ zum Median der übergebenen Werte (siehe Klärung 8b). */
function filterOutliers(values, config) {
  if (values.length < 2) return { kept: values, outliers: [] }
  const m = median(values)
  if (!m || m === 0) return { kept: values, outliers: [] }
  const kept = []
  const outliers = []
  for (const v of values) {
    if (v > m * config.outlierHighFactor || v < m * config.outlierLowFactor) {
      outliers.push(v)
    } else {
      kept.push(v)
    }
  }
  // Falls alles als Ausreißer markiert würde (z.B. bei nur 2 sehr unterschiedlichen
  // Werten), behalten wir die Originaldaten statt eine leere Schätzung zu erzeugen.
  return kept.length > 0 ? { kept, outliers } : { kept: values, outliers: [] }
}

/**
 * Ermittelt den gelernten Werktags-/Wochenendverbrauch (%/Tag) aus der SoC-Historie.
 * @param {import('./types.js').SocEntry[]} entries
 * @param {{ now?: Date, config?: typeof CONSUMPTION_CONFIG }} [options]
 */
export function estimateConsumption(entries, options = {}) {
  const config = options.config ?? CONSUMPTION_CONFIG
  const now = options.now ?? new Date()
  const windowStart = new Date(now.getTime() - config.windowWeeks * 7 * 86400000)

  const allIntervals = buildIntervals(entries)
  const recent = allIntervals.filter((iv) => new Date(iv.toTimestamp) >= windowStart)

  const byCategory = (cat) =>
    recent
      .filter((iv) => iv.usableForEstimate && iv.category === cat)
      .slice(-config.maxIntervalsPerCategory)

  const weekdayIntervals = byCategory('weekday')
  const weekendIntervals = byCategory('weekend')

  const weekdayFiltered = filterOutliers(weekdayIntervals.map((iv) => iv.dailyRatePct), config)
  const weekendFiltered = filterOutliers(weekendIntervals.map((iv) => iv.dailyRatePct), config)

  const weekdayRatePct = weekdayFiltered.kept.length ? median(weekdayFiltered.kept) : null
  const weekendRatePct = weekendFiltered.kept.length ? median(weekendFiltered.kept) : null

  // Fallback: fehlt eine Kategorie komplett, wird der kombinierte Median aller
  // gültigen (nicht als Ausreißer markierten) Intervalle verwendet.
  const combinedAll = [...weekdayFiltered.kept, ...weekendFiltered.kept]
  const combinedMedian = combinedAll.length ? median(combinedAll) : null

  const effectiveWeekdayRate = weekdayRatePct ?? combinedMedian
  const effectiveWeekendRate = weekendRatePct ?? combinedMedian

  const validCount = weekdayFiltered.kept.length + weekendFiltered.kept.length
  const totalOutliers = weekdayFiltered.outliers.length + weekendFiltered.outliers.length

  const hasEnoughData = validCount >= config.minValidForEstimate
  const weeklyPercent =
    hasEnoughData && effectiveWeekdayRate != null && effectiveWeekendRate != null
      ? effectiveWeekdayRate * 5 + effectiveWeekendRate * 2
      : null

  return {
    weekdayRatePct: hasEnoughData ? effectiveWeekdayRate : null,
    weekendRatePct: hasEnoughData ? effectiveWeekendRate : null,
    weeklyPercent,
    validCount,
    weekdayValidCount: weekdayFiltered.kept.length,
    weekendValidCount: weekendFiltered.kept.length,
    outlierCount: totalOutliers,
    hasEnoughData,
    message: hasEnoughData
      ? `Ø Wochenverbrauch: ${Math.round(weeklyPercent)} % · Basis: ${validCount} gültige Verbrauchsintervalle`
      : 'Noch zu wenige Daten für eine zuverlässige Verbrauchsschätzung.',
    intervals: allIntervals,
  }
}

/** Für die SoC-Historie-Tabelle: Status pro Eintrag inkl. Anzeigetext. */
export function historyRows(entries) {
  const sorted = [...entries].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
  return sorted.map((entry) => {
    const status = entryStatus(entry)
    let label = 'gültig'
    if (status === 'ausgeschlossen') {
      label = entry.externalCharge ? 'extern geladen → ausgeschlossen' : 'zuhause geladen → ausgeschlossen'
    }
    return { ...entry, status, statusLabel: label }
  })
}
