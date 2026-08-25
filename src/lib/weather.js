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

// Wichtig: Open-Meteo erwartet hier die vollen, anbieter-präfixierten IDs
// (per offizieller Doku-Beispiel-URLs geprüft) - "icon_seamless"/"gfs_seamless"
// ohne Präfix waren falsch und führten dazu, dass diese beiden Modelle in der
// API-Antwort schlicht fehlten (weniger echte Quellen -> ständig "unsicher").
export const WEATHER_MODELS = [
  { id: 'dwd_icon_seamless', label: 'DWD ICON' },
  { id: 'ecmwf_ifs', label: 'ECMWF IFS' },
  { id: 'ncep_gfs_seamless', label: 'NOAA GFS' },
  { id: 'meteofrance_seamless', label: 'Météo-France' },
  { id: 'ukmo_seamless', label: 'UK Met Office' },
]

/** Performance Ratio: Wirkungsgradverlust durch Wechselrichter, Temperatur, Verkabelung etc. */
const PERFORMANCE_RATIO = 0.8

// Ab welcher Modell-Übereinstimmung (sourceAgreement, 0-1) gilt eine Prognose als
// "hoch" bzw. "mittel" sicher (siehe combineModelEstimates()).
const HIGH_AGREEMENT_THRESHOLD = 0.65
const MEDIUM_AGREEMENT_THRESHOLD = 0.35

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

  // Schwellenwerte bewusst gelockert (Nutzer-Feedback: mit den ursprünglich strengen
  // Werten - hoch ab CoV<=15%, mittel ab CoV<=40% - stand bei praktisch jeder
  // Prognose >2 Tage im Voraus "Niedrig", weil sich Globalstrahlungs-Prognosen
  // verschiedener NWP-Modelle (Wolken-/Konvektionsphysik) selbst bei insgesamt
  // stabilem Wetter oft um 20-40% unterscheiden. Das war technisch "korrekt" im
  // Sinne der reinen Modell-Streuung, aber in der Praxis zu streng, um noch
  // hilfreich zwischen "wirklich unsicher" und "normale Modellstreuung" zu
  // unterscheiden. Jetzt: hoch ab CoV<=35%, mittel ab CoV<=65%.
  let confidence = 'niedrig'
  if (sourceAgreement >= HIGH_AGREEMENT_THRESHOLD) confidence = 'hoch'
  else if (sourceAgreement >= MEDIUM_AGREEMENT_THRESHOLD) confidence = 'mittel'

  const pvEstimateKwh = Number(mean.toFixed(1))
  const pvSurplusEstimateKwh = Number(Math.max(0, mean - houseLoadKwh).toFixed(1))

  return { pvEstimateKwh, pvSurplusEstimateKwh, confidence, sourceAgreement }
}

// WMO-Wettercodes (von Open-Meteo verwendet) grob nach Schweregrad gruppiert.
// Reihenfolge wichtig: spätere Einträge "gewinnen" bei gleichzeitig auftretenden Codes.
// "mixLabel" (nur bei Regen/Schnee): Text für den Fall, dass am selben Tag trotzdem
// nennenswert Sonne dabei ist - siehe classifyDay()/MEANINGFUL_SUN_HOURS.
const SEVERITY_TIERS = [
  { test: (c) => c === 0, tier: 0, icon: '☀️', label: 'Klar' },
  { test: (c) => c >= 1 && c <= 2, tier: 1, icon: '🌤️', label: 'Leicht bewölkt' },
  { test: (c) => c === 3, tier: 2, icon: '⛅', label: 'Bewölkt' },
  { test: (c) => c === 45 || c === 48, tier: 3, icon: '🌫️', label: 'Nebel' },
  { test: (c) => c >= 51 && c <= 57, tier: 3, icon: '🌦️', label: 'Nieselregen' },
  { test: (c) => (c >= 61 && c <= 67) || (c >= 80 && c <= 82), tier: 4, icon: '🌧️', label: 'Regen', mixLabel: 'Sonne & Regen' },
  { test: (c) => (c >= 71 && c <= 77) || c === 85 || c === 86, tier: 4, icon: '🌨️', label: 'Schnee', mixLabel: 'Sonne & Schnee' },
  { test: (c) => c === 95 || c === 96 || c === 99, tier: 5, icon: '⛈️', label: 'Gewitter möglich' },
]

// Ab wie viel Sonnenstunden am selben Tag ein reiner Schlechtwetter-Text
// ("Regen"/"Schnee") irreführend wäre und stattdessen ein gemischter Zustand
// ("Sonne & Regen") angezeigt wird. Gewitter (Tier 5) bleibt bewusst immer als
// eigenständige, unübersehbare Warnung stehen - dafür genügen wenige Minuten,
// und ein Blitz-Hinweis soll nicht durch "aber sonst sonnig" verwässert werden;
// die Sonnenstunden werden dort stattdessen als Zusatzinfo an den Text angehängt.
const MEANINGFUL_SUN_HOURS = 3

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
 *
 * Zwischenstufe (Bugfix "reiner Regen-Text trotz mehrerer Sonnenstunden"): Bei
 * Regen/Schnee UND gleichzeitig mindestens MEANINGFUL_SUN_HOURS Sonne am
 * selben Tag wird statt des reinen Schlechtwetter-Texts ein gemischter Zustand
 * ("Sonne & Regen") angezeigt - ein einzelner Regenschauer macht aus einem Tag
 * mit 6h Sonne keinen "Regen"-Tag. Gewitter bleibt davon bewusst ausgenommen
 * (siehe MEANINGFUL_SUN_HOURS-Kommentar).
 * @param {{ pvEstimateKwh:number, confidence:string, worstWeatherCode:number|null, precipitationMm:number, sunHours?:number|null }} input
 */
export function classifyDay({ pvEstimateKwh, confidence, worstWeatherCode, precipitationMm, sunHours = null }) {
  const codeInfo = worstWeatherCode != null ? classifyWeatherCode(worstWeatherCode) : null
  const hasMeaningfulSun = sunHours != null && sunHours >= MEANINGFUL_SUN_HOURS

  let icon
  let label
  if (codeInfo && codeInfo.tier >= 4) {
    if (codeInfo.mixLabel && hasMeaningfulSun) {
      // Regen/Schnee an einzelnen Stunden, aber der Tag hat trotzdem
      // nennenswert Sonne - weder "nur Regen" noch "nur Sonne" trifft es.
      icon = '🌦️'
      label = codeInfo.mixLabel
    } else {
      // Gewitter, oder Regen/Schnee ohne nennenswerte Sonne - unabhängig von
      // der reinen Strahlungssumme, denn die kann an so einem Tag trotzdem
      // beachtlich sein.
      icon = codeInfo.icon
      label = codeInfo.label
      if (codeInfo.tier === 5 && hasMeaningfulSun) {
        label += ` · trotzdem ${sunHours} h Sonne`
      }
    }
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
 * @param {(isoDate:string, meanTempC?:number|null)=>number} houseLoadForDay
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
  // Temperatur/Sonnenstunden sind reine Zusatzinfo (keine Sicherheits-/Risikoeinstufung
  // wie bei Regen/Gewitter), deshalb genügt hier ebenfalls "pro Modell, falls vorhanden,
  // sonst die unpräfixierte Serie" statt eines eigenen Konsensverfahrens.
  const tempSeries = seriesForVariable('temperature_2m')
  const sunshineSeries = seriesForVariable('sunshine_duration')

  /** @type {Map<string, { radiation: number[][], codes: number[][], precip: number[][], temp: number[][], sun: number[][] }>} */
  const byDay = new Map()
  times.forEach((t, i) => {
    const day = t.slice(0, 10)
    if (!byDay.has(day)) {
      byDay.set(day, {
        radiation: radiationSeries.map(() => []),
        codes: codeSeries.map(() => []),
        precip: precipSeries.map(() => []),
        temp: tempSeries.map(() => []),
        sun: sunshineSeries.map(() => []),
      })
    }
    const bucket = byDay.get(day)
    radiationSeries.forEach((series, idx) => bucket.radiation[idx].push(series[i] ?? 0))
    codeSeries.forEach((series, idx) => bucket.codes[idx].push(series[i] ?? 0))
    precipSeries.forEach((series, idx) => bucket.precip[idx].push(series[i] ?? 0))
    tempSeries.forEach((series, idx) => bucket.temp[idx].push(series[i] ?? null))
    sunshineSeries.forEach((series, idx) => bucket.sun[idx].push(series[i] ?? 0))
  })

  const days = [...byDay.keys()].sort().slice(0, 7)
  return days.map((day) => {
    const bucket = byDay.get(day)
    const pvKwhByModel = bucket.radiation.map((hours) => radiationToPvKwh(hours, pvConfig))

    // Temperatur/Sonnenstunden sind reine Zusatzinfo für die Anzeige, kein Risikosignal
    // -> hier reicht der Durchschnitt über die verfügbaren Modelle. Wird VOR dem
    // houseLoadForDay()-Aufruf berechnet, damit die Wärmepumpen-Lastschätzung die
    // Tagesmitteltemperatur nutzen kann (siehe houseLoad.js), statt nur den
    // festen Saison-Stufenwert.
    const allTemps = bucket.temp.flat().filter((v) => Number.isFinite(v))
    const tempMinC = allTemps.length ? Math.round(Math.min(...allTemps)) : null
    const tempMaxC = allTemps.length ? Math.round(Math.max(...allTemps)) : null
    const meanTempC = tempMinC != null && tempMaxC != null ? (tempMinC + tempMaxC) / 2 : null

    const houseLoadKwh = houseLoadForDay(day, meanTempC)
    const combined = combineModelEstimates(pvKwhByModel, houseLoadKwh, WEATHER_MODELS.length)

    const worstWeatherCode = bucket.codes.length
      ? Math.max(...bucket.codes.flat().filter((c) => Number.isFinite(c)), -Infinity)
      : null
    // Niederschlag: konservativ der ungünstigste (höchste) Tageswert über alle
    // Modelle - passend zum Grundsatz "bei Unsicherheit lieber vorsichtig planen".
    const precipitationMm = bucket.precip.length ? Math.max(...bucket.precip.map((hours) => hours.reduce((s, v) => s + v, 0))) : 0

    const sunHoursPerSeries = bucket.sun.map((hours) => hours.reduce((s, v) => s + v, 0) / 3600)
    const sunHours = sunHoursPerSeries.length
      ? Number((sunHoursPerSeries.reduce((s, v) => s + v, 0) / sunHoursPerSeries.length).toFixed(1))
      : null

    const { icon, label } = classifyDay({
      pvEstimateKwh: combined.pvEstimateKwh,
      confidence: combined.confidence,
      worstWeatherCode: Number.isFinite(worstWeatherCode) ? worstWeatherCode : null,
      precipitationMm,
      sunHours,
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
      precipitationMm: Number(precipitationMm.toFixed(1)),
      sunHours,
      tempMinC,
      tempMaxC,
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
 * @param {(isoDate:string, meanTempC?:number|null)=>number} houseLoadForDay
 * @param {{ totalKwp:number }} pvConfig
 */
export async function fetchWeatherWeek(location, houseLoadForDay, pvConfig) {
  const modelParam = WEATHER_MODELS.map((m) => m.id).join(',')
  const url =
    `${OPEN_METEO_BASE}?latitude=${location.lat}&longitude=${location.lon}` +
    `&hourly=shortwave_radiation,precipitation,weathercode,temperature_2m,sunshine_duration` +
    `&forecast_days=7&timezone=Europe%2FBerlin&models=${modelParam}`

  const res = await fetch(url)
  if (!res.ok) throw new Error(`Open-Meteo Anfrage fehlgeschlagen: ${res.status}`)
  const data = await res.json()
  return parseForecastResponse(data, pvConfig, houseLoadForDay)
}
