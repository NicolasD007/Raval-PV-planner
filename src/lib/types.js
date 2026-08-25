// Zentrale Datentypen (als JSDoc, siehe Projekt-README für die Begründung,
// warum plain JS + JSDoc statt TypeScript) und feste Standardwerte aus dem
// Lastenheft (Abschnitte 2, 3, 4, 24 sowie die im Chat geklärten Ergänzungen).

/**
 * @typedef {Object} SocEntry
 * @property {string} id
 * @property {string} timestamp   ISO-Datetime
 * @property {number} soc         0-100
 * @property {boolean} externalCharge  extern zwischengeladen
 * @property {boolean} homeCharge      zuhause zwischengeladen (außerplanmäßig)
 * @property {string} [note]
 */

/**
 * @typedef {Object} ChargingGoal
 * @property {string} id
 * @property {string} date        isoDate, für das der SoC erreicht sein soll
 * @property {number} targetSoc   0-100
 * @property {boolean} active
 * @property {string} [note]
 */

/**
 * @typedef {Object} AvailabilityBlock
 * @property {string} id
 * @property {string} date        isoDate (immer ein konkretes Einzeldatum, keine Wiederholungsregel)
 * @property {string} startTime   'HH:MM', Default '07:00'
 * @property {string} endTime     'HH:MM', Default '17:00'
 * @property {string} [reason]
 * @property {boolean} active
 */

/**
 * @typedef {Object} WeatherDay
 * @property {string} date
 * @property {string} summary            kurzer Text, z.B. "Gute PV-Chance"
 * @property {string} icon                z.B. '☀️'
 * @property {number} pvEstimateKwh
 * @property {number} pvSurplusEstimateKwh
 * @property {'hoch'|'mittel'|'niedrig'} confidence
 * @property {number} sourceAgreement     0-1, wie einig sich die 5 Modelle sind
 * @property {boolean} stale              true = keine frischen Wetterdaten (offline)
 */

/**
 * @typedef {Object} ChargingWindow
 * @property {string} date
 * @property {string} start  'HH:MM'
 * @property {string} end    'HH:MM'
 */

/**
 * @typedef {Object} Plan
 * @property {string} date
 * @property {'CHARGE'|'NO_CHARGE'|'WAIT'} action
 * @property {number} startSoc
 * @property {number} targetSoc
 * @property {ChargingWindow|null} chargingWindow
 * @property {number} expectedEnergyKwh
 * @property {string} reason           kurzer, für den Nutzer verständlicher Satz
 * @property {'hoch'|'mittel'|'niedrig'} confidence
 * @property {string[]} conflicts
 */

/** Feste Hausdaten, Fahrzeug- und Komfortwerte (Setup-Seite, editierbar, diese sind die Defaults). */
export const DEFAULT_SETUP = {
  pv: {
    totalKwp: 16.1,
    eastKwp: 6.9,
    westKwp: 9.2,
  },
  houseBattery: {
    capacityKwh: 15,
    nightReservePct: 70, // Mindestziel am Abend / harte Nachtreserve
    // Konservative, feste Annahme, wie viel PV-Energie an einem Durchschnittstag
    // zuerst dem Speicher zusteht, bevor überhaupt etwas als "frei fürs Auto"
    // gilt (Abschnitt 2: Haus/Wärmepumpe haben Vorrang; TEST 9). Da die App
    // keine Live-SoC-Anbindung an den Hausspeicher hat, ist das eine bewusst
    // vorsichtige Pauschale, kein Messwert.
    dailyReplenishmentReserveKwh: 3,
  },
  wallboxKw: 11,
  vehicle: {
    name: 'CUPRA Raval Endurance (211 PS, 155 kW)',
    batteryCapacityKwh: 52,
    safetyReservePct: 40, // harte Grenze, nie durch bewusstes Warten unterschreiten
  },
  weekend: {
    targetPct: 80,
    deadline: { weekday: 5, time: '20:00' }, // Freitag 20:00 Uhr
  },
  household: {
    // feste Saisonwerte lt. Nutzerangabe, kWh/Tag
    winterKwhPerDay: 7.7,
    summerKwhPerDay: 4.0,
  },
  heatPump: {
    active: true,
    winterKwhPerDay: 16,
    // rechnerisch aus Jahressumme 3500 kWh abgeleitet: (3500 - 16*181) / 184
    summerKwhPerDay: Number((((3500 - 16 * 181) / 184)).toFixed(2)),
    annualKwh: 3500,
  },
  location: {
    label: 'Spöck · Altusried',
    postcode: '87452',
    lat: 47.78873,
    lon: 10.173972,
  },
  allowGridChargingSuggestion: false, // Nutzer will nie eine reine Netzladung vorgeschlagen bekommen
}

export const CONSUMPTION_CONFIG = {
  windowWeeks: 4,
  maxIntervalsPerCategory: 8,
  minValidForEstimate: 3,
  outlierHighFactor: 2, // > 2x Median = Ausreißer
  outlierLowFactor: 0.5, // < 0.5x Median = Ausreißer
}
