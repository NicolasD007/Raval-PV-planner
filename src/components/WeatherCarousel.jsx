// Horizontal scrollbarer Wetter-Streifen (Mo-So) mit Punkt-Indikator, wie in
// nativen Wetter-Apps üblich. Kein externes Karussell-Paket - CSS scroll-snap
// + ein schlanker Scroll-Listener, der den nächstgelegenen Tag als "aktiv"
// markiert.

import { useRef, useState } from 'react'
import { weekdayNameDE } from '../lib/date.js'

/**
 * @param {{ days: import('../lib/types.js').WeatherDay[] }} props
 */
export default function WeatherCarousel({ days }) {
  const trackRef = useRef(null)
  const [activeIndex, setActiveIndex] = useState(0)

  if (!days || days.length === 0) return null

  const handleScroll = () => {
    const track = trackRef.current
    if (!track) return
    const children = Array.from(track.children)
    if (children.length === 0) return
    const trackCenter = track.scrollLeft + track.clientWidth / 2
    let closest = 0
    let closestDist = Infinity
    children.forEach((el, i) => {
      const dist = Math.abs(el.offsetLeft + el.offsetWidth / 2 - trackCenter)
      if (dist < closestDist) {
        closestDist = dist
        closest = i
      }
    })
    setActiveIndex(closest)
  }

  return (
    <div className="weather-carousel">
      <div className="weather-carousel-track" ref={trackRef} onScroll={handleScroll}>
        {days.map((day) => (
          <div className="weather-carousel-item" key={day.date}>
            <span className="weather-carousel-day">{weekdayNameDE(day.date)}</span>
            <span className="weather-carousel-icon">{day.icon}</span>
            <span className="weather-carousel-temp">
              {day.tempMaxC != null ? `${day.tempMaxC}°` : '–'}
              {day.tempMinC != null && <span className="weather-carousel-temp-min">/{day.tempMinC}°</span>}
            </span>
          </div>
        ))}
      </div>
      {days.length > 1 && (
        <div className="weather-carousel-dots">
          {days.map((day, i) => (
            <span key={day.date} className={`weather-carousel-dot${i === activeIndex ? ' active' : ''}`} />
          ))}
        </div>
      )}
    </div>
  )
}
