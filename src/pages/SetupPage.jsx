import { RefreshCw } from 'lucide-react'

function Row({ label, value }) {
  return (
    <div className="list-item">
      <span style={{ color: 'var(--text-1)' }}>{label}</span>
      <span style={{ fontWeight: 700 }}>{value}</span>
    </div>
  )
}

export default function SetupPage({ data }) {
  const { setup, updateSetup, reloadWeather, weatherLoading } = data

  return (
    <main style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <section>
        <p className="section-title">PV-Anlage</p>
        <div className="glass-card compact" style={{ marginTop: 10 }}>
          <Row label="Gesamtleistung" value={`${setup.pv.totalKwp} kWp`} />
          <Row label="Ost" value={`${setup.pv.eastKwp} kWp`} />
          <Row label="West" value={`${setup.pv.westKwp} kWp`} />
        </div>
      </section>

      <section>
        <p className="section-title">Hausspeicher</p>
        <div className="glass-card compact" style={{ marginTop: 10 }}>
          <Row label="Kapazität" value={`${setup.houseBattery.capacityKwh} kWh`} />
          <Row label="Mindestreserve (abends)" value={`${setup.houseBattery.nightReservePct} %`} />
        </div>
      </section>

      <section>
        <p className="section-title">Wallbox</p>
        <div className="glass-card compact" style={{ marginTop: 10 }}>
          <Row label="Leistung" value={`${setup.wallboxKw} kW`} />
        </div>
      </section>

      <section>
        <p className="section-title">Fahrzeug</p>
        <div className="glass-card compact" style={{ marginTop: 10 }}>
          <Row label="Modell" value={setup.vehicle.name} />
          <Row label="Batteriekapazität" value={`${setup.vehicle.batteryCapacityKwh} kWh`} />
          <Row label="Sicherheitsreserve" value={`${setup.vehicle.safetyReservePct} %`} />
        </div>
      </section>

      <section>
        <p className="section-title">Wochenende</p>
        <div className="glass-card compact" style={{ marginTop: 10 }}>
          <Row label="Ziel" value={`${setup.weekend.targetPct} %`} />
          <Row label="Deadline" value="Freitag 20:00 Uhr" />
        </div>
      </section>

      <section>
        <p className="section-title">Haushalt &amp; Wärmepumpe</p>
        <div className="glass-card compact" style={{ marginTop: 10 }}>
          <Row label="Hausverbrauch Winter" value={`${setup.household.winterKwhPerDay} kWh/Tag`} />
          <Row label="Hausverbrauch Sommer" value={`${setup.household.summerKwhPerDay} kWh/Tag`} />
          <Row label="Wärmepumpe Winter" value={`${setup.heatPump.winterKwhPerDay} kWh/Tag`} />
          <Row label="Wärmepumpe Sommer" value={`${setup.heatPump.summerKwhPerDay.toFixed(1)} kWh/Tag`} />
          <div className="list-item">
            <span style={{ color: 'var(--text-1)' }}>Wärmepumpe aktiv</span>
            <button
              className="icon-btn"
              onClick={() => updateSetup({ heatPump: { ...setup.heatPump, active: !setup.heatPump.active } })}
              aria-label="Wärmepumpe umschalten"
            >
              <span className={`toggle${setup.heatPump.active ? ' on' : ''}`} style={{ pointerEvents: 'none' }}>
                <span className="knob" />
              </span>
            </button>
          </div>
        </div>
      </section>

      <section>
        <p className="section-title">Standort &amp; Wetter</p>
        <div className="glass-card compact" style={{ marginTop: 10 }}>
          <Row label="Ort" value={`${setup.location.label} (${setup.location.postcode})`} />
        </div>
        <button className="btn-secondary" style={{ marginTop: 10, width: '100%' }} onClick={reloadWeather} disabled={weatherLoading}>
          <RefreshCw size={16} /> {weatherLoading ? 'Aktualisiere…' : 'Wetterdaten neu laden'}
        </button>
      </section>

      <p className="empty-hint">Alle Daten werden ausschließlich lokal auf diesem Gerät gespeichert (localStorage).</p>
    </main>
  )
}
