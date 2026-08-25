// Reines SVG-Liniendiagramm für den SoC-Verlauf - keine Chart-Bibliothek nötig.
// Y-Achse ist bewusst fest auf 0-100% skaliert (Prozentwert, kein Auto-Scaling),
// damit die Kurve nicht optisch dramatischer wirkt, als sie ist.

const WIDTH = 320
const HEIGHT = 130
const PAD_LEFT = 30
const PAD_RIGHT = 8
const PAD_TOP = 10
const PAD_BOTTOM = 22
const GRID_VALUES = [0, 25, 50, 75, 100]

/**
 * @param {{ entries: import('../lib/types.js').SocEntry[], thresholds?: {value:number,label:string,color:string}[], maxPoints?: number }} props
 */
export default function SocChart({ entries, thresholds = [], maxPoints = 20 }) {
  const sorted = [...entries].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)).slice(-maxPoints)

  if (sorted.length < 2) {
    return <p className="empty-hint" style={{ padding: '16px 0' }}>Noch zu wenige Einträge für einen Verlauf.</p>
  }

  const plotWidth = WIDTH - PAD_LEFT - PAD_RIGHT
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM
  const xFor = (i) => PAD_LEFT + (i / (sorted.length - 1)) * plotWidth
  const yFor = (soc) => PAD_TOP + (1 - soc / 100) * plotHeight

  const points = sorted.map((e, i) => `${xFor(i)},${yFor(e.soc)}`).join(' ')
  const labelIndices = [...new Set([0, Math.floor((sorted.length - 1) / 2), sorted.length - 1])]

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="soc-chart" role="img" aria-label="SoC-Verlauf über die Zeit">
      {GRID_VALUES.map((v) => (
        <line key={`grid-${v}`} x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={yFor(v)} y2={yFor(v)} className="chart-gridline" />
      ))}
      {GRID_VALUES.map((v) => (
        <text key={`label-${v}`} x={PAD_LEFT - 6} y={yFor(v) + 3} className="chart-axis-label" textAnchor="end">
          {v}
        </text>
      ))}
      {thresholds.map((t) => (
        <line
          key={t.label}
          x1={PAD_LEFT}
          x2={WIDTH - PAD_RIGHT}
          y1={yFor(t.value)}
          y2={yFor(t.value)}
          className="chart-threshold"
          stroke={t.color}
        />
      ))}
      <polyline points={points} className="chart-line" fill="none" />
      {sorted.map((e, i) => (
        <circle key={e.id ?? i} cx={xFor(i)} cy={yFor(e.soc)} r={2.6} className="chart-dot" />
      ))}
      {labelIndices.map((i) => {
        // Rand-Labels an der Kante verankern statt zentriert, sonst können sie
        // über den viewBox-Rand hinausragen (abgeschnittener Text).
        const anchor = i === 0 ? 'start' : i === sorted.length - 1 ? 'end' : 'middle'
        return (
          <text key={`x-${i}`} x={xFor(i)} y={HEIGHT - 4} className="chart-axis-label" textAnchor={anchor}>
            {new Date(sorted[i].timestamp).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
          </text>
        )
      })}
    </svg>
  )
}
