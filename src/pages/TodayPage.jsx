import { useState } from 'react'
import { Plus, ChevronDown, ChevronUp } from 'lucide-react'

const CONFIDENCE_LABEL = { hoch: 'Hoch', mittel: 'Mittel', niedrig: 'Niedrig' }

export default function TodayPage({ data, onUpdateSoc }) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const { plan, weatherDays, latestEntry, weatherStale, setup, consumption } = data

  const todayWeather = weatherDays.find((w) => w.date === plan?.days?.[0]?.date) ?? weatherDays[0]

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

  return (
    <main style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {weatherStale && <div className="stale-banner">⚠️ Wetterdaten nicht aktuell – zuletzt bekannter Stand wird angezeigt.</div>}

      <section className="glass-card hero-card">
        <p className="hero-eyebrow">LADEEMPFEHLUNG</p>
        <h1 className="hero-title">{headline?.title ?? '…'}</h1>
        {headline?.window && (
          <p className="hero-window">
            {headline.window.start}–{headline.window.end}
          </p>
        )}
        <p className="hero-soc">{headline?.subtitle}</p>
        <p className="hero-reason">{headline?.reason}</p>
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

      <div className="stat-grid">
        <div className="glass-card stat-card">
          <p className="stat-label">PV heute</p>
          <p className="stat-value">~{Math.round(todayWeather?.pvEstimateKwh ?? 0)} kWh</p>
        </div>
        <div className="glass-card stat-card">
          <p className="stat-label">PV-Überschuss</p>
          <p className="stat-value">~{Math.round(todayWeather?.pvSurplusEstimateKwh ?? 0)} kWh</p>
        </div>
        <div className="glass-card stat-card">
          <p className="stat-label">Speicher-Nachtreserve (Ziel)</p>
          <p className="stat-value">{setup.houseBattery.nightReservePct} %</p>
        </div>
        <div className="glass-card stat-card">
          <p className="stat-label">Prognosesicherheit</p>
          <p className="stat-value">{CONFIDENCE_LABEL[todayWeather?.confidence] ?? '–'}</p>
        </div>
      </div>

      <button className="btn-primary" onClick={onUpdateSoc}>
        <Plus size={18} /> SoC aktualisieren
      </button>

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
