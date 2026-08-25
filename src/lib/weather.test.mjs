import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { radiationToPvKwh, combineModelEstimates, summaryForConfidence } from './weather.js'

const PV_CONFIG = { totalKwp: 16.1 }

describe('weather / PV-Konsens', () => {
  it('radiationToPvKwh liefert 0 für eine Nacht ohne Einstrahlung', () => {
    const hours = new Array(24).fill(0)
    assert.equal(radiationToPvKwh(hours, PV_CONFIG), 0)
  })

  it('radiationToPvKwh skaliert linear mit der Anlagengröße', () => {
    const hours = new Array(24).fill(200) // 200 W/m² über 24h, unrealistisch aber gut zum Testen
    const small = radiationToPvKwh(hours, { totalKwp: 5 })
    const big = radiationToPvKwh(hours, { totalKwp: 10 })
    assert.ok(Math.abs(big - small * 2) < 0.01)
  })

  it('TEST 10: stark abweichende Wetterquellen senken die Prognosesicherheit auf mittel/niedrig', () => {
    const consistent = combineModelEstimates([40, 41, 39, 40, 42], 10)
    const scattered = combineModelEstimates([10, 45, 15, 50, 5], 10)
    assert.equal(consistent.confidence, 'hoch')
    assert.notEqual(scattered.confidence, 'hoch')
    assert.ok(scattered.sourceAgreement < consistent.sourceAgreement)
  })

  it('berechnet den PV-Überschuss als Differenz zu Hausverbrauch, nie negativ', () => {
    const result = combineModelEstimates([5, 4, 6, 5, 5], 20)
    assert.equal(result.pvSurplusEstimateKwh, 0)
  })

  it('summaryForConfidence markiert unsichere Prognosen sichtbar', () => {
    const { label } = summaryForConfidence(35, 'niedrig')
    assert.match(label, /unsicher/)
  })
})
