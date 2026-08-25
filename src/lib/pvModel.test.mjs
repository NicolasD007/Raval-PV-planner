import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { pvPowerSeries, freeWindowsForDay, bestChargingWindow, energyInRange, timeToMinutes } from './pvModel.js'

const LAT = 47.78873
const PV_CONFIG = { eastKwp: 6.9, westKwp: 9.2 }

describe('pvModel', () => {
  it('Energieerhaltung: Integral der Leistungskurve entspricht der Tagesprognose', () => {
    const series = pvPowerSeries('2026-06-21', 42, PV_CONFIG, LAT, 15)
    const totalKwh = series.reduce((s, p) => s + p.kw * (15 / 60), 0)
    assert.ok(Math.abs(totalKwh - 42) < 0.05, `erwartet ~42 kWh, bekam ${totalKwh}`)
  })

  it('liefert eine Nullkurve außerhalb der Tageslichtzeit', () => {
    const series = pvPowerSeries('2026-12-21', 8, PV_CONFIG, LAT, 15)
    const nightPoints = series.filter((p) => p.minute < 240 || p.minute > 1200) // vor 4:00 / nach 20:00
    assert.ok(nightPoints.every((p) => p.kw === 0))
  })

  it('Ost-Ausrichtung erzeugt einen früheren Leistungspeak als West', () => {
    const eastOnly = pvPowerSeries('2026-06-21', 20, { eastKwp: 10, westKwp: 0 }, LAT, 5)
    const westOnly = pvPowerSeries('2026-06-21', 20, { eastKwp: 0, westKwp: 10 }, LAT, 5)
    const peak = (series) => series.reduce((max, p) => (p.kw > max.kw ? p : max), series[0])
    assert.ok(peak(eastOnly).minute < peak(westOnly).minute, 'Ost-Peak sollte vor West-Peak liegen')
  })

  it('freeWindowsForDay berücksichtigt Sperrzeiten korrekt (Standard 07-17 Uhr)', () => {
    const free = freeWindowsForDay([{ active: true, startTime: '07:00', endTime: '17:00' }])
    assert.deepEqual(free, [
      { start: 0, end: 420 },
      { start: 1020, end: 1440 },
    ])
  })

  it('freeWindowsForDay ignoriert inaktive Sperrzeiten', () => {
    const free = freeWindowsForDay([{ active: false, startTime: '07:00', endTime: '17:00' }])
    assert.deepEqual(free, [{ start: 0, end: 1440 }])
  })

  it('TEST 12: schlägt niemals ein Ladefenster innerhalb der Sperrzeit vor', () => {
    const series = pvPowerSeries('2026-06-21', 42, PV_CONFIG, LAT, 15)
    const free = freeWindowsForDay([{ active: true, startTime: '07:00', endTime: '17:00' }])
    const win = bestChargingWindow(series, 15, free, 10, 11)
    assert.ok(win.startMin !== null)
    const blockedStart = timeToMinutes('07:00')
    const blockedEnd = timeToMinutes('17:00')
    // das gefundene Fenster darf sich nicht mit der Sperrzeit überschneiden
    const overlaps = win.startMin < blockedEnd && win.endMin > blockedStart
    assert.equal(overlaps, false, `Fenster ${win.startMin}-${win.endMin} überschneidet sich mit Sperrzeit`)
  })

  it('findet ein Ladefenster, das die Zielenergie erreicht, wenn ausreichend PV vorhanden ist', () => {
    const series = pvPowerSeries('2026-06-21', 42, PV_CONFIG, LAT, 15)
    const free = [{ start: 0, end: 1440 }]
    const win = bestChargingWindow(series, 15, free, 15, 11)
    assert.equal(win.reachedTarget, true)
    assert.ok(win.energyKwh >= 15)
  })

  it('meldet reachedTarget=false, wenn das Ziel im Fenster nicht erreichbar ist', () => {
    const series = pvPowerSeries('2026-01-05', 4, PV_CONFIG, LAT, 15) // schlechter Wintertag
    const free = [{ start: 0, end: 1440 }]
    const win = bestChargingWindow(series, 15, free, 30, 11)
    assert.equal(win.reachedTarget, false)
  })

  it('energyInRange summiert Energie korrekt innerhalb der Wallbox-Leistungsgrenze', () => {
    const series = [
      { minute: 0, kw: 20 },
      { minute: 15, kw: 20 },
    ]
    const kwh = energyInRange(series, 15, 11, 0, 30)
    assert.equal(kwh, Number((11 * 0.25 * 2).toFixed(2)))
  })
})
