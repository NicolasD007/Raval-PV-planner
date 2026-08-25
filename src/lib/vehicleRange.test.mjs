import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { estimateRangeKm } from './vehicleRange.js'

const VEHICLE = { batteryCapacityKwh: 52, assumedConsumptionKwhPer100km: 16.5 }

describe('vehicleRange', () => {
  it('berechnet die Reichweite proportional zum SoC', () => {
    const half = estimateRangeKm(50, VEHICLE)
    const full = estimateRangeKm(100, VEHICLE)
    assert.ok(Math.abs(full - half * 2) <= 1)
  })

  it('liefert 0 bei 0 % SoC', () => {
    assert.equal(estimateRangeKm(0, VEHICLE), 0)
  })

  it('liefert 0 statt einer Division-durch-0-Verzerrung, wenn keine Verbrauchsannahme hinterlegt ist', () => {
    assert.equal(estimateRangeKm(80, { batteryCapacityKwh: 52, assumedConsumptionKwhPer100km: 0 }), 0)
  })

  it('plausibler Bereich für ein 52-kWh-Fahrzeug bei voller Ladung (keine exakte Kalibrierung, nur grobe Sanity-Prüfung)', () => {
    const full = estimateRangeKm(100, VEHICLE)
    assert.ok(full > 250 && full < 400, `unerwarteter Wert: ${full} km`)
  })
})
