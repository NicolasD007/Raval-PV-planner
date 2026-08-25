// Kleine Sparkline für die "PV heute"-Karte. Zeichnet den echten, auf 0-1
// normierten Stunden-Einstrahlungsverlauf (WeatherDay.pvHourlyShape aus
// weather.js) - keine erfundene Dekokurve, sondern abgeleitet aus den
// tatsächlichen Modell-Rohdaten (siehe parseForecastResponse()).

const WIDTH = 240
const HEIGHT = 56

/**
 * @param {{ shape: number[]|null }} props
 */
export default function MiniAreaChart({ shape }) {
  if (!shape || shape.length < 2) return null

  const stepX = WIDTH / (shape.length - 1)
  const points = shape.map((v, i) => [i * stepX, HEIGHT - v * HEIGHT])
  const linePath = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L${WIDTH},${HEIGHT} L0,${HEIGHT} Z`

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="mini-area-chart" preserveAspectRatio="none" role="presentation">
      <defs>
        <linearGradient id="mini-area-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--good)" stopOpacity="0.45" />
          <stop offset="100%" stopColor="var(--good)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#mini-area-fill)" stroke="none" />
      <path d={linePath} fill="none" stroke="var(--good)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
