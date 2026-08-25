import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { findSocAfter, buildHistoryView } from './history.js'

describe('history / Verlauf & Auswertung', () => {
  it('findSocAfter findet den zeitlich nächsten SoC-Eintrag nach einem Referenzzeitpunkt', () => {
    const socHistory = [
      { id: '1', timestamp: '2026-08-20T08:00:00.000Z', soc: 40 },
      { id: '2', timestamp: '2026-08-20T18:00:00.000Z', soc: 85 },
      { id: '3', timestamp: '2026-08-22T08:00:00.000Z', soc: 60 },
    ]
    const found = findSocAfter(new Date('2026-08-20T17:00:00.000Z'), socHistory)
    assert.equal(found.id, '2')
  })

  it('findSocAfter liefert null, wenn der nächste Eintrag zu weit in der Zukunft liegt', () => {
    const socHistory = [{ id: '1', timestamp: '2026-08-25T08:00:00.000Z', soc: 50 }]
    const found = findSocAfter(new Date('2026-08-20T08:00:00.000Z'), socHistory, 36)
    assert.equal(found, null)
  })

  it('findSocAfter liefert null ohne passenden (zukünftigen) SoC-Eintrag', () => {
    const socHistory = [{ id: '1', timestamp: '2026-08-19T08:00:00.000Z', soc: 50 }]
    const found = findSocAfter(new Date('2026-08-20T08:00:00.000Z'), socHistory)
    assert.equal(found, null)
  })

  it('buildHistoryView ordnet neueste zuerst und ergänzt den real gemessenen Folge-SoC nach Ladefenster-Ende', () => {
    const planHistory = [
      {
        date: '2026-08-18',
        action: 'CHARGE',
        chargingWindow: { start: '13:00', end: '16:00' },
        targetSoc: 90,
        confidence: 'hoch',
        pvEstimateKwh: 30,
        weatherSummary: 'Sehr gute PV-Chance',
        recordedAt: '2026-08-18T06:00:00.000Z',
      },
      {
        date: '2026-08-19',
        action: 'NO_CHARGE',
        chargingWindow: null,
        targetSoc: 60,
        confidence: 'mittel',
        pvEstimateKwh: 12,
        weatherSummary: 'PV schwach',
        recordedAt: '2026-08-19T06:00:00.000Z',
      },
    ]
    const socHistory = [
      { id: 'a', timestamp: '2026-08-18T16:30:00', soc: 91 },
      { id: 'b', timestamp: '2026-08-18T09:00:00', soc: 45 },
    ]
    const view = buildHistoryView(planHistory, socHistory)
    assert.equal(view[0].date, '2026-08-19', 'neuestes Datum zuerst')
    assert.equal(view[1].date, '2026-08-18')
    assert.equal(view[1].actualSocAfter, 91, 'nimmt den SoC-Eintrag nach Ladefenster-Ende (16:00), nicht den davor (09:00)')
    assert.equal(view[0].actualSocAfter, null, 'kein SoC-Eintrag nach dem 19.8. vorhanden')
  })

  it('buildHistoryView nutzt bei NO_CHARGE-Tagen das Tagesende als Referenzzeitpunkt', () => {
    const planHistory = [
      {
        date: '2026-08-19',
        action: 'NO_CHARGE',
        chargingWindow: null,
        targetSoc: 60,
        confidence: 'mittel',
        pvEstimateKwh: 12,
        weatherSummary: 'PV schwach',
        recordedAt: '2026-08-19T06:00:00.000Z',
      },
    ]
    const socHistory = [
      { id: 'x', timestamp: '2026-08-19T10:00:00', soc: 55 }, // vor Tagesende, darf nicht genommen werden
      { id: 'y', timestamp: '2026-08-20T05:00:00', soc: 50 }, // nach Tagesende, innerhalb 36h
    ]
    const view = buildHistoryView(planHistory, socHistory)
    assert.equal(view[0].actualSocAfter, 50)
  })
})
