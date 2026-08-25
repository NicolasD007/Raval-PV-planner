import { useRef, useState } from 'react'
import { RefreshCw, Download, Upload } from 'lucide-react'

function Row({ label, value }) {
  return (
    <div className="list-item">
      <span style={{ color: 'var(--text-1)' }}>{label}</span>
      <span style={{ fontWeight: 700 }}>{value}</span>
    </div>
  )
}

export default function SetupPage({ data }) {
  const { setup, updateSetup, reloadWeather, weatherLoading, exportBackup, importBackup } = data
  const fileInputRef = useRef(null)
  const [backupMessage, setBackupMessage] = useState(null)

  const handleExport = () => {
    const backup = exportBackup()
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `raval-pv-planner-backup-${backup.exportedAt.slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    setBackupMessage({ type: 'ok', text: 'Backup wurde heruntergeladen.' })
  }

  const handleImportClick = () => {
    if (!window.confirm('Import überschreibt SoC-Historie, Ziele, Sperrzeiten, Setup und Verlauf auf diesem Gerät mit dem Inhalt der Datei. Fortfahren?')) {
      return
    }
    fileInputRef.current?.click()
  }

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = '' // gleiche Datei später erneut auswählbar machen
    if (!file) return
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      const imported = importBackup(parsed)
      setBackupMessage({ type: 'ok', text: `Importiert: ${imported.join(', ')}.` })
    } catch (err) {
      setBackupMessage({ type: 'error', text: err.message ?? 'Import fehlgeschlagen.' })
    }
  }

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

      <section>
        <p className="section-title">Daten &amp; Backup</p>
        <div className="glass-card compact" style={{ marginTop: 10 }}>
          <p className="hero-reason" style={{ marginBottom: 12 }}>
            Alle Daten liegen ausschließlich lokal auf diesem Gerät (localStorage). Ohne Backup gehen SoC-Historie, Ziele,
            Sperrzeiten und Verlauf verloren, falls der Browser-Speicher gelöscht wird.
          </p>
          <div className="row-gap">
            <button className="btn-secondary" onClick={handleExport}>
              <Download size={16} /> Exportieren
            </button>
            <button className="btn-secondary" onClick={handleImportClick}>
              <Upload size={16} /> Importieren
            </button>
          </div>
          <input ref={fileInputRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={handleFileChange} />
          {backupMessage && (
            <p className="hero-reason" style={{ marginTop: 10, color: backupMessage.type === 'error' ? 'var(--bad)' : 'var(--good)' }}>
              {backupMessage.text}
            </p>
          )}
        </div>
      </section>

      <p className="empty-hint">Alle Daten werden ausschließlich lokal auf diesem Gerät gespeichert (localStorage).</p>
    </main>
  )
}
