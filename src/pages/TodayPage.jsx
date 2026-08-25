import { useState } from 'react'
import { Plus, ChevronDown, ChevronUp, Check, CalendarClock, Car } from 'lucide-react'
import { addDays, isoWeekday, toISODate, weekdayNameDE } from '../lib/date.js'
import { estimateRangeKm } from '../lib/vehicleRange.js'
import CircularGauge from '../components/CircularGauge.jsx'
import MiniAreaChart from '../components/MiniAreaChart.jsx'
import WeatherCarousel from '../components/WeatherCarousel.jsx'

const CONFIDENCE_LABEL = { hoch: 'Hoch', mittel: 'Mittel', niedrig: 'Niedrig' }
const TITLE_MAP = { HEUTE_LADEN: 'Heute laden', WARTEN: 'Abwarten', NICHT_LADEN: 'Nicht laden' }

/** Nächster Freitag ab (inkl.) isoDate - für den Wochenendziel-Fallback der "Nächstes Ziel"-Karte. */
function nextFridayFrom(isoDate) {
  for (let i = 0; i <= 6; i++) {
    const d = addDays(isoDate, i)
    if (isoWeekday(d) === 5) return d
  }
  return isoDate
}

export default function TodayPage({ data, onUpdateSoc }) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const { plan, weatherDays, latestEntry, weatherStale, consumption, setup, goals } = data

  const today = toISODate(new Date())
  const todayPlan = plan?.days?.find((d) => d.date === today)
  const todayWeather = weatherDays.find((w) => w.date === (todayPlan?.date ?? plan?.days?.[0]?.date)) ?? weatherDays[0]

  if (!latestEntry) {
    return (
      <main style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <section className="glass-card hero-card">
          <p className="hero-eyebrow">LADEEMPFEHLUNG</p>
          <p className="hero-reason">
            Noch kein aktueller SoC hinterlegt. Bitte den Fahrzeug-Ladestand einmal eintragen, damit die Planung starten kann.
          </p>
        </section>
        <button className="btn-primary" onClick={onUpdateSoc}>
          <Plus size={18} /> SoC aktualisieren
        </button>
      </main>
    )
  }

  const headline = plan?.todayHeadline
  const displayTitle = TITLE_MAP[headline?.action] ?? headline?.title ?? '…'

  // Der nächste tatsächlich geplante Ladetag (heute oder später) - unabhängig davon,
  // ob die Headline gerade "Heute laden" oder "Abwarten" ist, soll Tag+Zeitfenster
  // sichtbar bleiben (siehe hero-window unten).
  const futureChargeDay = plan?.days?.find((d) => d.date > today && d.action === 'CHARGE')
  const relevantChargeDay = headline?.action === 'HEUTE_LADEN' ? todayPlan : headline?.action === 'WARTEN' ? futureChargeDay : null

  // Gauge zeigt beim heutigen Ladeplan das Ziel-SoC, sonst schlicht den aktuellen SoC
  // (es gibt für "Abwarten"/"Nicht laden" kein sinnvolles "Ziel für heute").
  const gaugeValue = headline?.action === 'HEUTE_LADEN' && todayPlan ? todayPlan.targetSoc : latestEntry.soc
  const gaugeLabel = headline?.action === 'HEUTE_LADEN' ? 'Ziel SoC' : 'Aktueller SoC'

  const confidenceDots = todayWeather ? Math.min(5, Math.max(1, Math.round(todayWeather.sourceAgreement * 5))) : 0

  const rangeKm = estimateRangeKm(latestEntry.soc, setup.vehicle)

  // "Nächstes Ziel": das nächste selbst gesetzte Ladeziel (Ziele-Seite), sonst
  // Fallback auf das feste Wochenendziel - beides reale, im Setup/Goals hinterlegte
  // Werte, keine Schätzung.
  const nextOwnGoal = [...goals]
    .filter((g) => g.active && g.date >= today)
    .sort((a, b) => (a.date > b.date ? 1 : -1))[0]
  const weekendDate = nextFridayFrom(today)
  const nextGoal = nextOwnGoal
    ? { date: nextOwnGoal.date, targetSoc: nextOwnGoal.targetSoc, label: 'Eigenes Ziel' }
    : { date: weekendDate, targetSoc: setup.weekend.targetPct, label: 'Wochenendziel' }

  return (
    <main style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {weatherStale && <div className="stale-banner">⚠️ Wetterdaten nicht aktuell – zuletzt bekannter Stand wird angezeigt.</div>}

      <section className="glass-card hero-card">
        <p className="hero-eyebrow">☀️ LADEEMPFEHLUNG</p>
        <div className="hero-main-row">
          <div className="hero-main-text">
            <h1 className="hero-title">{displayTitle}</h1>
            {headline?.action === 'HEUTE_LADEN' && headline.window && (
              <p className="hero-window">
                {headline.window.start}–{headline.window.end} Uhr
              </p>
            )}
            {headline?.action === 'WARTEN' && futureChargeDay && (
              <p className="hero-window">
                {weekdayNameDE(futureChargeDay.date)}
                {futureChargeDay.chargingWindow && `, ${futureChargeDay.chargingWindow.start}–${futureChargeDay.chargingWindow.end} Uhr`}
              </p>
            )}
            {headline?.action === 'NICHT_LADEN' && <p className="hero-window no-charge">Kein Ladebedarf diese Woche</p>}
            {todayWeather && (
              <span className={`chip ${todayWeather.confidence}`}>
                <Check size={13} /> {todayWeather.summary}
              </span>
            )}
          </div>
          <CircularGauge value={gaugeValue} label={gaugeLabel} />
        </div>

        <div className="hero-stats">
          {todayWeather && (
            <p className="hero-reason">Erwarteter PV-Überschuss: ~{Math.round(todayWeather.pvSurplusEstimateKwh)} kWh</p>
          )}
          <p className="hero-reason">
            {setup.vehicle.name.split(' ')[0]}: <span className="soc-from">{latestEntry.soc} %</span>
            {relevantChargeDay && (
              <>
                {' → '}
                <span className="soc-to">{relevantChargeDay.targetSoc} %</span>
              </>
            )}
          </p>
        </div>

        {todayWeather && (
          <div className="confidence-row">
            <span>Prognosesicherheit</span>
            <strong className={`confidence-text ${todayWeather.confidence}`}>{CONFIDENCE_LABEL[todayWeather.confidence]}</strong>
            <span className="confidence-dots">
              {Array.from({ length: 5 }, (_, i) => (
                <span key={i} className={`confidence-dot ${todayWeather.confidence}${i < confidenceDots ? ' filled' : ''}`} />
              ))}
            </span>
          </div>
        )}
      </section>

      {plan?.conflicts?.length > 0 && (
        <div className="conflict-banner">
          {plan.conflicts.map((c, i) => (
            <p key={i} style={{ margin: i === 0 ? 0 : '8px 0 0' }}>
              {c}
            </p>
          ))}
        </div>
      )}

      <button className="btn-primary" onClick={onUpdateSoc}>
        <Plus size={18} /> SoC aktualisieren
      </button>

      <div className="glass-card info-card info-card-full">
        <p className="info-card-label">☀️ PV heute (gesamter Tag)</p>
        <p className="info-card-value">~{Math.round(todayWeather?.pvEstimateKwh ?? 0)} kWh</p>
        <MiniAreaChart shape={todayWeather?.pvHourlyShape} />
      </div>

      {weatherDays.length > 0 && (
        <section className="glass-card">
          <div className="weather-card-header">
            <p className="stat-label" style={{ margin: 0 }}>
              🌤️ Wetter – Prognose
            </p>
            {todayWeather && (
              <span className={`confidence-text small ${todayWeather.confidence}`}>
                Prognosesicherheit: {CONFIDENCE_LABEL[todayWeather.confidence]}
              </span>
            )}
          </div>
          {todayWeather && (
            <div className="weather-today-row">
              <span className="weather-today-icon">{todayWeather.icon}</span>
              <div>
                <p className="weather-today-temp">{todayWeather.tempMaxC != null ? `${todayWeather.tempMaxC}°` : '–'}</p>
                <p className="weather-today-summary">
                  {todayWeather.summary} · {setup.location.label.split('·')[0].trim()}
                </p>
                {(todayWeather.sunHours != null || todayWeather.precipitationMm != null) && (
                  <div className="day-weather-details" style={{ marginTop: 4 }}>
                    {todayWeather.sunHours != null && <span>☀️ {todayWeather.sunHours} h Sonne</span>}
                    {todayWeather.tempMinC != null && (
                      <span>
                        🌡️ {todayWeather.tempMinC}–{todayWeather.tempMaxC} °C
                      </span>
                    )}
                    {todayWeather.precipitationMm != null && <span>🌧️ {todayWeather.precipitationMm} mm</span>}
                  </div>
                )}
              </div>
            </div>
          )}
          <WeatherCarousel days={weatherDays} />
        </section>
      )}

      <section className="glass-card compact next-goal-card">
        <div className="next-goal-icon">
          <CalendarClock size={20} />
        </div>
        <div className="next-goal-body">
          <p className="info-card-label" style={{ margin: 0 }}>
            Nächstes Ziel
          </p>
          <p className="next-goal-date">
            {weekdayNameDE(nextGoal.date)} · <span className="soc-to">{nextGoal.targetSoc} %</span>
          </p>
        </div>
        <div className="next-goal-vehicle">
          <p className="next-goal-vehicle-label">
            <Car size={13} /> {setup.vehicle.name.split(' ')[0]}
          </p>
          <p className="next-goal-vehicle-soc">{latestEntry.soc} %</p>
          <p className="info-card-sub">~{rangeKm} km verfügbar</p>
        </div>
      </section>

      <button className="details-toggle" onClick={() => setDetailsOpen((v) => !v)}>
        {detailsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Details
      </button>

      {detailsOpen && (
        <section className="glass-card compact">
          <p className="stat-label" style={{ marginBottom: 8 }}>
            Aktueller SoC: {latestEntry.soc} % (Stand {new Date(latestEntry.timestamp).toLocaleString('de-DE')})
          </p>
          <p className="stat-label" style={{ marginBottom: 8 }}>
            {consumption.message}
          </p>
          <p className="stat-label" style={{ margin: 0 }}>
            {plan?.weekMessage}
          </p>
        </section>
      )}
    </main>
  )
}
