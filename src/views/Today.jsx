import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useStore, unitOf, blockOf, targetFor } from '../store.js'
import { nextDayIndex, dayNumber } from '../lib/rotation.js'
import { runsForWeek, RUN_TYPES } from '../lib/runs.js'
import { runTarget } from '../lib/block.js'
import { avg7, weeklyChange, sortedWeights } from '../lib/bodyweight.js'
import { todayISO, fmtDate, fmtNum } from '../lib/util.js'
import { Icon, Sheet } from '../components/ui.jsx'

export const fmtReps = reps => (reps.every(r => r === reps[0]) ? `${reps.length}×${reps[0]}` : reps.join('/'))

function BlockBadge({ pos }) {
  if (!pos.enabled) return null
  return (
    <span className={'badge' + (pos.isDeload ? ' deload' : '')}>
      {pos.isDeload ? 'Deload week' : `Block ${pos.block} · Week ${pos.week}/${pos.length}`}
    </span>
  )
}

function RunSheet({ type, existing, target, onClose }) {
  const logRun = useStore(s => s.logRun)
  const deleteRun = useStore(s => s.deleteRun)
  const [miles, setMiles] = useState(existing?.miles ?? target?.miles ?? '')
  const [minutes, setMinutes] = useState(existing?.minutes ?? '')
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [date, setDate] = useState(existing?.date ?? todayISO())
  const label = RUN_TYPES.find(t => t.id === type)?.label
  const save = () => {
    logRun({ id: existing?.id, type, date, miles: miles === '' ? null : Number(miles), minutes: minutes === '' ? null : Number(minutes), notes })
    onClose()
  }
  return (
    <Sheet open onClose={onClose} title={`${label} run`}>
      {target && <p className="muted small">Plan: {target.miles != null ? `${target.miles} mi` : ''}{target.miles != null && target.notes ? ' · ' : ''}{target.notes}</p>}
      <div className="form-grid">
        <label>Miles<input inputMode="decimal" value={miles} onChange={e => setMiles(e.target.value)} placeholder="optional" /></label>
        <label>Minutes<input inputMode="decimal" value={minutes} onChange={e => setMinutes(e.target.value)} placeholder="optional" /></label>
        <label className="span2">Date<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
        <label className="span2">Notes<input value={notes} onChange={e => setNotes(e.target.value)} placeholder="optional" /></label>
      </div>
      <div className="row gap">
        {existing && <button className="btn ghost danger" onClick={() => { deleteRun(existing.id); onClose() }}>Undo</button>}
        <button className="btn primary grow" onClick={save}>{existing ? 'Save' : 'Mark done'}</button>
      </div>
    </Sheet>
  )
}

function RunsCard({ S, pos }) {
  const [open, setOpen] = useState(null)
  const week = runsForWeek(S.runs, todayISO())
  return (
    <section className="card">
      <div className="card-h">
        <h2><Icon name="run" size={18} /> Runs this week</h2>
        <span className={'count' + (week.count === 3 ? ' full' : '')}>{week.count}/3</span>
      </div>
      <div className="runs">
        {RUN_TYPES.map(t => {
          const r = week[t.id]
          const tgt = runTarget(S.program?.runTargets, t.id, pos.isDeload, S.program?.block)
          return (
            <button key={t.id} className={'run-pill' + (r ? ' done' : '')} onClick={() => setOpen(t.id)}>
              <span className="run-check">{r ? <Icon name="check" size={16} stroke={3} /> : null}</span>
              <span className="run-l">{t.label}</span>
              <span className="run-s">
                {r ? [r.miles != null && `${fmtNum(r.miles)} mi`, r.minutes != null && `${fmtNum(r.minutes)} min`].filter(Boolean).join(' · ') || 'Done'
                  : tgt?.miles != null ? `${tgt.miles} mi` : '—'}
              </span>
            </button>
          )
        })}
      </div>
      {pos.isDeload && <p className="muted small">Down week: shorter runs, quality → easy + strides.</p>}
      {open && <RunSheet type={open} existing={week[open]} target={runTarget(S.program?.runTargets, open, pos.isDeload, S.program?.block)} onClose={() => setOpen(null)} />}
    </section>
  )
}

function WeightCard({ S }) {
  const addWeight = useStore(s => s.addWeight)
  const unit = unitOf(S)
  const today = todayISO()
  const todays = sortedWeights(S.bodyweight).find(e => e.date === today)
  const [v, setV] = useState('')
  const avg = avg7(S.bodyweight, today)
  const ch = weeklyChange(S.bodyweight, today)
  const save = e => {
    e.preventDefault()
    const n = Number(v)
    if (n > 0) { addWeight(n); setV('') }
  }
  return (
    <section className="card">
      <div className="card-h">
        <h2>Bodyweight</h2>
        <Link to="/body" className="link small">Trend <Icon name="chev" size={14} /></Link>
      </div>
      <form className="row gap" onSubmit={save}>
        <input className="grow" inputMode="decimal" placeholder={todays ? `Today: ${todays.weight} ${unit}` : `Today's weight (${unit})`} value={v} onChange={e => setV(e.target.value)} />
        <button className="btn primary" disabled={!(Number(v) > 0)}>{todays ? 'Update' : 'Log'}</button>
      </form>
      {avg != null && <p className="muted small">7-day avg {fmtNum(avg)} {unit}{ch != null ? ` · ${ch >= 0 ? '+' : ''}${fmtNum(ch)} vs last week` : ''}</p>}
    </section>
  )
}

export default function Today() {
  const S = useStore()
  const nav = useNavigate()
  const start = useStore(s => s.startWorkout)
  const pos = blockOf(S)
  const days = S.program?.days || []
  const next = nextDayIndex(days, S.sessions)
  const [pick, setPick] = useState(null)
  const idx = pick ?? next
  const day = days[idx]
  const unit = unitOf(S)

  const begin = () => {
    if (S.active && S.active.dayId !== day.id && !confirm('Discard the workout in progress and start this one?')) return
    if (!S.active || S.active.dayId !== day.id) start(day.id)
    nav('/workout')
  }

  return (
    <div className="page">
      <header className="top">
        <div>
          <p className="eyebrow">{fmtDate(todayISO())}</p>
          <h1>Today</h1>
        </div>
        <BlockBadge pos={pos} />
      </header>

      {!S.program ? (
        <section className="card hero empty-hero">
          <h2>No program yet</h2>
          <p className="muted">Import your split from JSON or Excel, or start from the sample PPLUL A/B.</p>
          <Link className="btn primary" to="/settings">Set up program</Link>
        </section>
      ) : (
        <>
          {S.active && (
            <button className="resume" onClick={() => nav('/workout')}>
              <span>Workout in progress: <b>{days.find(d => d.id === S.active.dayId)?.name}</b></span>
              <span className="link">Resume <Icon name="chev" size={14} /></span>
            </button>
          )}
          <section className={'card hero' + (pos.isDeload ? ' is-deload' : '')}>
            <p className="eyebrow">{idx === next ? 'Up next' : 'Picked'} · Week {day.week} · Day {dayNumber(days, idx)}</p>
            <h2 className="hero-title">{day.name}</h2>
            <ul className="preview">
              {day.exercises.map(ex => {
                const t = targetFor(S, ex, pos.isDeload)
                return (
                  <li key={ex.id}>
                    <span className="pv-name">{ex.name}</span>
                    <span className={'pv-t k-' + t.kind}>{t.weight ? `${fmtNum(t.weight)} ${unit} · ` : ''}{fmtReps(t.reps)}{t.kind === 'up' ? ' ↑' : t.kind === 'deload' ? ' ↓' : ''}</span>
                  </li>
                )
              })}
            </ul>
            <button className="btn primary big" onClick={begin}>{S.active?.dayId === day.id ? 'Resume workout' : 'Start workout'}</button>
          </section>

          <div className="chips-wrap">
            {['A', 'B', ...new Set(days.map(d => d.week))].filter((w, i, a) => a.indexOf(w) === i).map(w => {
              const ds = days.map((d, i) => [d, i]).filter(([d]) => d.week === w)
              if (!ds.length) return null
              return (
                <div key={w} className="chips">
                  <span className="chips-l">{w}</span>
                  {ds.map(([d, i]) => (
                    <button key={d.id} className={'chip' + (i === idx ? ' on' : '') + (i === next ? ' next' : '')} onClick={() => setPick(i === next ? null : i)}>{d.name}</button>
                  ))}
                </div>
              )
            })}
          </div>
        </>
      )}

      <RunsCard S={S} pos={pos} />
      <WeightCard S={S} />
    </div>
  )
}
