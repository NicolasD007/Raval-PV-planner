import { useCallback, useEffect, useMemo, useState } from 'react'
import * as storage from '../lib/storage.js'
import { DEFAULT_SETUP } from '../lib/types.js'
import { estimateConsumption } from '../lib/consumption.js'
import { fetchWeatherWeek } from '../lib/weather.js'
import { planWeek } from '../lib/planningEngine.js'
import { toISODate, addDays } from '../lib/date.js'
import { estimateHouseLoadKwh } from '../lib/houseLoad.js'
import { buildHistoryView } from '../lib/history.js'

/**
 * Zentraler App-State: lädt alles aus localStorage, holt die Wetterprognose,
 * und berechnet Verbrauch + Ladeplan neu, sobald sich SoC, Ziele, Sperrzeiten,
 * Setup oder Wetter ändern (Abschnitt 5: "Nach jeder SoC-Aktualisierung muss
 * die Ladeplanung sofort neu berechnet werden").
 */
export function useAppData() {
  const [setup, setSetupState] = useState(() => storage.getSetup(DEFAULT_SETUP))
  const [socHistory, setSocHistory] = useState(() => storage.getSocHistory())
  const [goals, setGoals] = useState(() => storage.getGoals())
  const [blocks, setBlocks] = useState(() => storage.getAvailabilityBlocks())
  const [weatherDays, setWeatherDays] = useState(() => storage.getLastWeather()?.weatherDays ?? [])
  const [weatherStale, setWeatherStale] = useState(true)
  const [weatherLoading, setWeatherLoading] = useState(true)
  const [weatherError, setWeatherError] = useState(null)
  const [planHistory, setPlanHistory] = useState(() => storage.getPlanHistory())

  // Haus-/Wärmepumpenlast: nutzt die Tagesmitteltemperatur aus der Wetterprognose,
  // wenn vorhanden (houseLoad.js), sonst den festen Saison-Stufenwert.
  const houseLoadForDay = useCallback((isoDate, meanTempC) => estimateHouseLoadKwh(isoDate, meanTempC, setup), [setup])

  const loadWeather = useCallback(async () => {
    setWeatherLoading(true)
    setWeatherError(null)
    try {
      const days = await fetchWeatherWeek(setup.location, houseLoadForDay, setup.pv)
      setWeatherDays(days)
      setWeatherStale(false)
      storage.setLastWeather(days)
    } catch (err) {
      // Abschnitt 33: keine erfundene Prognose - letzte bekannte Daten anzeigen und klar markieren.
      const cached = storage.getLastWeather()
      if (cached?.weatherDays?.length) {
        setWeatherDays(cached.weatherDays.map((d) => ({ ...d, stale: true })))
      }
      setWeatherStale(true)
      setWeatherError(err.message ?? 'Wetterdaten nicht verfügbar')
    } finally {
      setWeatherLoading(false)
    }
  }, [setup, houseLoadForDay])

  useEffect(() => {
    loadWeather()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setup.location.lat, setup.location.lon])

  const latestEntry = useMemo(() => {
    if (socHistory.length === 0) return null
    return [...socHistory].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0]
  }, [socHistory])

  const consumption = useMemo(() => estimateConsumption(socHistory, { now: new Date() }), [socHistory])

  const plan = useMemo(() => {
    if (!latestEntry) return null
    const today = toISODate(new Date())
    const currentSocDate = toISODate(new Date(latestEntry.timestamp))
    const effectiveWeatherDays =
      weatherDays.length > 0 ? weatherDays : Array.from({ length: 7 }, (_, i) => ({
        date: addDays(today, i),
        summary: 'Keine Prognose',
        icon: '❔',
        pvEstimateKwh: 0,
        pvSurplusEstimateKwh: 0,
        confidence: 'niedrig',
        sourceAgreement: 0,
        modelsUsed: 0,
        precipitationMm: null,
        sunHours: null,
        tempMinC: null,
        tempMaxC: null,
        stale: true,
      }))
    const result = planWeek({
      today,
      currentSoc: latestEntry.soc,
      currentSocDate: currentSocDate < today ? currentSocDate : today,
      consumption,
      weatherDays: effectiveWeatherDays,
      availabilityBlocks: blocks.filter((b) => b.active),
      chargingGoals: goals.filter((g) => g.active),
      setup,
    })
    storage.setLastPlan(result)
    return result
  }, [latestEntry, consumption, weatherDays, blocks, goals, setup])

  // Verlauf/Auswertung: archiviert die Empfehlung für "heute" jedes Mal, wenn
  // sich die Planung ändert (z.B. nach einem neuen SoC-Eintrag). Vergangene
  // Tage werden dabei nie angefasst - sobald ein Tag nicht mehr "heute" ist,
  // bleibt sein archivierter Stand als Verlaufs-Eintrag stehen (Abschnitt 33:
  // nichts nachträglich umschreiben).
  useEffect(() => {
    if (!plan?.days?.length) return
    const todayPlan = plan.days[0]
    const todayWeather = weatherDays.find((w) => w.date === todayPlan.date)
    storage.recordPlanSnapshot({
      date: todayPlan.date,
      action: todayPlan.action,
      chargingWindow: todayPlan.chargingWindow,
      targetSoc: todayPlan.targetSoc,
      confidence: todayWeather?.confidence ?? 'niedrig',
      pvEstimateKwh: todayWeather?.pvEstimateKwh ?? 0,
      weatherSummary: todayWeather?.summary ?? '',
      recordedAt: new Date().toISOString(),
    })
    setPlanHistory(storage.getPlanHistory())
  }, [plan, weatherDays])

  const planHistoryView = useMemo(() => buildHistoryView(planHistory, socHistory), [planHistory, socHistory])

  // --- Aktionen -----------------------------------------------------------

  const updateSoc = useCallback((payload) => {
    storage.addSocEntry(payload)
    setSocHistory(storage.getSocHistory())
  }, [])

  const saveGoal = useCallback((goal) => {
    storage.upsertGoal(goal)
    setGoals(storage.getGoals())
  }, [])

  const removeGoal = useCallback((id) => {
    storage.deleteGoal(id)
    setGoals(storage.getGoals())
  }, [])

  const saveBlock = useCallback((block) => {
    storage.upsertAvailabilityBlock(block)
    setBlocks(storage.getAvailabilityBlocks())
  }, [])

  const removeBlock = useCallback((id) => {
    storage.deleteAvailabilityBlock(id)
    setBlocks(storage.getAvailabilityBlocks())
  }, [])

  const updateSetup = useCallback((patch) => {
    setSetupState((prev) => {
      const next = { ...prev, ...patch }
      storage.setSetup(next)
      return next
    })
  }, [])

  // Backup/Export: reine Datenübergabe an storage.js, siehe dort für das Format.
  const exportBackup = useCallback(() => storage.exportBackupData(), [])

  const importBackup = useCallback((data) => {
    const imported = storage.importBackupData(data)
    setSetupState(storage.getSetup(DEFAULT_SETUP))
    setSocHistory(storage.getSocHistory())
    setGoals(storage.getGoals())
    setBlocks(storage.getAvailabilityBlocks())
    setPlanHistory(storage.getPlanHistory())
    return imported
  }, [])

  return {
    setup,
    socHistory,
    latestEntry,
    goals,
    blocks,
    weatherDays,
    weatherStale,
    weatherLoading,
    weatherError,
    consumption,
    plan,
    planHistoryView,
    reloadWeather: loadWeather,
    updateSoc,
    saveGoal,
    removeGoal,
    saveBlock,
    removeBlock,
    updateSetup,
    exportBackup,
    importBackup,
  }
}
