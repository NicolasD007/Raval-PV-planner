// localStorage-Persistenzschicht (Abschnitt 25). Bewusst als dünne, reine
// Get/Set-Funktionen gehalten, damit die UI-Komponenten schlank bleiben und
// die eigentliche Logik (consumption.js, planningEngine.js) davon unberührt
// bleibt. Kein Backend, keine IndexedDB nötig - der Datenumfang ist klein.

const KEYS = {
  socHistory: 'raval.socHistory',
  goals: 'raval.goals',
  availability: 'raval.availability',
  setup: 'raval.setup',
  lastPlan: 'raval.lastPlan',
  lastWeather: 'raval.lastWeather',
  planHistory: 'raval.planHistory',
}

// Wie viele Tage an archivierten Tages-Empfehlungen (Verlauf/Auswertung)
// maximal aufgehoben werden, damit localStorage nicht unbegrenzt wächst.
const MAX_PLAN_HISTORY_DAYS = 90

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // localStorage kann in seltenen Fällen voll oder blockiert sein (privater
    // Modus etc.) - die App bleibt dann innerhalb der Session nutzbar, verliert
    // aber die Persistenz. Kein harter Fehler für den Nutzer.
  }
}

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

// --- SoC-Historie -----------------------------------------------------

export function getSocHistory() {
  return read(KEYS.socHistory, [])
}

export function addSocEntry({ soc, externalCharge = false, homeCharge = false, note = '' }) {
  const entries = getSocHistory()
  const entry = {
    id: uid(),
    timestamp: new Date().toISOString(),
    soc,
    externalCharge,
    homeCharge,
    note,
  }
  entries.push(entry)
  write(KEYS.socHistory, entries)
  return entry
}

export function deleteSocEntry(id) {
  write(
    KEYS.socHistory,
    getSocHistory().filter((e) => e.id !== id)
  )
}

// --- Ladeziele (Termine) ----------------------------------------------

export function getGoals() {
  return read(KEYS.goals, [])
}

export function upsertGoal(goal) {
  const goals = getGoals()
  const idx = goals.findIndex((g) => g.id === goal.id)
  const withId = { ...goal, id: goal.id ?? uid() }
  if (idx >= 0) goals[idx] = withId
  else goals.push(withId)
  write(KEYS.goals, goals)
  return withId
}

export function deleteGoal(id) {
  write(
    KEYS.goals,
    getGoals().filter((g) => g.id !== id)
  )
}

// --- Sperrzeiten / Verfügbarkeit ---------------------------------------

export function getAvailabilityBlocks() {
  return read(KEYS.availability, [])
}

export function upsertAvailabilityBlock(block) {
  const blocks = getAvailabilityBlocks()
  const idx = blocks.findIndex((b) => b.id === block.id)
  const withId = {
    id: block.id ?? uid(),
    date: block.date,
    startTime: block.startTime ?? '07:00',
    endTime: block.endTime ?? '17:00',
    reason: block.reason ?? '',
    active: block.active ?? true,
  }
  if (idx >= 0) blocks[idx] = withId
  else blocks.push(withId)
  write(KEYS.availability, blocks)
  return withId
}

export function deleteAvailabilityBlock(id) {
  write(
    KEYS.availability,
    getAvailabilityBlocks().filter((b) => b.id !== id)
  )
}

// --- Setup ---------------------------------------------------------------

export function getSetup(defaultSetup) {
  const stored = read(KEYS.setup, null)
  return stored ? { ...defaultSetup, ...stored } : defaultSetup
}

export function setSetup(setup) {
  write(KEYS.setup, setup)
}

// --- Letzte Planung / Wetter (Offline-Fallback, Abschnitt 26) -----------

export function getLastPlan() {
  return read(KEYS.lastPlan, null)
}

export function setLastPlan(plan) {
  write(KEYS.lastPlan, { plan, savedAt: new Date().toISOString() })
}

export function getLastWeather() {
  return read(KEYS.lastWeather, null)
}

export function setLastWeather(weatherDays) {
  write(KEYS.lastWeather, { weatherDays, savedAt: new Date().toISOString() })
}

// --- Verlauf/Auswertung: archivierte Tages-Empfehlungen ------------------
// (Bugfix/Feature: "was hat die App empfohlen" nachträglich nachvollziehbar
// machen, siehe history.js für die Zusammenführung mit der SoC-Historie.)

export function getPlanHistory() {
  return read(KEYS.planHistory, [])
}

/** Legt die Tages-Empfehlung ab bzw. überschreibt sie, falls für dieses Datum schon eine existiert. */
export function recordPlanSnapshot(entry) {
  const history = getPlanHistory()
  const idx = history.findIndex((e) => e.date === entry.date)
  if (idx >= 0) history[idx] = entry
  else history.push(entry)
  history.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  write(KEYS.planHistory, history.slice(-MAX_PLAN_HISTORY_DAYS))
}

// --- Backup/Export ---------------------------------------------------------
// Da alles ausschließlich in localStorage liegt, gehen SoC-Historie, Ziele,
// Sperrzeiten und Setup bei gelöschtem Browser-Speicher (privates Fenster,
// "Website-Daten löschen", Gerätewechsel) komplett verloren. Export/Import als
// einfache JSON-Datei ist die minimale Absicherung dagegen - kein Backend nötig.

const BACKUP_VERSION = 1

export function exportBackupData() {
  return {
    backupVersion: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    setup: read(KEYS.setup, null),
    socHistory: getSocHistory(),
    goals: getGoals(),
    availability: getAvailabilityBlocks(),
    planHistory: getPlanHistory(),
  }
}

/**
 * Spielt ein zuvor exportiertes Backup ein. Überschreibt nur die Felder, die im
 * Backup tatsächlich vorhanden und vom erwarteten Typ sind - ein unvollständiges
 * oder fremdes JSON soll nicht den kompletten lokalen Datenbestand zerstören.
 * @param {any} data
 * @returns {string[]} Liste der tatsächlich importierten Bereiche (für die UI-Rückmeldung)
 */
export function importBackupData(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('Datei ist kein gültiges Backup (kein JSON-Objekt).')
  }
  const imported = []
  if (data.setup && typeof data.setup === 'object') {
    write(KEYS.setup, data.setup)
    imported.push('Setup')
  }
  if (Array.isArray(data.socHistory)) {
    write(KEYS.socHistory, data.socHistory)
    imported.push('SoC-Historie')
  }
  if (Array.isArray(data.goals)) {
    write(KEYS.goals, data.goals)
    imported.push('Ladeziele')
  }
  if (Array.isArray(data.availability)) {
    write(KEYS.availability, data.availability)
    imported.push('Sperrzeiten')
  }
  if (Array.isArray(data.planHistory)) {
    write(KEYS.planHistory, data.planHistory)
    imported.push('Verlauf')
  }
  if (imported.length === 0) {
    throw new Error('Datei enthält keine erkennbaren Backup-Felder.')
  }
  return imported
}
