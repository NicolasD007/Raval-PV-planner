// Grobe Reichweitenschätzung aus SoC + Batteriekapazität, nur für die Anzeige
// (z.B. "~138 km verfügbar" auf der Heute-Seite). Nutzt bewusst eine feste,
// klar deklarierte Verbrauchsannahme statt eines Bordcomputer-Messwerts, den
// diese App nicht hat (Abschnitt 33: nichts erfinden, was wie ein Messwert
// aussieht) - siehe vehicle.assumedConsumptionKwhPer100km in types.js.

/**
 * @param {number} soc  0-100
 * @param {{ batteryCapacityKwh:number, assumedConsumptionKwhPer100km:number }} vehicleConfig
 * @returns {number}  geschätzte Reichweite in km, nie negativ
 */
export function estimateRangeKm(soc, vehicleConfig) {
  const { batteryCapacityKwh, assumedConsumptionKwhPer100km } = vehicleConfig
  if (!(assumedConsumptionKwhPer100km > 0)) return 0
  const usableKwh = Math.max(0, soc / 100) * batteryCapacityKwh
  return Math.round((usableKwh / assumedConsumptionKwhPer100km) * 100)
}
