import { Plus } from 'lucide-react'
import { historyRows } from '../lib/consumption.js'
import { parseISODate } from '../lib/date.js'
import SocChart from '../components/SocChart.jsx'

const CONFIDENCE_LABEL = { hoch: 'Hoch', mittel: 'Mittel', niedrig: 'Niedrig' }
const ACTION_LABEL = { CHARGE: 'Laden empfohlen', NO_CHARGE: 'Nicht laden', WAIT: 'Abwarten' }

export default function SocPage({ data, onUpdateSoc }) {
  const { latestEntry, consumption, socHistory, setup, planHistoryView } = data
  const rows = historyRows(socHistory)

  const chartThresholds = [
    { value: setup.vehicle.safetyReservePct, label: 'Fahrzeug-Reserve', color: 'var(--bad)' },
    { value: setup.weekend.targetPct, label: 'Wochenendziel', color: 'var(--accent-strong)' },
  ]

  return (
    <main style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <section className="glass-card hero-card">
        <p className="hero-eyebrow">Aktueller SoC</p>
        <h1 className="hero-title">{latestEntry ? `${latestEntry.soc} %` : '–'}</h1>
        {latestEntry && (
          <p className="hero-reason">Stand: {new Date(latestEntry.timestamp).toLocaleString('de-DE')}</p>
        )}
      </section>

      <section className="glass-card">
        <p className="stat-label" style={{ marginBottom: 10 }}>
          SoC-Verlauf
        </p>
        <SocChart entries={socHistory} thresholds={chartThresholds} />
      </section>

      <section className="glass-card">
        <p className="stat-label">Verbrauch gelernt</p>
        {consumption.hasEnoughData ? (
          <>
            <p className="stat-value" style={{ marginBottom: 4 }}>
              ~{Math.round(consumption.weeklyPercent)} % / Woche
            </p>
            <p className="hero-reason">
              Werktags ~{consumption.weekdayRatePct?.toFixed(1)} %/Tag · Wochenende ~
              {consumption.weekendRatePct?.toFixed(1)} %/Tag
            </p>
            <p className="hero-reason">Basis: {consumption.validCount} gültige Verbrauchsintervalle</p>
          </>
        ) : (
          <p className="hero-reason">{consumption.message}</p>
        )}
      </section>

      <button className="btn-primary" onClick={onUpdateSoc}>
        <Plus size={18} /> SoC aktualisieren
      </button>

      <p className="section-title">Verlauf &amp; Auswertung</p>
      <section className="glass-card compact">
        {planHistoryView.length === 0 ? (
          <p className="empty-hint">Noch keine archivierten Empfehlungen – die App merkt sich ab jetzt jeden Tag, was empfohlen wurde.</p>
        ) : (
          planHistoryView.slice(0, 14).map((entry) => (
            <div className="day-row" key={entry.date}>
              <div className="day-label">{parseISODate(entry.date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}</div>
              <div className="day-body">
                <div className="day-summary">
                  <span>{ACTION_LABEL[entry.action] ?? entry.action}</span>
                  <span className={`badge ${entry.confidence}`}>{CONFIDENCE_LABEL[entry.confidence] ?? entry.confidence}</span>
                </div>
                <div className="day-action">
                  Prognose: {entry.weatherSummary || '–'} · ~{Math.round(entry.pvEstimateKwh)} kWh PV
                  {entry.action === 'CHARGE' && entry.chargingWindow && ` · Ziel ${entry.targetSoc} %`}
                </div>
                <div className="day-action">
                  {entry.actualSocAfter != null
                    ? `Tatsächlicher SoC danach: ${entry.actualSocAfter} %`
                    : 'Kein SoC-Eintrag im Anschluss gefunden'}
                </div>
              </div>
            </div>
          ))
        )}
      </section>

      <p className="section-title">Historie</p>
      <section className="glass-card compact">
        {rows.length === 0 ? (
          <p className="empty-hint">Noch keine Einträge.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="history-table">
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>SoC</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      {new Date(row.timestamp).toLocaleDateString('de-DE')}{' '}
                      {new Date(row.timestamp).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td>{row.soc} %</td>
                    <td className={row.status === 'ausgeschlossen' ? 'excluded' : ''}>{row.statusLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}
