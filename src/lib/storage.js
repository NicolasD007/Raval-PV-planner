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
}

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
