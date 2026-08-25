import { useState } from 'react'
import { X } from 'lucide-react'

/**
 * "+ SoC aktualisieren" - Abschnitt 5/7. Statt freier Texteingabe ("Raval 72 %,
 * extern zwischengeladen") ein kurzes, robustes Formular mit denselben
 * Angaben - zuverlässiger als NLP-Parsing, Datum/Uhrzeit werden automatisch
 * mitgespeichert (siehe storage.addSocEntry). Der Beispieltext bleibt als
 * Format-Hilfe sichtbar (Abschnitt 7).
 */
export default function SocUpdateSheet({ onClose, onSubmit }) {
  const [soc, setSoc] = useState('')
  const [externalCharge, setExternalCharge] = useState(false)
  const [homeCharge, setHomeCharge] = useState(false)
  const [note, setNote] = useState('')

  const socNumber = Number(soc)
  const valid = soc !== '' && Number.isFinite(socNumber) && socNumber >= 0 && socNumber <= 100

  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-label="SoC aktualisieren">
      <div className="sheet">
        <div className="sheet-handle" />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="sheet-title">SoC aktualisieren</div>
          <button className="icon-btn" onClick={onClose} aria-label="Schließen">
            <X size={18} />
          </button>
        </div>

        <p className="field hint" style={{ marginTop: 8 }}>
          {'Bitte z. B.:\nRaval 72 %\noder:\nRaval 72 %, extern zwischengeladen'}
        </p>

        <div className="field">
          <label htmlFor="soc-input">Aktueller SoC (%)</label>
          <input
            id="soc-input"
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            autoFocus
            value={soc}
            onChange={(e) => setSoc(e.target.value)}
            placeholder="z. B. 72"
          />
        </div>

        <label className="checkbox-row">
          <input type="checkbox" checked={externalCharge} onChange={(e) => setExternalCharge(e.target.checked)} />
          extern zwischengeladen (zählt nicht zum Verbrauchsschnitt)
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={homeCharge} onChange={(e) => setHomeCharge(e.target.checked)} />
          zuhause außerplanmäßig zwischengeladen
        </label>

        <div className="field" style={{ marginTop: 6 }}>
          <label htmlFor="soc-note">Notiz (optional)</label>
          <input id="soc-note" type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" />
        </div>

        <button
          className="btn-primary"
          disabled={!valid}
          style={{ opacity: valid ? 1 : 0.5 }}
          onClick={() => valid && onSubmit({ soc: socNumber, externalCharge, homeCharge, note })}
        >
          Speichern
        </button>
      </div>
    </div>
  )
}
