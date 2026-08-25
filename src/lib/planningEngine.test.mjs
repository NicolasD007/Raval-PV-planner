import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { planWeek, carAvailablePvKwh } from './planningEngine.js'
import { estimateConsumption } from './consumption.js'
import { DEFAULT_SETUP } from './types.js'
import { addDays } from './date.js'

const CONSUMPTION = { weekdayRatePct: 5, weekendRatePct: 3 }

function weatherDay(date, pvSurplusEstimateKwh, confidence = 'hoch') {
  return {
    date,
    summary: '',
    icon: '☀️',
    pvEstimateKwh: pvSurplusEstimateKwh + 8,
    pvSurplusEstimateKwh,
    confidence,
    sourceAgreement: confidence === 'hoch' ? 0.9 : 0.5,
    stale: false,
  }
}

function week(today, pvByOffset) {
  return pvByOffset.map((pv, i) => weatherDay(addDays(today, i), pv))
}

function baseInput(overrides = {}) {
  return {
    today: overrides.today,
    currentSoc: overrides.currentSoc,
    currentSocDate: overrides.currentSocDate ?? overrides.today,
    consumption: overrides.consumption ?? CONSUMPTION,
    weatherDays: overrides.weatherDays,
    availabilityBlocks: overrides.availabilityBlocks ?? [],
    chargingGoals: overrides.chargingGoals ?? [],
    setup: DEFAULT_SETUP,
  }
}

describe('planningEngine / planWeek', () => {
  it('TEST 1: SoC 80%, gute PV-Woche, keine Termine -> kein unnötiges Laden', () => {
    const today = '2026-08-21' // Freitag: Wochenendziel bereits erfüllt
    const result = planWeek(
      baseInput({
        today,
        currentSoc: 80,
        weatherDays: week(today, [25, 25, 25, 25, 25, 25, 25]),
      })
    )
    assert.equal(result.weekMessage, 'Diese Woche nicht laden.')
    assert.ok(result.days.every((d) => d.action === 'NO_CHARGE'))
    assert.equal(result.todayHeadline.action, 'NICHT_LADEN')
  })

  it('TEST 2: SoC 42%, schlechte Folgetage -> laden', () => {
    const today = '2026-08-17' // Montag
    const result = planWeek(
      baseInput({
        today,
        currentSoc: 42,
        weatherDays: week(today, [5, 4, 3, 3, 4, 6, 6]),
      })
    )
    const chargeDays = result.days.filter((d) => d.action === 'CHARGE')
    assert.ok(chargeDays.length >= 1, 'es sollte mindestens ein Ladetag geplant werden')
    assert.equal(chargeDays[0].date, today, 'muss so früh wie möglich laden, da die 40%-Reserve sonst unterschritten wird')
  })

  it('TEST 3: SoC 70%, Dienstag sehr gute PV, Mittwoch schlecht -> Dienstag laden', () => {
    const today = '2026-08-17' // Montag
    const result = planWeek(
      baseInput({
        today,
        currentSoc: 70,
        weatherDays: week(today, [8, 30, 3, 10, 10, 15, 15]), // Mo Di Mi Do Fr Sa So
      })
    )
    const tuesday = result.days.find((d) => d.date === '2026-08-18')
    const wednesday = result.days.find((d) => d.date === '2026-08-19')
    assert.equal(tuesday.action, 'CHARGE')
    assert.equal(wednesday.action, 'NO_CHARGE')
  })

  it('TEST 4: Donnerstag Ziel 100%, Mittwoch 07-17 gesperrt, Dienstag gute PV -> Dienstag laden', () => {
    const today = '2026-08-17' // Montag
    const result = planWeek(
      baseInput({
        today,
        currentSoc: 65,
        weatherDays: week(today, [8, 35, 5, 6, 10, 10, 10]),
        chargingGoals: [{ id: 'g1', date: '2026-08-20', targetSoc: 100, active: true }], // Donnerstag
        availabilityBlocks: [{ id: 'b1', date: '2026-08-19', startTime: '07:00', endTime: '17:00', active: true }],
      })
    )
    const tuesday = result.days.find((d) => d.date === '2026-08-18')
    const wednesday = result.days.find((d) => d.date === '2026-08-19')
    assert.equal(tuesday.action, 'CHARGE')
    assert.equal(tuesday.source, 'termin')
    assert.equal(wednesday.action, 'NO_CHARGE')
  })

  it('TEST 5: Donnerstag Ziel 100%, Donnerstag selbst gesperrt + schlechtes PV, Mittwoch gute PV -> Mittwoch laden', () => {
    const today = '2026-08-18' // Dienstag
    const result = planWeek(
      baseInput({
        today,
        currentSoc: 65,
        weatherDays: week(today, [8, 35, 4, 10, 10]), // Di Mi Do Fr Sa
        chargingGoals: [{ id: 'g1', date: '2026-08-20', targetSoc: 100, active: true }], // Donnerstag
        availabilityBlocks: [{ id: 'b1', date: '2026-08-20', startTime: '07:00', endTime: '17:00', active: true }],
      })
    )
    const wednesday = result.days.find((d) => d.date === '2026-08-19')
    const thursday = result.days.find((d) => d.date === '2026-08-20')
    assert.equal(wednesday.action, 'CHARGE')
    assert.equal(thursday.action, 'NO_CHARGE')
  })

  it('TEST 6 (Integration): externe Zwischenladung fließt über die Verbrauchsschätzung korrekt in die Planung ein', () => {
    const today = '2026-08-24' // Montag
    const socHistory = [
      { id: '1', timestamp: '2026-08-17T08:00:00', soc: 90, externalCharge: false, homeCharge: false },
      { id: '2', timestamp: '2026-08-18T08:00:00', soc: 82, externalCharge: false, homeCharge: false }, // -8/1d
      { id: '3', timestamp: '2026-08-19T08:00:00', soc: 95, externalCharge: true, note: 'extern zwischengeladen' },
      { id: '4', timestamp: '2026-08-20T08:00:00', soc: 88, externalCharge: false, homeCharge: false }, // -7/1d, ok
      { id: '5', timestamp: '2026-08-21T08:00:00', soc: 80, externalCharge: false, homeCharge: false }, // -8/1d
    ]
    const learned = estimateConsumption(socHistory, { now: new Date('2026-08-24T08:00:00') })
    // Das Intervall über die externe Ladung darf NICHT eingerechnet sein
    assert.equal(learned.intervals[1].usableForEstimate, false)
    const result = planWeek(
      baseInput({
        today,
        currentSoc: 80,
        consumption: { weekdayRatePct: learned.weekdayRatePct ?? 5, weekendRatePct: learned.weekendRatePct ?? 3 },
        weatherDays: week(today, [20, 20, 20, 20, 20, 20, 20]),
      })
    )
    assert.ok(result.days.length > 0) // Planung läuft mit dem bereinigten Wert durch, ohne Absturz/NaN
    assert.ok(!Number.isNaN(learned.weekdayRatePct))
  })

  it('TEST 7: 80%-Wochenendziel, aktueller SoC 60% -> Ladeplanung vor Freitag', () => {
    const today = '2026-08-17' // Montag
    const result = planWeek(
      baseInput({
        today,
        currentSoc: 60,
        weatherDays: week(today, [20, 20, 20, 20, 20, 15, 15]),
      })
    )
    const chargeDays = result.days.filter((d) => d.action === 'CHARGE')
    assert.ok(chargeDays.length >= 1)
    assert.ok(chargeDays.every((d) => d.date <= '2026-08-21'), 'Ladung muss spätestens Freitag stattfinden')
  })

  it('TEST 8: aktueller SoC 85%, kein Bedarf -> "Diese Woche nicht laden"', () => {
    const today = '2026-08-21' // Freitag
    const result = planWeek(
      baseInput({
        today,
        currentSoc: 85,
        weatherDays: week(today, [20, 20, 20, 20, 20, 20, 20]),
      })
    )
    assert.equal(result.weekMessage, 'Diese Woche nicht laden.')
    assert.equal(result.todayHeadline.subtitle, 'Diese Woche nicht laden')
  })

  it('TEST 9: Hausspeicher würde unter 70% fallen -> Auto-Ladung nicht einfach aus der PV-Rohschätzung ableiten', () => {
    // pvSurplusEstimateKwh liegt UNTER der Speicher-Vorrangreserve -> für das Auto bleibt nichts.
    const day = weatherDay('2026-08-17', 2) // 2 kWh Überschuss, Reserve ist 3 kWh
    assert.equal(carAvailablePvKwh(day, DEFAULT_SETUP.houseBattery), 0)

    // Bei ausreichendem Überschuss bleibt nach Abzug der Reserve ein Rest fürs Auto übrig.
    const goodDay = weatherDay('2026-08-17', 10)
    assert.equal(carAvailablePvKwh(goodDay, DEFAULT_SETUP.houseBattery), 7)
  })

  it('TEST 10: stark abweichende Wetterquellen -> confidence mittel/niedrig fließt in den Plan durch', () => {
    const today = '2026-08-17'
    const result = planWeek(
      baseInput({
        today,
        currentSoc: 60,
        weatherDays: [weatherDay(today, 25, 'niedrig'), ...week(addDays(today, 1), [20, 20, 20, 20, 20, 20])],
      })
    )
    const todayPlan = result.days.find((d) => d.date === today)
    if (todayPlan.action === 'CHARGE') {
      assert.notEqual(todayPlan.confidence, 'hoch')
    }
  })

  it('TEST 11: neuer SoC eingegeben -> Planung wird ohne verstecktes Zwischenspeichern sofort neu berechnet', () => {
    const today = '2026-08-21' // Freitag: Wochenendziel ist an diesem Tag selbst kein Störfaktor
    const weatherDays = week(today, [20, 20, 20, 20, 20, 20, 20])
    // Gleiche Eingaben bis auf den SoC - das allein muss das Ergebnis kippen, ohne
    // dass irgendein Zustand aus einem vorherigen Aufruf "nachwirkt".
    const resultHighSoc = planWeek(baseInput({ today, currentSoc: 90, weatherDays }))
    const resultLowSoc = planWeek(baseInput({ today, currentSoc: 20, weatherDays }))
    assert.equal(resultHighSoc.weekMessage, 'Diese Woche nicht laden.')
    assert.ok(resultLowSoc.days.some((d) => d.action === 'CHARGE'), 'bei SoC 20% muss sofort neu geplant werden')
    assert.equal(resultLowSoc.days.find((d) => d.date === today).action, 'CHARGE', 'die 40%-Reserve ist schon unterschritten -> heute laden')
  })

  it('TEST 12: eine komplett gesperrte Sperrzeit führt nie zu einem Ladefenster an diesem Tag', () => {
    const today = '2026-08-17'
    const result = planWeek(
      baseInput({
        today,
        currentSoc: 45,
        weatherDays: week(today, [4, 4, 4, 4, 4, 4, 4]),
        availabilityBlocks: [{ id: 'b1', date: today, startTime: '00:00', endTime: '23:59', active: true }],
      })
    )
    const todayPlan = result.days.find((d) => d.date === today)
    assert.equal(todayPlan.chargingWindow, null, 'an einem komplett gesperrten Tag darf kein Fenster vorgeschlagen werden')
  })
})
