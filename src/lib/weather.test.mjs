import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  radiationToPvKwh,
  combineModelEstimates,
  classifyDay,
  parseForecastResponse,
  WEATHER_MODELS,
} from './weather.js'

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
    const consistent = combineModelEstimates([40, 41, 39, 40, 42], 10, 5)
    const scattered = combineModelEstimates([10, 45, 15, 50, 5], 10, 5)
    assert.equal(consistent.confidence, 'hoch')
    assert.notEqual(scattered.confidence, 'hoch')
    assert.ok(scattered.sourceAgreement < consistent.sourceAgreement)
  })

  it('gelockerte Schwellenwerte: stärkere Modellstreuung (typisch für mehrtägige Strahlungsprognosen) gilt jetzt als "mittel" statt "niedrig"', () => {
    // Streuung mit Variationskoeffizient ~48% - realistisch für 3-5 Tage vorausliegende
    // Strahlungsprognosen zwischen ECMWF/GFS/ICON/UKMO/Météo-France, auch bei insgesamt
    // stabilem Wetter. Mit den ursprünglichen, strengeren Schwellen (mittel erst ab
    // sourceAgreement>=0.6, hier aber nur 0.52) wäre das noch "niedrig" gewesen - dieser
    // Test belegt die bewusste Lockerung (mittel jetzt schon ab sourceAgreement>=0.35).
    const moderatelyScattered = combineModelEstimates([20, 35, 15, 40, 10], 10, 5)
    assert.equal(moderatelyScattered.confidence, 'mittel')
    assert.notEqual(moderatelyScattered.confidence, 'niedrig')
  })

  it('reduziert die Sicherheit, wenn weniger Modelle antworten als angefragt (auch bei perfekter Übereinstimmung)', () => {
    // Nur 2 von 5 angefragten Modellen haben tatsächlich Daten geliefert.
    const result = combineModelEstimates([40, 40], 10, 5)
    assert.notEqual(result.confidence, 'hoch')
  })

  it('berechnet den PV-Überschuss als Differenz zu Hausverbrauch, nie negativ', () => {
    const result = combineModelEstimates([5, 4, 6, 5, 5], 20, 5)
    assert.equal(result.pvSurplusEstimateKwh, 0)
  })

  it('ein Gewittercode überschreibt die reine kWh-Einstufung (Bugfix: "immer Sonne")', () => {
    // Ordentliche Tagesstrahlungssumme, aber Gewitter am Nachmittag laut Wettercode.
    const stormy = classifyDay({ pvEstimateKwh: 32, confidence: 'hoch', worstWeatherCode: 95, precipitationMm: 8 })
    assert.equal(stormy.icon, '⛈️')
    assert.match(stormy.label, /Gewitter/)

    const clear = classifyDay({ pvEstimateKwh: 32, confidence: 'hoch', worstWeatherCode: 0, precipitationMm: 0 })
    assert.equal(clear.icon, '☀️')
  })

  it('markiert unsichere Prognosen sichtbar', () => {
    const { label } = classifyDay({ pvEstimateKwh: 35, confidence: 'niedrig', worstWeatherCode: 0, precipitationMm: 0 })
    assert.match(label, /unsicher/)
  })

  describe('parseForecastResponse (synthetische Open-Meteo-Antwort, kein Netzwerk)', () => {
    const times = ['2026-08-28T12:00', '2026-08-28T13:00', '2026-08-29T12:00', '2026-08-29T13:00']

    it('nutzt für den Konsens nur Modelle, deren modell-spezifische Serie tatsächlich vorhanden ist', () => {
      const hourly = {
        time: times,
        // Nur 2 von 5 Modellen liefern eine eigene Serie - die anderen 3 fehlen bewusst.
        [`shortwave_radiation_${WEATHER_MODELS[0].id}`]: [400, 420, 100, 90],
        [`shortwave_radiation_${WEATHER_MODELS[1].id}`]: [410, 430, 110, 95],
      }
      const days = parseForecastResponse({ hourly }, PV_CONFIG, () => 10)
      assert.equal(days[0].modelsUsed, 2, 'darf nicht auf 5 Modelle "aufgefüllt" werden, die es nicht gibt')
    })

    it('erkennt ein Gewitter am zweiten Tag über den Wettercode, auch wenn die Strahlung ordentlich ist', () => {
      const hourly = {
        time: times,
        [`shortwave_radiation_${WEATHER_MODELS[0].id}`]: [1200, 1150, 480, 470],
        weathercode: [1, 1, 95, 96], // Tag 1 klar, Tag 2 Gewitter
        precipitation: [0, 0, 6, 4],
      }
      const days = parseForecastResponse({ hourly }, PV_CONFIG, () => 5)
      assert.equal(days[0].icon, '☀️')
      assert.equal(days[1].icon, '⛈️')
      assert.match(days[1].summary, /Gewitter/)
    })

    it('extrahiert Sonnenstunden, Temperaturspanne und Niederschlagsmenge pro Tag', () => {
      const hourly = {
        time: times,
        [`shortwave_radiation_${WEATHER_MODELS[0].id}`]: [400, 420, 100, 90],
        [`shortwave_radiation_${WEATHER_MODELS[1].id}`]: [410, 430, 110, 95],
        [`temperature_2m_${WEATHER_MODELS[0].id}`]: [18, 22, 5, 8],
        [`temperature_2m_${WEATHER_MODELS[1].id}`]: [19, 24, 4, 9],
        [`sunshine_duration_${WEATHER_MODELS[0].id}`]: [1800, 3600, 0, 0], // Sekunden
        [`sunshine_duration_${WEATHER_MODELS[1].id}`]: [1800, 3600, 0, 600],
        precipitation: [0, 0, 3, 2],
      }
      const days = parseForecastResponse({ hourly }, PV_CONFIG, () => 5)

      // Tag 1: 18-24°C über beide Modelle, je 1.5h Sonne (5400s/2/3600 = 1.5h)
      assert.equal(days[0].tempMinC, 18)
      assert.equal(days[0].tempMaxC, 24)
      assert.equal(days[0].sunHours, 1.5)
      assert.equal(days[0].precipitationMm, 0)

      // Tag 2: 4-9°C, kaum Sonne, 5mm Regen (Summe über beide Stunden: 3+2)
      assert.equal(days[1].tempMinC, 4)
      assert.equal(days[1].tempMaxC, 9)
      assert.equal(days[1].precipitationMm, 5)
    })

    it('liefert null statt erfundener Werte, wenn die API keine Temperatur-/Sonnenscheinserie enthält', () => {
      const hourly = {
        time: times,
        [`shortwave_radiation_${WEATHER_MODELS[0].id}`]: [400, 420, 100, 90],
      }
      const days = parseForecastResponse({ hourly }, PV_CONFIG, () => 5)
      assert.equal(days[0].tempMinC, null)
      assert.equal(days[0].tempMaxC, null)
      assert.equal(days[0].sunHours, null)
    })
  })
})
