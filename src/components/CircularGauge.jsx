// Kreisförmiger Gauge (z.B. für "Ziel SoC" auf der Heute-Seite). Reines SVG,
// keine Chart-Bibliothek. Der Ring ist unten offen (Lücke), kein Vollkreis -
// klassische "Aktivitätsring"-Optik.

const SIZE = 132
const STROKE = 12
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
// Ring deckt 270° ab, offen unten (Lücke von 90°, zentriert bei 6 Uhr).
const ARC_FRACTION = 0.75
const ARC_LENGTH = CIRCUMFERENCE * ARC_FRACTION
const ROTATION_DEG = 135 // Start der Lücke unten-links, im Uhrzeigersinn

/**
 * @param {{ value: number, label: string, color?: string }} props
 */
export default function CircularGauge({ value, label, color = 'var(--good)' }) {
  const clamped = Math.min(100, Math.max(0, value ?? 0))
  const progressLength = (clamped / 100) * ARC_LENGTH

  return (
    <div className="circular-gauge" style={{ width: SIZE, height: SIZE }}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} role="img" aria-label={`${label}: ${clamped} %`}>
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={`${ARC_LENGTH} ${CIRCUMFERENCE - ARC_LENGTH}`}
          transform={`rotate(${ROTATION_DEG} ${SIZE / 2} ${SIZE / 2})`}
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={`${progressLength} ${CIRCUMFERENCE - progressLength}`}
          transform={`rotate(${ROTATION_DEG} ${SIZE / 2} ${SIZE / 2})`}
          className="circular-gauge-progress"
        />
      </svg>
      <div className="circular-gauge-center">
        <span className="circular-gauge-value">{Math.round(clamped)} %</span>
        {label && <span className="circular-gauge-sublabel">{label}</span>}
      </div>
    </div>
  )
}
