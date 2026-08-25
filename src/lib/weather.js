// Wetter-/PV-Prognose: 5-Modell-Konsens über die Open-Meteo-API (kostenlos, ohne
// API-Key, CORS-fähig -> passt zum reinen Client-seitigen GitHub-Pages-Deployment,
// siehe README/"WICHTIG"-Abschnitt zur Anbieterfrage).
//
// Die reine Rechenlogik (Strahlung -> PV-kWh, Konsensbildung, Konfidenz,
// Tages-Icon/-Text) ist von der eigentlichen HTTP-Anfrage getrennt und dadurch
// ohne Netzwerk testbar (siehe weather.test.mjs). fetchWeatherWeek() macht
// wirklich nur noch fetch()+json() - der Rest läuft über parseForecastResponse(),
// die man mit einer synthetischen Antwort direkt testen kann.
 
const OPEN_METEO_BASE = 'https://api.open-meteo.com/v1/forecast'
 
export const WEATHER_MODELS = [
  { id: 'icon_seamless', label: 'DWD ICON' },
  { id: 'ecmwf_ifs025', label: 'ECMWF IFS' },
  { id: 'gfs_seamless', label: 'NOAA GFS' },
  { id: 'meteofrance_seamless', label: 'Météo-France' },
  { id: 'ukmo_seamless', label: 'UK Met Office' },
]
 
/** Performance Ratio: Wirkungsgradverlust durch Wechselrichter, Temperatur, Verkabelung etc. */
const PERFORMANCE_RATIO = 0.8
 
/**
 * Rechnet stündliche Globalstrahlungswerte (W/m², wie von Open-Meteo geliefert)
 * eines Tages in eine PV-Ertragsschätzung (kWh) um. Vereinfachtes, aber
 * deterministisches "spezifischer Ertrag"-Modell.
 * @param {number[]} hourlyGhiWm2  24 Stundenwerte eines Kalendertages
 * @param {{ totalKwp: number }} pvConfig
 */
export function radiationToPvKwh(hourlyGhiWm2, pvConfig) {
  const whPerM2 = hourlyGhiWm2.reduce((s, v) => s + Math.max(0, v), 0) // W/m² * 1h = Wh/m²
  const kwhPerM2 = whPerM2 / 1000
  // Referenz: 1 kWp liefert bei 1 kWh/m² Einstrahlung (Standardbedingung) ~1 kWh,
  // multipliziert mit der realen Performance Ratio.
  return Number((kwhPerM2 * pvConfig.totalKwp * PERFORMANCE_RATIO).toFixed(2))
}
 
/**
 * Bildet aus den Tages-PV-Schätzungen mehrerer Wettermodelle einen kombinierten
 * Tageswert inkl. Prognosesicherheit (Abschnitt 12: "eine kombinierte Prognose
 * pro Tag", Modelle nur intern zur Konsensbildung).
 * @param {number[]} pvKwhByModel  ein Wert pro tatsächlich verfügbarem Modell (gleicher Tag)
 * @param {number} houseLoadKwh    erwarteter Haus- + Wärmepumpenverbrauch an diesem Tag
 * @param {number} [modelsExpected] wie viele Modelle angefragt wurden (für die Sicherheits-Einschätzung)
 */
export function combineModelEstimates(pvKwhByModel, houseLoadKwh, modelsExpected = pvKwhByModel.length) {
  const n = pvKwhByModel.length
  const mean = n > 0 ? pvKwhByModel.reduce((s, v) => s + v, 0) / n : 0
  const variance = n > 0 ? pvKwhByModel.reduce((s, v) => s + (v - mean) ** 2, 0) / n : 0
  const stdDev = Math.sqrt(variance)
  const coeffOfVariation = mean > 0 ? stdDev / mean : 0
  // Je größer die Streuung zwischen den Modellen, desto niedriger die Sicherheit.
  let sourceAgreement = Number(Math.max(0, 1 - coeffOfVariation).toFixed(2))
 
  // Kamen weniger Modelle zurück als angefragt (z.B. weil die API für ein Modell
  // an diesem Standort/Zeitpunkt keine Daten liefert), ist der "Konsens" weniger
  // aussagekräftig - Sicherheit wird zusätzlich gedeckelt, statt so zu tun, als
  // hätten alle 5 Quellen übereingestimmt.
  if (modelsExpected > 0 && n < modelsExpected) {
    const completeness = n / modelsExpected
    sourceAgreement = Number(Math.min(sourceAgreement, 0.6 * completeness + 0.3).toFixed(2))
  }
  if (n <= 1) sourceAgreement = Math.min(sourceAgreement, 0.5)
 
  let confidence = 'niedrig'
  if (sourceAgreement >= 0.85) confidence = 'hoch'
  else if (sourceAgreement >= 0.6) confidence = 'mittel'
 
  const pvEstimateKwh = Number(mean.toFixed(1))
  const pvSurplusEstimateKwh = Number(Math.max(0, mean - houseLoadKwh).toFixed(1))
 
  return { pvEstimateKwh, pvSurplusEstimateKwh, confidence, sourceAgreement }
}
 
// WMO-Wettercodes (von Open-Meteo verwendet) grob nach Schweregrad gruppiert.
// Reihenfolge wichtig: spätere Einträge "gewinnen" bei gleichzeitig auftretenden Codes.
const SEVERITY_TIERS = [
  { test: (c) => c === 0, tier: 0, icon: '☀️', label: 'Klar' },
  { test: (c) => c >= 1 && c <= 2, tier: 1, icon: '🌤️', label: 'Leicht bewölkt' },
  { test: (c) => c === 3, tier: 2, icon: '⛅', label: 'Bewölkt' },
  { test: (c) => c === 45 || c === 48, tier: 3, icon: '🌫️', label: 'Nebel' },
  { test: (c) => c >= 51 && c <= 57, tier: 3, icon: '🌦️', label: 'Nieselregen' },
  { test: (c) => (c >= 61 && c <= 67) || (c >= 80 && c <= 82), tier: 4, icon: '🌧️', label: 'Regen' },
  { test: (c) => (c >= 71 && c <= 77) || c === 85 || c === 86, tier: 4, icon: '🌨️', label: 'Schnee' },
  { test: (c) => c === 95 || c === 96 || c === 99, tier: 5, icon: '⛈️', label: 'Gewitter möglich' },
]
 
function classifyWeatherCode(code) {
  let best = SEVERITY_TIERS[0]
  for (const t of SEVERITY_TIERS) {
    if (t.test(code) && t.tier >= best.tier) best = t
  }
  return best
}
 
/**
 * Kombiniert PV-Ertragsschätzung mit tatsächlichem Wettercode/Niederschlag zu
 * Icon + Kurztext für einen Tag. Ein Gewitter- oder Regensignal überschreibt
 * dabei bewusst die reine kWh-Einstufung - ein Tag mit ordentlicher
 * Tagesstrahlungssumme, aber nachmittäglichem Gewitter, soll NICHT als
 * "☀️ Sehr gute PV-Chance" angezeigt werden.
 * @param {{ pvEstimateKwh:number, confidence:string, worstWeatherCode:number|null, precipitationMm:number }} input
 */
export function classifyDay({ pvEstimateKwh, confidence, worstWeatherCode, precipitationMm }) {
  const codeInfo = worstWeatherCode != null ? classifyWeatherCode(worstWeatherCode) : null
 
  let icon
  let label
  if (codeInfo && codeInfo.tier >= 4) {
    // Gewitter, Regen oder Schnee laut Wettercode - unabhängig von der reinen
    // Strahlungssumme, denn die kann an einem Gewittertag trotzdem beachtlich sein.
    icon = codeInfo.icon
    label = codeInfo.label
  } else if (pvEstimateKwh >= 30) {
    icon = '☀️'
    label = 'Sehr gute PV-Chance'
  } else if (pvEstimateKwh >= 15) {
    icon = '🌤️'
    label = 'PV mittel'
  } else if (pvEstimateKwh >= 6) {
    icon = '⛅'
    label = 'PV schwach'
  } else {
    icon = codeInfo?.icon ?? '🌧️'
    label = codeInfo?.label ?? 'PV schlecht'
  }
 
  if (precipitationMm >= 1 && !label.includes('Regen') && !label.includes('Gewitter') && !label.includes('Schnee')) {
    label += ' · Niederschlag möglich'
  }
  if (confidence === 'niedrig') label += ' (unsicher)'
  return { icon, label }
}
 
/** Extrahiert für ein Modell die stündliche Serie einer Variable, oder null, falls die API sie nicht geliefert hat. */
function modelSeries(hourly, variable, modelId) {
  return hourly[`${variable}_${modelId}`] ?? null
}
 
/**
 * Reine Auswertung einer bereits geparsten Open-Meteo-JSON-Antwort. Kein
 * Netzwerk - direkt testbar. Nutzt für jede Tages-PV-Schätzung NUR die
 * Modelle, für die tatsächlich eine modell-spezifische Zeitreihe zurückkam
 * (kein stiller Rückfall auf eine "Standard"-Serie, die sonst fälschlich als
 * 5-facher Konsens durchgehen würde).
 * @param {any} data  rohe JSON-Antwort von /v1/forecast
 * @param {{ totalKwp:number }} pvConfig
 * @param {(isoDate:string)=>number} houseLoadForDay
 */
export function parseForecastResponse(data, pvConfig, houseLoadForDay) {
  const hourly = data.hourly ?? {}
  const times = hourly.time ?? []
 
  const availableModels = WEATHER_MODELS.filter((m) => modelSeries(hourly, 'shortwave_radiation', m.id) !== null)
  const radiationSeries = availableModels.map((m) => modelSeries(hourly, 'shortwave_radiation', m.id))
 
  // weathercode/precipitation dienen nur der Tages-Einstufung (Gewitter/Regen-
  // Erkennung), nicht der Konsens-/Sicherheitsberechnung - dafür genügt auch eine
  // einzelne, nicht modell-aufgeschlüsselte Serie, falls die API keine
  // modell-spezifischen Varianten dieser Felder liefert. Bevorzugt wird trotzdem
  // "über alle Modelle der ungünstigste Wert", wenn mehrere vorhanden sind.
  function seriesForVariable(variable) {
    const perModel = WEATHER_MODELS.map((m) => modelSeries(hourly, variable, m.id)).filter((s) => s !== null)
    if (perModel.length > 0) return perModel
    return hourly[variable] ? [hourly[variable]] : []
  }
  const codeVariable = seriesForVariable('weathercode').length > 0 ? 'weathercode' : 'weather_code'
  const codeSeries = seriesForVariable(codeVariable)
  const precipSeries = seriesForVariable('precipitation')
 
  /** @type {Map<string, { radiation: number[][], codes: number[][], precip: number[][] }>} */
  const byDay = new Map()
  times.forEach((t, i) => {
    const day = t.slice(0, 10)
    if (!byDay.has(day)) {
      byDay.set(day, {
        radiation: radiationSeries.map(() => []),
        codes: codeSeries.map(() => []),
        precip: precipSeries.map(() => []),
      })
    }
    const bucket = byDay.get(day)
    radiationSeries.forEach((series, idx) => bucket.radiation[idx].push(series[i] ?? 0))
    codeSeries.forEach((series, idx) => bucket.codes[idx].push(series[i] ?? 0))
    precipSeries.forEach((series, idx) => bucket.precip[idx].push(series[i] ?? 0))
  })
 
  const days = [...byDay.keys()].sort().slice(0, 7)
  return days.map((day) => {
    const bucket = byDay.get(day)
    const pvKwhByModel = bucket.radiation.map((hours) => radiationToPvKwh(hours, pvConfig))
    const houseLoadKwh = houseLoadForDay(day)
    const combined = combineModelEstimates(pvKwhByModel, houseLoadKwh, WEATHER_MODELS.length)
 
    const worstWeatherCode = bucket.codes.length
      ? Math.max(...bucket.codes.flat().filter((c) => Number.isFinite(c)), -Infinity)
      : null
    const precipitationMm = bucket.precip.length ? Math.max(...bucket.precip.map((hours) => hours.reduce((s, v) => s + v, 0))) : 0
 
    const { icon, label } = classifyDay({
      pvEstimateKwh: combined.pvEstimateKwh,
      confidence: combined.confidence,
      worstWeatherCode: Number.isFinite(worstWeatherCode) ? worstWeatherCode : null,
      precipitationMm,
    })
 
    return {
      date: day,
      summary: label,
      icon,
      pvEstimateKwh: combined.pvEstimateKwh,
      pvSurplusEstimateKwh: combined.pvSurplusEstimateKwh,
      confidence: combined.confidence,
      sourceAgreement: combined.sourceAgreement,
      modelsUsed: availableModels.length,
      stale: false,
    }
  })
}
 
/**
 * Holt die 5-Modell-Rohdaten von Open-Meteo für den gewünschten Zeitraum und baut
 * daraus WeatherDay-Objekte (siehe types.js). Bei Netzwerkfehlern wird nicht
 * "erfunden" (Abschnitt 33): der Aufrufer bekommt eine Exception und fällt auf die
 * zuletzt gespeicherte Prognose zurück (`stale: true`, siehe storage.js).
 * @param {{ lat:number, lon:number }} location
 * @param {(isoDate:string)=>number} houseLoadForDay
 * @param {{ totalKwp:number }} pvConfig
 */
export async function fetchWeatherWeek(location, houseLoadForDay, pvConfig) {
  const modelParam = WEATHER_MODELS.map((m) => m.id).join(',')
  const url =
    `${OPEN_METEO_BASE}?latitude=${location.lat}&longitude=${location.lon}` +
    `&hourly=shortwave_radiation,precipitation,weathercode` +
    `&forecast_days=7&timezone=Europe%2FBerlin&models=${modelParam}`
 
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Open-Meteo Anfrage fehlgeschlagen: ${res.status}`)
  const data = await res.json()
  return parseForecastResponse(data, pvConfig, houseLoadForDay)
}