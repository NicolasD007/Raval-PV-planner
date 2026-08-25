// Wetter-/PV-Prognose: 5-Modell-Konsens über die Open-Meteo-API (kostenlos, ohne
// API-Key, CORS-fähig -> passt zum reinen Client-seitigen GitHub-Pages-Deployment,
// siehe README/"WICHTIG"-Abschnitt zur Anbieterfrage).
//
// Die reine Rechenlogik (Strahlung -> PV-kWh, Konsensbildung, Konfidenz) ist von
// dem eigentlichen fetch() getrennt und dadurch ohne Netzwerk testbar
// (siehe weather.test.mjs). fetchWeatherWeek() ist die einzige I/O-Grenze.

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
 * @param {number[]} pvKwhByModel  ein Wert pro Modell (gleicher Tag)
 * @param {number} houseLoadKwh    erwarteter Haus- + Wärmepumpenverbrauch an diesem Tag
 */
export function combineModelEstimates(pvKwhByModel, houseLoadKwh) {
  const n = pvKwhByModel.length
  const mean = pvKwhByModel.reduce((s, v) => s + v, 0) / n
  const variance = pvKwhByModel.reduce((s, v) => s + (v - mean) ** 2, 0) / n
  const stdDev = Math.sqrt(variance)
  const coeffOfVariation = mean > 0 ? stdDev / mean : 0
  // Je größer die Streuung zwischen den Modellen, desto niedriger die Sicherheit.
  const sourceAgreement = Number(Math.max(0, 1 - coeffOfVariation).toFixed(2))

  let confidence = 'niedrig'
  if (sourceAgreement >= 0.85) confidence = 'hoch'
  else if (sourceAgreement >= 0.6) confidence = 'mittel'

  const pvEstimateKwh = Number(mean.toFixed(1))
  const pvSurplusEstimateKwh = Number(Math.max(0, mean - houseLoadKwh).toFixed(1))

  return { pvEstimateKwh, pvSurplusEstimateKwh, confidence, sourceAgreement }
}

export function summaryForConfidence(pvEstimateKwh, confidence) {
  let icon = '🌧️'
  let label = 'PV schlecht'
  if (pvEstimateKwh >= 30) {
    icon = '☀️'
    label = 'Sehr gute PV-Chance'
  } else if (pvEstimateKwh >= 15) {
    icon = '🌤️'
    label = 'PV mittel'
  } else if (pvEstimateKwh >= 6) {
    icon = '⛅'
    label = 'PV schwach'
  }
  if (confidence === 'niedrig') label += ' (unsicher)'
  return { icon, label }
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
    `&hourly=shortwave_radiation&forecast_days=7&timezone=Europe%2FBerlin&models=${modelParam}`

  const res = await fetch(url)
  if (!res.ok) throw new Error(`Open-Meteo Anfrage fehlgeschlagen: ${res.status}`)
  const data = await res.json()

  const times = data.hourly.time // ISO-Strings, stündlich, für alle Modelle gemeinsam
  const perModelSeries = WEATHER_MODELS.map((m) => data.hourly[`shortwave_radiation_${m.id}`] ?? data.hourly.shortwave_radiation)

  // nach Kalendertag gruppieren
  /** @type {Map<string, number[][]>} */
  const byDay = new Map()
  times.forEach((t, i) => {
    const day = t.slice(0, 10)
    if (!byDay.has(day)) byDay.set(day, WEATHER_MODELS.map(() => []))
    perModelSeries.forEach((series, modelIdx) => {
      byDay.get(day)[modelIdx].push(series[i] ?? 0)
    })
  })

  const days = [...byDay.keys()].sort().slice(0, 7)
  return days.map((day) => {
    const perModelHours = byDay.get(day)
    const pvKwhByModel = perModelHours.map((hours) => radiationToPvKwh(hours, pvConfig))
    const houseLoadKwh = houseLoadForDay(day)
    const combined = combineModelEstimates(pvKwhByModel, houseLoadKwh)
    const { icon, label } = summaryForConfidence(combined.pvEstimateKwh, combined.confidence)
    return {
      date: day,
      summary: label,
      icon,
      pvEstimateKwh: combined.pvEstimateKwh,
      pvSurplusEstimateKwh: combined.pvSurplusEstimateKwh,
      confidence: combined.confidence,
      sourceAgreement: combined.sourceAgreement,
      stale: false,
    }
  })
}
