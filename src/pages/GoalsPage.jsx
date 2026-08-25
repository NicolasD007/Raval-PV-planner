import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { weekdayNameDE } from '../lib/date.js'

const TARGET_OPTIONS = [60, 70, 80, 90, 100]

export default function GoalsPage({ data }) {
  const { goals, saveGoal, removeGoal, blocks, saveBlock, removeBlock } = data

  const [goalDate, setGoalDate] = useState('')
  const [goalTarget, setGoalTarget] = useState(100)

  const [blockDate, setBlockDate] = useState('')
  const [blockStart, setBlockStart] = useState('07:00')
  const [blockEnd, setBlockEnd] = useState('17:00')

  const sortedGoals = [...goals].sort((a, b) => (a.date > b.date ? 1 : -1))
  const sortedBlocks = [...blocks].sort((a, b) => (a.date > b.date ? 1 : -1))

  return (
    <main style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <section>
        <p className="section-title">Neue Anforderung</p>
        <div className="glass-card" style={{ marginTop: 10 }}>
          <div className="field">
            <label htmlFor="goal-date">Datum</label>
            <input id="goal-date" type="date" value={goalDate} onChange={(e) => setGoalDate(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="goal-target">Ziel</label>
            <select id="goal-target" value={goalTarget} onChange={(e) => setGoalTarget(Number(e.target.value))}>
              {TARGET_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t === 100 ? '100 % (voll)' : `${t} %`}
                </option>
              ))}
            </select>
          </div>
          <button
            className="btn-primary"
            disabled={!goalDate}
            style={{ opacity: goalDate ? 1 : 0.5 }}
            onClick={() => {
              saveGoal({ date: goalDate, targetSoc: goalTarget, active: true })
              setGoalDate('')
            }}
          >
            Ziel speichern
          </button>
        </div>
      </section>

      <section>
        <p className="section-title">Bestehende Ziele</p>
        <div className="glass-card compact" style={{ marginTop: 10 }}>
          {sortedGoals.length === 0 ? (
            <p className="empty-hint">Noch keine Ziele hinterlegt.</p>
          ) : (
            sortedGoals.map((g) => (
              <div className="list-item" key={g.id}>
                <span>
                  {new Date(g.date).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })} ·{' '}
                  {g.targetSoc} %
                </span>
                <div className="list-item-actions">
                  <button className="icon-btn btn-danger" onClick={() => removeGoal(g.id)} aria-label="Ziel löschen">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section>
        <p className="section-title">Auto-Verfügbarkeit (Sperrzeiten)</p>
        <div className="glass-card" style={{ marginTop: 10 }}>
          <div className="field">
            <label htmlFor="block-date">Datum</label>
            <input id="block-date" type="date" value={blockDate} onChange={(e) => setBlockDate(e.target.value)} />
          </div>
          <div className="row-gap">
            <div className="field">
              <label htmlFor="block-start">Von</label>
              <input id="block-start" type="time" value={blockStart} onChange={(e) => setBlockStart(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="block-end">Bis</label>
              <input id="block-end" type="time" value={blockEnd} onChange={(e) => setBlockEnd(e.target.value)} />
            </div>
          </div>
          <button
            className="btn-primary"
            disabled={!blockDate}
            style={{ opacity: blockDate ? 1 : 0.5 }}
            onClick={() => {
              saveBlock({ date: blockDate, startTime: blockStart, endTime: blockEnd, active: true })
              setBlockDate('')
              setBlockStart('07:00')
              setBlockEnd('17:00')
            }}
          >
            Sperrzeit speichern
          </button>
        </div>

        <div className="glass-card compact" style={{ marginTop: 10 }}>
          {sortedBlocks.length === 0 ? (
            <p className="empty-hint">Keine Sperrzeiten – das Auto ist an allen Tagen frei.</p>
          ) : (
            sortedBlocks.map((b) => (
              <div className="list-item" key={b.id}>
                <span>
                  {weekdayNameDE(b.date)} {new Date(b.date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })} ·{' '}
                  {b.active ? `Auto benötigt ${b.startTime}–${b.endTime}` : 'freigegeben'}
                </span>
                <div className="list-item-actions">
                  <button
                    className="toggle-btn icon-btn"
                    onClick={() => saveBlock({ ...b, active: !b.active })}
                    aria-label={b.active ? 'freigeben' : 'aktivieren'}
                  >
                    <span className={`toggle${b.active ? ' on' : ''}`} style={{ pointerEvents: 'none' }}>
                      <span className="knob" />
                    </span>
                  </button>
                  <button className="icon-btn btn-danger" onClick={() => removeBlock(b.id)} aria-label="Sperrzeit löschen">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </main>
  )
}
