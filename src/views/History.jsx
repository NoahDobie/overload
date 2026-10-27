import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore, unitOf, runUnitOf } from '../store.js'
import { live, fmtDate, fmtNum, byDate } from '../lib/util.js'
import { exKey } from '../lib/progression.js'
import { runName, runKm, programRuns, fmtDist } from '../lib/runs.js'
import Heatmap from '../components/Heatmap.jsx'
import { Icon, Segmented } from '../components/ui.jsx'

function SessionRow({ s, dayName, unit }) {
  const [open, setOpen] = useState(false)
  const del = useStore(x => x.deleteSession)
  const sets = s.entries.reduce((n, e) => n + e.sets.filter(x => x.done).length, 0)
  return (
    <li className="lrow">
      <button className="lrow-h" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>
          <b>{dayName}</b>{s.deload && <span className="badge deload sm">Deload</span>}
          <br /><span className="muted small">{fmtDate(s.date, true)} · {sets} sets{s.durationMin ? ` · ${s.durationMin} min` : ''}</span>
        </span>
        <Icon name="chev" size={16} />
      </button>
      {open && (
        <div className="lrow-b">
          {s.entries.map((e, i) => (
            <p key={i} className="small">
              <Link className="link" to={`/exercise/${encodeURIComponent(exKey(e.name))}`}>{e.name}</Link>{' '}
              <span className="muted">{e.sets.filter(x => x.done).map(x => `${fmtNum(x.w)}×${x.r}`).join(', ') || '—'} {unit}</span>
            </p>
          ))}
          <div className="row gap">
            <Link className="btn ghost small" to={`/session/${s.id}`}>Edit</Link>
            <button className="btn ghost danger small" onClick={() => { if (confirm('Delete this session?')) del(s.id) }}><Icon name="trash" size={14} /> Delete</button>
          </div>
        </div>
      )}
    </li>
  )
}

export default function History() {
  const S = useStore()
  const [tab, setTab] = useState('lifts')
  const unit = unitOf(S)
  const sessions = live(S.sessions).sort(byDate).reverse()
  const runs = live(S.runs).sort(byDate).reverse()
  const { plan } = programRuns(S.program)
  const dayName = id => S.program?.days.find(d => d.id === id)?.name || id
  const deleteRun = S.deleteRun

  const exercises = new Map()
  for (const s of sessions) for (const e of s.entries) if (!exercises.has(exKey(e.name))) exercises.set(exKey(e.name), e.name)

  return (
    <div className="page">
      <header className="top"><h1>History</h1></header>
      <section className="card">
        <Heatmap sessions={S.sessions} runs={S.runs} block={S.program?.block} blockStart={S.settings?.blockStart} />
      </section>

      <Segmented value={tab} onChange={setTab} options={[{ value: 'lifts', label: 'Sessions' }, { value: 'ex', label: 'Exercises' }, { value: 'runs', label: 'Runs' }]} />

      {tab === 'lifts' && (sessions.length
        ? <ul className="list card">{sessions.map(s => <SessionRow key={s.id} s={s} dayName={dayName(s.dayId)} unit={unit} />)}</ul>
        : <p className="empty">No workouts logged yet.</p>)}

      {tab === 'ex' && (exercises.size
        ? <ul className="list card">{[...exercises].sort((a, b) => a[1].localeCompare(b[1])).map(([k, name]) => (
          <li key={k} className="lrow"><Link className="lrow-h" to={`/exercise/${encodeURIComponent(k)}`}><b>{name}</b><Icon name="chev" size={16} /></Link></li>
        ))}</ul>
        : <p className="empty">No exercises logged yet.</p>)}

      {tab === 'runs' && (runs.length
        ? <ul className="list card">{runs.map(r => (
          <li key={r.id} className="lrow">
            <div className="lrow-h">
              <span><b>{runName(r, plan)}</b><br />
                <span className="muted small">{fmtDate(r.date, true)}{runKm(r) != null ? ` · ${fmtDist(runKm(r), runUnitOf(S))}` : ''}{r.minutes != null ? ` · ${fmtNum(r.minutes)} min` : ''}{r.notes ? ` · ${r.notes}` : ''}</span></span>
              <button className="iconbtn" aria-label="Delete run" onClick={() => { if (confirm('Delete this run?')) deleteRun(r.id) }}><Icon name="trash" size={16} /></button>
            </div>
          </li>
        ))}</ul>
        : <p className="empty">No runs logged yet.</p>)}
    </div>
  )
}
