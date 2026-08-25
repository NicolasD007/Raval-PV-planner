import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { estimateConsumption, buildIntervals, entryStatus } from './consumption.js'

function entry(id, timestamp, soc, flags = {}) {
  return { id, timestamp, soc, externalCharge: false, homeCharge: false, note: '', ...flags }
}

describe('consumption / SoC-Lernfunktion', () => {
  it('TEST 6: externe Zwischenladung wird vom Verbrauchsintervall ausgeschlossen, SoC bleibt aber aktuell', () => {
    const entries = [
      entry('1', '2026-08-17T08:00:00', 80), // Mo
      entry('2', '2026-08-18T08:00:00', 72, { externalCharge: true, note: 'extern zwischengeladen' }), // Di
      entry('3', '2026-08-19T08:00:00', 65), // Mi
    ]
    const intervals = buildIntervals(entries)
    assert.equal(entryStatus(entries[1]), 'ausgeschlossen')
    // Intervall 1->2 darf nicht für die Schätzung verwendet werden
    assert.equal(intervals[0].usableForEstimate, false)
    assert.ok(intervals[0].reasons.includes('extern zwischengeladen'))
    // Intervall 2->3 ist ein normaler Verbrauchsverlauf und bleibt nutzbar
    assert.equal(intervals[1].usableForEstimate, true)
    // der aktuelle SoC (jüngster Eintrag) bleibt unabhängig davon 65 %
    const latest = [...entries].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0]
    assert.equal(latest.soc, 65)
  })

  it('liefert bei zu wenigen Datenpunkten eine Unsicherheits-Meldung statt einer Zahl', () => {
    const entries = [entry('1', '2026-08-17T08:00:00', 80), entry('2', '2026-08-19T08:00:00', 70)]
    const result = estimateConsumption(entries, { now: new Date('2026-08-20T12:00:00') })
    assert.equal(result.hasEnoughData, false)
    assert.match(result.message, /zu wenige Daten/)
    assert.equal(result.weeklyPercent, null)
  })

  it('berechnet Werktags- und Wochenendrate getrennt und liefert Ø Wochenverbrauch', () => {
    // Werktags-Intervalle (jeweils jeden Tag ca. 5%): Mo->Di->Mi->Do->Fr
    // Wochenend-Intervall: Fr->Sa (rein Wochenende, hier bewusst NICHT über die Grenze hinweg)
    const entries = [
      entry('1', '2026-08-17T08:00:00', 90), // Mo
      entry('2', '2026-08-18T08:00:00', 85), // Di  (-5/1d)
      entry('3', '2026-08-19T08:00:00', 80), // Mi  (-5/1d)
      entry('4', '2026-08-20T08:00:00', 76), // Do  (-4/1d)
      entry('5', '2026-08-21T08:00:00', 71), // Fr  (-5/1d)
      entry('6', '2026-08-22T08:00:00', 68), // Sa  (-3/1d, Wochenende, aber gemischt Fr->Sa? Fr ist Werktag -> mixed)
      entry('7', '2026-08-23T08:00:00', 65), // So  (-3/1d, Sa->So = reines Wochenende)
    ]
    const result = estimateConsumption(entries, { now: new Date('2026-08-24T08:00:00') })
    assert.equal(result.hasEnoughData, true)
    // 4 reine Werktagsintervalle (Mo-Di, Di-Mi, Mi-Do, Do-Fr), 1 reines Wochenendintervall (Sa-So)
    assert.equal(result.weekdayValidCount, 4)
    assert.equal(result.weekendValidCount, 1)
    assert.ok(result.weekdayRatePct > 0)
    assert.ok(result.weekendRatePct > 0)
    assert.equal(result.weeklyPercent, Number((result.weekdayRatePct * 5 + result.weekendRatePct * 2).toFixed(10)))
    assert.match(result.message, /Ø Wochenverbrauch/)
  })

  it('erkennt und ignoriert Ausreißer relativ zum Median', () => {
    const entries = [
      entry('1', '2026-08-17T08:00:00', 100), // Mo
      entry('2', '2026-08-18T08:00:00', 95), // Di (-5/1d)
      entry('3', '2026-08-19T08:00:00', 90), // Mi (-5/1d)
      entry('4', '2026-08-20T08:00:00', 85), // Do (-5/1d)
      entry('5', '2026-08-21T08:00:00', 35), // Fr (-50/1d -> klarer Ausreißer, >2x Median)
    ]
    const result = estimateConsumption(entries, { now: new Date('2026-08-24T08:00:00') })
    // Der 50%-Ausreißer darf die Schätzung nicht dominieren
    assert.ok(result.weekdayRatePct < 10, `erwartet robusten Wert, bekam ${result.weekdayRatePct}`)
    assert.equal(result.outlierCount, 1)
  })

  it('unklarer SoC-Anstieg ohne Ladeereignis wird nicht als Verbrauch gewertet', () => {
    const entries = [
      entry('1', '2026-08-17T08:00:00', 60),
      entry('2', '2026-08-18T08:00:00', 75), // SoC gestiegen, aber keine Lade-Flags gesetzt
    ]
    const intervals = buildIntervals(entries)
    assert.equal(intervals[0].usableForEstimate, false)
    assert.ok(intervals[0].reasons.some((r) => r.includes('unklarer Datenzusammenhang')))
  })
})
