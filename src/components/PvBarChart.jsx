// Einfaches CSS-Balkendiagramm für die Wochen-PV-Prognose - bewusst reines CSS
// (Höhe per Prozent-Style) statt SVG, da hier keine Achsen/Kurven nötig sind.

const CONFIDENCE_COLOR_VAR = { hoch: 'var(--good)', mittel: 'var(--warn)', niedrig: 'var(--bad)' }

/**
 * @param {{ days: { date:string, weekdayLabel:string, pvEstimateKwh:number, confidence?:string }[] }} props
 */
export default function PvBarChart({ days }) {
  const max = Math.max(1, ...days.map((d) => d.pvEstimateKwh ?? 0))

  return (
    <div className="pv-bar-chart" role="img" aria-label="PV-Prognose der Woche als Balkendiagramm">
      {days.map((d) => {
        const heightPct = Math.max(4, ((d.pvEstimateKwh ?? 0) / max) * 100)
        return (
          <div className="pv-bar-col" key={d.date}>
            <span className="pv-bar-value">{Math.round(d.pvEstimateKwh ?? 0)}</span>
            <div className="pv-bar-track">
              <div
                className="pv-bar-fill"
                style={{ height: `${heightPct}%`, background: CONFIDENCE_COLOR_VAR[d.confidence] ?? 'var(--glass-fill-strong)' }}
              />
            </div>
            <span className="pv-bar-label">{d.weekdayLabel}</span>
          </div>
        )
      })}
    </div>
  )
}
