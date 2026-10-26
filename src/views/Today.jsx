import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useStore, unitOf, blockOf, targetFor } from '../store.js'
import { nextDayIndex, dayNumber } from '../lib/rotation.js'
import { runsForWeek, programRuns, runTarget, runKm } from '../lib/runs.js'
import { normalizeBlock } from '../lib/block.js'
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

function RunSheet({ item, target, existing, onClose }) {
  const logRun = useStore(s => s.logRun)
  const deleteRun = useStore(s => s.deleteRun)
  const [km, setKm] = useState(existing ? String(runKm(existing) ?? '') : '')
  const [minutes, setMinutes] = useState(existing?.minutes ?? '')
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [date, setDate] = useState(existing?.date ?? todayISO())
  const ok = Number(km) > 0
  const save = e => {
    e.preventDefault()
    if (!ok) return
    logRun({ id: existing?.id, planId: item.id, name: item.name, date, km: Number(km), minutes: minutes === '' ? null : Number(minutes), notes })
    onClose()
  }
  const plan = [target.km != null && `${fmtNum(target.km)} km`, target.notes].filter(Boolean).join(' · ')
  return (
    <Sheet open onClose={onClose} title={item.name}>
      {plan && <p className="muted small">Plan: {plan}</p>}
      <form className="form-grid" onSubmit={save}>
        <label>Distance (km)<input autoFocus inputMode="decimal" required value={km} onChange={e => setKm(e.target.value.replace(',', '.'))} placeholder={target.km != null ? `plan ${fmtNum(target.km)}` : 'km'} /></label>
        <label>Minutes<input inputMode="decimal" value={minutes} onChange={e => setMinutes(e.target.value)} placeholder="optional" /></label>
        <label className="span2">Date<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
        <label className="span2">Notes<input value={notes} onChange={e => setNotes(e.target.value)} placeholder="optional, e.g. felt easy, hilly" /></label>
        <div className="row gap span2">
          {existing && <button type="button" className="btn ghost danger" onClick={() => { deleteRun(existing.id); onClose() }}>Undo</button>}
          <button className="btn primary grow" disabled={!ok}>{existing ? 'Save' : 'Mark done'}</button>
        </div>
      </form>
    </Sheet>
  )
}

function RunsCard({ S, pos }) {
  const [open, setOpen] = useState(null)
  const { enabled, plan } = programRuns(S.program)
  if (!S.program || !enabled || !plan.length) return null
  const factor = normalizeBlock(S.program.block).runDeloadFactor
  const week = runsForWeek(S.runs, todayISO(), plan)
  const item = plan.find(p => p.id === open)
  return (
    <section className="card">
      <div className="card-h">
        <h2><Icon name="run" size={18} /> Runs this week</h2>
        <span className={'count' + (week.count === plan.length ? ' full' : '')}>{week.count}/{plan.length}{week.km ? ` · ${fmtNum(week.km)} km` : ''}</span>
      </div>
      <div className="runs">
        {plan.map(p => {
          const r = week.done[p.id]
          const t = runTarget(p, pos.isDeload, factor)
          return (
            <button key={p.id} className={'run-pill' + (r ? ' done' : '')} onClick={() => setOpen(p.id)}>
              <span className="run-check">{r ? <Icon name="check" size={16} stroke={3} /> : null}</span>
              <span className="run-l">{p.name}</span>
              <span className="run-s">
                {r ? [runKm(r) != null && `${fmtNum(runKm(r))} km`, r.minutes != null && `${fmtNum(r.minutes)} min`].filter(Boolean).join(' · ') || 'Done'
                  : t.km != null ? `${fmtNum(t.km)} km` : ' '}
              </span>
            </button>
          )
        })}
      </div>
      {pos.isDeload && <p className="muted small">Deload week: planned distances at {Math.round(factor * 100)}%, keep every run easy.</p>}
      {item && <RunSheet item={item} target={runTarget(item, pos.isDeload, factor)} existing={week.done[item.id]} onClose={() => setOpen(null)} />}
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
  const twoWeeks = new Set(days.map(d => d.week)).size > 1

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
          <p className="muted">Start from a template (Push/Pull/Legs, Upper/Lower or Full body) and make it yours, or import a spreadsheet in Settings.</p>
          <Link className="btn primary" to="/program">Build a program</Link>
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
            <p className="eyebrow">{idx === next ? 'Up next' : 'Picked'}{twoWeeks ? ` · Week ${day.week}` : ''} · Day {dayNumber(days, idx)}</p>
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
                  {twoWeeks && <span className="chips-l">{w}</span>}
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
