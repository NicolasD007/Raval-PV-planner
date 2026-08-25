import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { isoWeekday, isWeekendDay, addDays, weekdayNameDE, median, calendarDaysBetween } from './date.js'

describe('date helpers', () => {
  it('erkennt Wochentage korrekt (Mo=1..So=7)', () => {
    assert.equal(isoWeekday('2026-08-17'), 1) // Montag
    assert.equal(isoWeekday('2026-08-21'), 5) // Freitag
    assert.equal(isoWeekday('2026-08-22'), 6) // Samstag
    assert.equal(isoWeekday('2026-08-23'), 7) // Sonntag
  })

  it('erkennt Wochenendtage', () => {
    assert.equal(isWeekendDay('2026-08-22'), true)
    assert.equal(isWeekendDay('2026-08-23'), true)
    assert.equal(isWeekendDay('2026-08-21'), false)
  })

  it('addDays rechnet über Monatsgrenzen korrekt', () => {
    assert.equal(addDays('2026-08-30', 3), '2026-09-02')
  })

  it('weekdayNameDE liefert deutsche Kürzel', () => {
    assert.equal(weekdayNameDE('2026-08-17'), 'Mo')
    assert.equal(weekdayNameDE('2026-08-23'), 'So')
  })

  it('median funktioniert für gerade und ungerade Listen', () => {
    assert.equal(median([1, 2, 3]), 2)
    assert.equal(median([1, 2, 3, 4]), 2.5)
    assert.equal(median([]), null)
  })

  it('calendarDaysBetween liefert alle Kalendertage inklusive Endtage', () => {
    const days = calendarDaysBetween('2026-08-17T08:00:00', '2026-08-19T20:00:00')
    assert.deepEqual(days, ['2026-08-17', '2026-08-18', '2026-08-19'])
  })
})
