// Verlauf/Auswertung: reine Zusammenführung der archivierten Tages-Empfehlungen
// (planHistory, siehe storage.js) mit der tatsächlichen SoC-Historie.
//
// Bewusst KEIN automatisches "Plan hat funktioniert / nicht funktioniert"-Urteil
// (Abschnitt 33: nichts erfinden) - die App hat keine Live-Messung, ob wirklich
// geladen wurde. Stattdessen wird nur gezeigt, was empfohlen wurde und welcher
// SoC danach real gemessen wurde, damit der Nutzer selbst beurteilen kann, ob
// der Plan aufgegangen ist.
//
// Reine Funktionen, kein React/IO - direkt mit node:test testbar (siehe
// history.test.mjs).

import { combineDateTime } from './date.js'

/**
 * @typedef {Object} PlanHistoryEntry
 * @property {string} date                          isoDate, für den die Empfehlung galt
 * @property {'CHARGE'|'NO_CHARGE'|'WAIT'} action
 * @property {{start:string, end:string}|null} chargingWindow
 * @property {number} targetSoc
 * @property {'hoch'|'mittel'|'niedrig'} confidence
 * @property {number} pvEstimateKwh
 * @property {string} weatherSummary
 * @property {string} recordedAt                    ISO-Datetime, wann die Empfehlung gespeichert wurde
 */

/**
 * Findet für einen Referenzzeitpunkt (i.d.R. Ende des Ladefensters bzw. Ende
 * des Tages) den zeitlich nächsten SoC-Eintrag DANACH (oder direkt daran) -
 * eine grobe, aber ehrliche Annäherung an "welcher SoC kam dabei heraus",
 * ohne einen echten Ladevorgang zu unterstellen, der so nie gemessen wurde.
 * @param {Date} referenceTime
 * @param {import('./types.js').SocEntry[]} socHistory
 * @param {number} [maxLookaheadHours]  danach gilt kein Eintrag mehr als "Antwort" auf diesen Tag
 */
export function findSocAfter(referenceTime, socHistory, maxLookaheadHours = 36) {
  const candidates = socHistory
    .map((e) => ({ ...e, ts: new Date(e.timestamp) }))
    .filter((e) => e.ts.getTime() >= referenceTime.getTime())
    .sort((a, b) => a.ts.getTime() - b.ts.getTime())
  if (candidates.length === 0) return null
  const closest = candidates[0]
  const hoursAfter = (closest.ts.getTime() - referenceTime.getTime()) / 3600000
  if (hoursAfter > maxLookaheadHours) return null
  return closest
}

/**
 * Reichert archivierte Tages-Empfehlungen um den real gemessenen Folge-SoC an
 * und sortiert neueste zuerst.
 * @param {PlanHistoryEntry[]} planHistory
 * @param {import('./types.js').SocEntry[]} socHistory
 */
export function buildHistoryView(planHistory, socHistory) {
  return [...planHistory]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .map((entry) => {
      const referenceTime =
        entry.action === 'CHARGE' && entry.chargingWindow
          ? combineDateTime(entry.date, entry.chargingWindow.end)
          : combineDateTime(entry.date, '23:59')
      const actual = findSocAfter(referenceTime, socHistory)
      return {
        ...entry,
        actualSocAfter: actual?.soc ?? null,
        actualSocAt: actual?.timestamp ?? null,
      }
    })
}
