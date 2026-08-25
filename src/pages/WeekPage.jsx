import { weekdayNameDE } from '../lib/date.js'
import PvBarChart from '../components/PvBarChart.jsx'

const CONFIDENCE_LABEL = { hoch: 'Hoch', mittel: 'Mittel', niedrig: 'Niedrig' }

export default function WeekPage({ data }) {
  const { plan, weatherDays, blocks } = data

  if (!plan) {
    return (
      <main>
        <p className="empty-hint">Noch keine Planung – bitte zuerst einen aktuellen SoC eintragen.</p>
      </main>
    )
  }

  const chartDays = plan.days.map((day) => {
    const weather = weatherDays.find((w) => w.date === day.date)
    return {
      date: day.date,
      weekdayLabel: weekdayNameDE(day.date),
      pvEstimateKwh: weather?.pvEstimateKwh ?? 0,
      confidence: weather?.confidence,
    }
  })

  return (
    <main style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p className="section-title">Wochenübersicht</p>

      <section className="glass-card">
        <p className="stat-label" style={{ marginBottom: 10 }}>
          PV-Prognose (kWh/Tag)
        </p>
        <PvBarChart days={chartDays} />
      </section>

      <section className="glass-card">
        {plan.days.map((day) => {
          const weather = weatherDays.find((w) => w.date === day.date)
          const dayBlocks = blocks.filter((b) => b.active && b.date === day.date)
          return (
            <div className="day-row" key={day.date}>
              <div className="day-label">{weekdayNameDE(day.date)}</div>
              <div className="day-body">
                <div className="day-summary">
                  <span>
                    {weather?.icon ?? '❔'} {weather?.summary ?? 'keine Prognose'}
                  </span>
                  {weather && <span className={`badge ${weather.confidence}`}>{CONFIDENCE_LABEL[weather.confidence]}</span>}
                </div>
                {weather && (weather.sunHours != null || weather.tempMinC != null || weather.precipitationMm != null) && (
                  <div className="day-weather-details">
                    {weather.sunHours != null && <span>☀️ {weather.sunHours} h Sonne</span>}
                    {weather.tempMinC != null && weather.tempMaxC != null && (
                      <span>
                        🌡️ {weather.tempMinC}–{weather.tempMaxC} °C
                      </span>
                    )}
                    {weather.precipitationMm != null && <span>🌧️ {weather.precipitationMm} mm</span>}
                  </div>
                )}
                {dayBlocks.length > 0 && (
                  <div className="day-action">
                    🚗 Auto benötigt {dayBlocks.map((b) => `${b.startTime}–${b.endTime}`).join(', ')}
                  </div>
                )}
                <div className={`day-action${day.action === 'CHARGE' ? ' charge' : ''}`}>
                  {day.action === 'CHARGE'
                    ? `→ ${day.chargingWindow ? `${day.chargingWindow.start}–${day.chargingWindow.end} laden` : 'laden'} · Ziel ${day.targetSoc} %`
                    : '→ nicht laden'}
                </div>
              </div>
            </div>
          )
        })}
      </section>

      {plan.conflicts?.length > 0 && (
        <div className="conflict-banner">
          {plan.conflicts.map((c, i) => (
            <p key={i} style={{ margin: i === 0 ? 0 : '8px 0 0' }}>
              {c}
            </p>
          ))}
        </div>
      )}

      <p className="empty-hint" style={{ padding: '0 8px' }}>
        {plan.weekMessage}
      </p>
    </main>
  )
}
