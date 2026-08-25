// Haus-/Wärmepumpen-Lastschätzung für einen Kalendertag.
//
// Verbesserung ggü. dem ursprünglichen Modell: die Wärmepumpe rechnet jetzt,
// wenn eine Temperaturprognose vorliegt, mit der tatsächlichen
// Tagesmitteltemperatur statt nur mit einem festen Winter-/Sommer-Stufenwert
// (Nutzer-Feedback: "Temperatur in die Wärmepumpen-Rechnung aufnehmen"). Ohne
// Temperaturprognose (z.B. Wetterdaten nicht verfügbar) bleibt es beim alten,
// festen Saison-Stufenwert - Abschnitt 33: keine erfundenen Werte, wenn wir
// die Temperatur schlicht nicht kennen.
//
// Reine Funktionen, kein React/IO - direkt mit node:test testbar (siehe
// houseLoad.test.mjs). useAppData.js verdrahtet das nur noch mit dem
// State aus dem Setup.

/** Heizgrenztemperatur (HGT): gängige Konvention, ab der i.d.R. nicht mehr geheizt wird. */
export const HEATING_BASE_TEMP_C = 15

// Angenommene typische Tagesmitteltemperatur für die Winterperiode (Okt-Mär) in
// Spöck/Altusried (Allgäu, ca. 700 m ü. NN) - eine Modellannahme wie die
// übrigen Setup-Werte (siehe README "Bewusste Modellannahmen"), keine
// gemessene Klimareihe. Dient nur dazu, aus den zwei bekannten Stufenwerten
// (Winter-/Sommer-kWh/Tag aus dem Setup) eine Steigung (kWh je Heizgradtag)
// abzuleiten - bei geänderten Setup-Werten passt sich die Steigung automatisch an.
export const ASSUMED_WINTER_MEAN_TEMP_C = 3

/**
 * Wärmepumpen-Tagesverbrauch (kWh) als Funktion der Tagesmitteltemperatur.
 * Linear interpoliert/extrapoliert zwischen den zwei bekannten Referenzpunkten:
 * Sommerwert = "Sockel" (Warmwasser etc., auch wenn nicht geheizt wird) bei
 * Temperaturen ab der Heizgrenze, Winterwert = Referenzpunkt bei
 * ASSUMED_WINTER_MEAN_TEMP_C. Nach unten auf den Sommerwert, nach oben auf das
 * 1,6-fache des Winterwerts begrenzt, damit die lineare Extrapolation bei
 * Tagen weit außerhalb des Kalibrierbereichs (sehr milde oder sehr kalte
 * Ausreißer) keine unplausiblen Werte liefert.
 * @param {number} meanTempC
 * @param {{ winterKwhPerDay:number, summerKwhPerDay:number }} heatPumpConfig
 */
export function heatPumpKwhForTemp(meanTempC, heatPumpConfig) {
  const { winterKwhPerDay, summerKwhPerDay } = heatPumpConfig
  const heatingDegreeDays = Math.max(0, HEATING_BASE_TEMP_C - meanTempC)
  const referenceHdd = Math.max(0.1, HEATING_BASE_TEMP_C - ASSUMED_WINTER_MEAN_TEMP_C)
  const slopeKwhPerDegree = (winterKwhPerDay - summerKwhPerDay) / referenceHdd
  const kwh = summerKwhPerDay + slopeKwhPerDegree * heatingDegreeDays
  return Number(Math.min(Math.max(kwh, summerKwhPerDay), winterKwhPerDay * 1.6).toFixed(2))
}

/**
 * Gesamte Haus-Tageslast (Haushalt + ggf. Wärmepumpe) für einen Kalendertag.
 * Nutzt für die Wärmepumpe die Tagesmitteltemperatur, wenn eine Prognose
 * vorliegt (meanTempC != null); sonst den bisherigen festen Saison-Stufenwert
 * (Okt-Mär = Winter, Apr-Sep = Sommer). Der Haushaltsstrom selbst bleibt
 * bewusst beim einfachen Saison-Stufenwert (dafür gibt es keine vergleichbar
 * direkte Temperaturabhängigkeit wie bei der Heizung).
 * @param {string} isoDate
 * @param {number|null|undefined} meanTempC
 * @param {{
 *   household: { winterKwhPerDay:number, summerKwhPerDay:number },
 *   heatPump: { active:boolean, winterKwhPerDay:number, summerKwhPerDay:number },
 * }} setup
 */
export function estimateHouseLoadKwh(isoDate, meanTempC, setup) {
  const month = Number(isoDate.slice(5, 7))
  const isWinter = month <= 3 || month >= 10
  const household = isWinter ? setup.household.winterKwhPerDay : setup.household.summerKwhPerDay

  let heatPump = 0
  if (setup.heatPump.active) {
    heatPump =
      meanTempC != null
        ? heatPumpKwhForTemp(meanTempC, setup.heatPump)
        : isWinter
          ? setup.heatPump.winterKwhPerDay
          : setup.heatPump.summerKwhPerDay
  }
  return Number((household + heatPump).toFixed(2))
}
