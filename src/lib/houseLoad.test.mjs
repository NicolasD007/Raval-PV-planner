import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { heatPumpKwhForTemp, estimateHouseLoadKwh, HEATING_BASE_TEMP_C, ASSUMED_WINTER_MEAN_TEMP_C } from './houseLoad.js'

const HEAT_PUMP = { winterKwhPerDay: 16, summerKwhPerDay: 3.29 }
const SETUP = {
  household: { winterKwhPerDay: 7.7, summerKwhPerDay: 4.0 },
  heatPump: { active: true, winterKwhPerDay: 16, summerKwhPerDay: 3.29 },
}

describe('houseLoad / temperaturabhängige Wärmepumpe', () => {
  it('liefert bei der angenommenen Winter-Referenztemperatur ungefähr den Winter-Stufenwert', () => {
    const kwh = heatPumpKwhForTemp(ASSUMED_WINTER_MEAN_TEMP_C, HEAT_PUMP)
    assert.ok(Math.abs(kwh - HEAT_PUMP.winterKwhPerDay) < 0.01)
  })

  it('sinkt auf den Sommer-Sockelwert, sobald die Tagesmitteltemperatur die Heizgrenze erreicht', () => {
    const atBase = heatPumpKwhForTemp(HEATING_BASE_TEMP_C, HEAT_PUMP)
    assert.equal(atBase, HEAT_PUMP.summerKwhPerDay)
    // auch deutlich darüber (Hochsommer) nicht unter den Sockel fallen
    const hot = heatPumpKwhForTemp(28, HEAT_PUMP)
    assert.equal(hot, HEAT_PUMP.summerKwhPerDay)
  })

  it('steigt monoton, je kälter es wird', () => {
    const mild = heatPumpKwhForTemp(10, HEAT_PUMP)
    const cold = heatPumpKwhForTemp(0, HEAT_PUMP)
    const veryCold = heatPumpKwhForTemp(-10, HEAT_PUMP)
    assert.ok(mild < cold)
    assert.ok(cold < veryCold)
  })

  it('extrapoliert bei extremer Kälte nicht unbegrenzt, sondern deckelt bei 1.6x des Winterwerts', () => {
    const extreme = heatPumpKwhForTemp(-40, HEAT_PUMP)
    assert.equal(extreme, Number((HEAT_PUMP.winterKwhPerDay * 1.6).toFixed(2)))
  })

  it('estimateHouseLoadKwh: nutzt die Temperatur, wenn eine Prognose vorliegt', () => {
    const coldWinterDay = estimateHouseLoadKwh('2026-01-15', -5, SETUP)
    const mildWinterDay = estimateHouseLoadKwh('2026-01-16', 8, SETUP)
    assert.ok(coldWinterDay > mildWinterDay, 'ein kälterer Tag muss mehr Wärmepumpen-Last ergeben als ein milderer')
  })

  it('estimateHouseLoadKwh: fällt ohne Temperaturprognose auf den bisherigen festen Saison-Stufenwert zurück', () => {
    const winterNoTemp = estimateHouseLoadKwh('2026-01-15', null, SETUP)
    assert.equal(winterNoTemp, Number((SETUP.household.winterKwhPerDay + SETUP.heatPump.winterKwhPerDay).toFixed(2)))

    const summerNoTemp = estimateHouseLoadKwh('2026-07-15', undefined, SETUP)
    assert.equal(summerNoTemp, Number((SETUP.household.summerKwhPerDay + SETUP.heatPump.summerKwhPerDay).toFixed(2)))
  })

  it('estimateHouseLoadKwh: inaktive Wärmepumpe bleibt 0, unabhängig von der Temperatur', () => {
    const setupInactive = { ...SETUP, heatPump: { ...SETUP.heatPump, active: false } }
    const kwh = estimateHouseLoadKwh('2026-01-15', -10, setupInactive)
    assert.equal(kwh, setupInactive.household.winterKwhPerDay)
  })
})
