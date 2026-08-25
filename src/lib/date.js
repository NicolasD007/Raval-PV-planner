// Reine Datums-/Zeit-Hilfsfunktionen. Keine Bibliotheks-Abhängigkeit, damit sie
// ohne Build-Toolchain unit-testbar sind (siehe date.test.mjs).
//
// Konventionen:
// - "isoDate"   = 'YYYY-MM-DD' (Kalendertag, ohne Zeitzone)
// - "isoTime"   = 'HH:MM'
// - "timestamp" = ISO-8601 Datetime-String, wie er in SocEntry.timestamp steht
//
// Wochentag-Zählung folgt ISO 8601: Montag = 1 ... Sonntag = 7.

export const WEEKDAY_NAMES_DE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

/** @param {Date} date */
export function toISODate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** @param {string} isoDate */
export function parseISODate(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** @param {string} isoDate @param {number} days */
export function addDays(isoDate, days) {
  const date = parseISODate(isoDate)
  date.setDate(date.getDate() + days)
  return toISODate(date)
}

/** ISO-Wochentag: Montag=1 ... Sonntag=7. @param {string} isoDate */
export function isoWeekday(isoDate) {
  const jsDay = parseISODate(isoDate).getDay() // 0=So ... 6=Sa
  return jsDay === 0 ? 7 : jsDay
}

/** @param {string} isoDate */
export function isWeekendDay(isoDate) {
  const wd = isoWeekday(isoDate)
  return wd === 6 || wd === 7
}

/** @param {string} isoDate */
export function weekdayNameDE(isoDate) {
  return WEEKDAY_NAMES_DE[isoWeekday(isoDate) - 1]
}

/**
 * Baut ein "naives" lokales Datetime aus Kalendertag + Uhrzeit (kein Zeitzonen-Shift).
 * @param {string} isoDate
 * @param {string} isoTime 'HH:MM'
 */
export function combineDateTime(isoDate, isoTime) {
  const [h, min] = isoTime.split(':').map(Number)
  const date = parseISODate(isoDate)
  date.setHours(h, min, 0, 0)
  return date
}

/** Differenz in (fraktionalen) Tagen zwischen zwei Timestamps/Daten. b - a. */
export function diffDays(a, b) {
  const da = a instanceof Date ? a : new Date(a)
  const db = b instanceof Date ? b : new Date(b)
  return (db.getTime() - da.getTime()) / 86400000
}

/** Alle Kalendertage (isoDate) im Bereich [fromTimestamp, toTimestamp], inklusive Endtage. */
export function calendarDaysBetween(fromTimestamp, toTimestamp) {
  const from = toISODate(new Date(fromTimestamp))
  const to = toISODate(new Date(toTimestamp))
  const days = []
  let cursor = from
  let guard = 0
  while (cursor <= to && guard < 400) {
    days.push(cursor)
    cursor = addDays(cursor, 1)
    guard++
  }
  return days
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

export function median(values) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}
