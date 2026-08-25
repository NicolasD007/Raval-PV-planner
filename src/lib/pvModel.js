// PV-Schätzung und Ladefenster-Suche. Bewusst ohne exakte Astronomie-Bibliothek:
// eine vereinfachte, aber deterministische Tageslicht- und Leistungskurve, die aus
// der Tages-PV-Prognose (kWh, kommt aus dem Wettermodul) eine plausible Ost/West-
// gewichtete Leistungskurve über den Tag verteilt. Ziel ist ein sinnvolles,
// nachvollziehbares Ladefenster – keine meteorologisch exakte Simulation
// (siehe Abschnitt 11 der Spec: "Die Prognose ist eine Schätzung").

import { parseISODate } from './date.js'

/** @param {string} isoDate */
export function dayOfYear(isoDate) {
  const date = parseISODate(isoDate)
  const start = new Date(date.getFullYear(), 0, 1)
  return Math.floor((date - start) / 86400000) + 1
}

/** Grobe Tageslänge nach Standardformel (Deklination + Stundenwinkel). @param {string} isoDate @param {number} lat in Grad */
export function daylightHours(isoDate, lat) {
  const n = dayOfYear(isoDate)
  const decl = 23.45 * Math.sin(((2 * Math.PI) / 365) * (284 + n)) * (Math.PI / 180)
  const latRad = (lat * Math.PI) / 180
  const cosOmega = -Math.tan(latRad) * Math.tan(decl)
  const clamped = Math.min(1, Math.max(-1, cosOmega))
  const omega0 = Math.acos(clamped) // Stundenwinkel bei Sonnenuntergang, im Bogenmaß
  return (2 * omega0 * 12) / Math.PI // Stunden
}

export function timeToMinutes(isoTime) {
  const [h, m] = isoTime.split(':').map(Number)
  return h * 60 + m
}

export function minutesToTime(min) {
  const m = Math.round(((min % 1440) + 1440) % 1440)
  const h = Math.floor(m / 60)
  const mm = m % 60
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

/**
 * Sonnenauf-/-untergang in Minuten seit Mitternacht, um einen festen
 * "wahren Mittag" von 13:00 (grobe Näherung für MEZ/MESZ in Deutschland) zentriert.
 */
export function daylightWindowMinutes(isoDate, lat) {
  const hours = daylightHours(isoDate, lat)
  const solarNoon = 13 * 60
  const half = (hours * 60) / 2
  return { sunriseMin: solarNoon - half, sunsetMin: solarNoon + half }
}

/**
 * Baut eine normierte Ost/West-Leistungskurve über den Tag (kW je Zeitschritt),
 * deren Integral exakt der übergebenen Tages-PV-Prognose (kWh) entspricht.
 * @param {string} isoDate
 * @param {number} pvEstimateKwh
 * @param {{ eastKwp: number, westKwp: number }} pvConfig
 * @param {number} lat
 * @param {number} [stepMinutes]
 */
export function pvPowerSeries(isoDate, pvEstimateKwh, pvConfig, lat, stepMinutes = 15) {
  const { sunriseMin, sunsetMin } = daylightWindowMinutes(isoDate, lat)
  const dayLength = Math.max(0, sunsetMin - sunriseMin)
  const totalKwp = pvConfig.eastKwp + pvConfig.westKwp
  const eastShare = totalKwp > 0 ? pvConfig.eastKwp / totalKwp : 0.5
  const westShare = totalKwp > 0 ? pvConfig.westKwp / totalKwp : 0.5

  const shape = (t) => {
    if (dayLength <= 0 || t < sunriseMin || t > sunsetMin) return 0
    const x = (t - sunriseMin) / dayLength // 0..1 über den Tag
    // Ost-Halbwelle: aktiv in den ersten 75% des Tages, Peak bei ~37%
    const eastX = Math.min(1, Math.max(0, x / 0.75))
    const east = x <= 0.75 ? Math.sin(Math.PI * eastX) : 0
    // West-Halbwelle: aktiv in den letzten 75% des Tages, Peak bei ~63%
    const westX = Math.min(1, Math.max(0, (x - 0.25) / 0.75))
    const west = x >= 0.25 ? Math.sin(Math.PI * westX) : 0
    return eastShare * east + westShare * west
  }

  const points = []
  let rawIntegral = 0
  for (let t = 0; t < 1440; t += stepMinutes) {
    const v = shape(t)
    points.push({ minute: t, raw: v })
    rawIntegral += v * (stepMinutes / 60)
  }

  const scale = rawIntegral > 0 && pvEstimateKwh > 0 ? pvEstimateKwh / rawIntegral : 0
  return points.map((p) => ({
    minute: p.minute,
    time: minutesToTime(p.minute),
    kw: Number((p.raw * scale).toFixed(3)),
  }))
}

/** Liefert die freien (nicht gesperrten) Minutenfenster eines Tages. */
export function freeWindowsForDay(availabilityBlocks) {
  const blocks = availabilityBlocks
    .filter((b) => b.active)
    .map((b) => ({ start: timeToMinutes(b.startTime), end: timeToMinutes(b.endTime) }))
    .sort((a, b) => a.start - b.start)

  const free = []
  let cursor = 0
  for (const b of blocks) {
    if (b.start > cursor) free.push({ start: cursor, end: Math.min(b.start, 1440) })
    cursor = Math.max(cursor, b.end)
  }
  if (cursor < 1440) free.push({ start: cursor, end: 1440 })
  return free.filter((w) => w.end > w.start)
}

export function energyInRange(series, stepMinutes, wallboxKw, startMin, endMin) {
  let kwh = 0
  for (const p of series) {
    if (p.minute >= startMin && p.minute < endMin) {
      kwh += Math.min(p.kw, wallboxKw) * (stepMinutes / 60)
    }
  }
  return kwh
}

/**
 * Sucht innerhalb der freien Fenster das kürzeste zusammenhängende Zeitfenster,
 * das mindestens targetEnergyKwh liefert (klassisches "minimal window mit
 * Summe >= Ziel", da Leistung nie negativ ist). Liegt kein Fenster über dem Ziel,
 * wird das PV-stärkste Fenster mit der maximal erreichbaren Energie geliefert
 * und `reachedTarget: false` gesetzt.
 */
export function bestChargingWindow(series, stepMinutes, freeWindows, targetEnergyKwh, wallboxKw) {
  let best = null
  let bestAnyEnergy = null

  for (const fw of freeWindows) {
    const pts = series.filter((p) => p.minute >= fw.start && p.minute < fw.end)
    if (pts.length === 0) continue
    const energies = pts.map((p) => Math.min(p.kw, wallboxKw) * (stepMinutes / 60))
    const n = energies.length

    // gesamte im Fenster erreichbare Energie (Fallback, falls Ziel nirgends erreichbar)
    const totalEnergy = energies.reduce((s, e) => s + e, 0)
    if (!bestAnyEnergy || totalEnergy > bestAnyEnergy.energyKwh) {
      bestAnyEnergy = {
        startMin: fw.start,
        endMin: fw.end,
        energyKwh: Number(totalEnergy.toFixed(2)),
        reachedTarget: false,
      }
    }

    if (targetEnergyKwh <= 0) continue

    // kürzestes Teilfenster mit Summe >= targetEnergyKwh (Sliding Window, Energien >= 0)
    let left = 0
    let sum = 0
    for (let right = 0; right < n; right++) {
      sum += energies[right]
      while (sum >= targetEnergyKwh && left <= right) {
        const length = right - left + 1
        const candidate = {
          startMin: pts[left].minute,
          endMin: pts[right].minute + stepMinutes,
          energyKwh: Number(sum.toFixed(2)),
          reachedTarget: true,
        }
        if (!best || length < best._length || (length === best._length && candidate.energyKwh > best.energyKwh)) {
          best = { ...candidate, _length: length }
        }
        sum -= energies[left]
        left++
      }
    }
  }

  if (best) {
    const { _length, ...clean } = best
    return clean
  }
  return bestAnyEnergy ?? { startMin: null, endMin: null, energyKwh: 0, reachedTarget: false }
}
