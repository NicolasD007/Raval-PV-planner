import { Plus } from 'lucide-react'
import { historyRows } from '../lib/consumption.js'

export default function SocPage({ data, onUpdateSoc }) {
  const { latestEntry, consumption, socHistory } = data
  const rows = historyRows(socHistory)

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
