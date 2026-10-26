import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useStore, unitOf, blockOf, targetFor } from '../store.js'
import { historyFor, exKey, topWeight } from '../lib/progression.js'
import { dateOf, fmtDate, fmtNum, e1rm } from '../lib/util.js'
import LineChart from '../components/LineChart.jsx'
import { Icon, Segmented } from '../components/ui.jsx'
import { fmtReps } from './Today.jsx'

export default function ExerciseDetail() {
  const { key } = useParams()
  const nav = useNavigate()
  const S = useStore()
  const [metric, setMetric] = useState('top')
  const unit = unitOf(S)
  const k = decodeURIComponent(key)
  const ex = S.program?.days.flatMap(d => d.exercises).find(e => exKey(e.name) === k)
  const name = ex?.name || S.sessions.flatMap(s => s.entries || []).find(e => exKey(e.name) === k)?.name || k
  const hist = historyFor(S.sessions, name, { includeDeload: true })
  const work = hist.filter(h => !h.deload)

  const points = work.map(h => {
    const top = topWeight(h)
    const best = Math.max(...h.sets.map(s => e1rm(s.w, s.r)))
    const vol = h.sets.reduce((n, s) => n + s.w * s.r, 0)
    return { t: +dateOf(h.date), d: h.date, y: metric === 'top' ? top : metric === 'e1rm' ? Math.round(best) : vol, note: h.sets.map(s => s.r).join('/') }
  })
  const next = ex ? targetFor(S, ex, blockOf(S).isDeload) : null

  return (
    <div className="page">
      <header className="top">
        <button className="iconbtn" aria-label="Back" onClick={() => nav(-1)}><Icon name="back" /></button>
        <h1 className="h-sm grow">{name}</h1>
      </header>
      {next && (
        <section className="card">
          <p className="eyebrow">Next time</p>
          <p className="target"><b>{next.weight ? `${fmtNum(next.weight)} ${unit}` : 'Bodyweight'}</b> · {fmtReps(next.reps)}{next.rir != null ? ` · RIR ${next.rir}` : ''}</p>
          <p className="reason">{next.reason}</p>
        </section>
      )}
      <section className="card">
        <Segmented value={metric} onChange={setMetric} options={[{ value: 'top', label: 'Top set' }, { value: 'e1rm', label: 'Est. 1RM' }, { value: 'vol', label: 'Volume' }]} />
        <LineChart points={points} unit={unit} />
      </section>
      <ul className="list card">
        {hist.slice().reverse().map((h, i) => (
          <li key={i} className="lrow"><div className="lrow-h">
            <span><b>{fmtDate(h.date, true)}</b>{h.deload && <span className="badge deload sm">Deload</span>}<br />
              <span className="muted small">{h.sets.map(s => `${fmtNum(s.w)}×${s.r}`).join('  ')}</span></span>
            <span className="muted small">e1RM {fmtNum(Math.max(...h.sets.map(s => e1rm(s.w, s.r))))}</span>
          </div></li>
        ))}
        {!hist.length && <li className="empty">No sets logged yet.</li>}
      </ul>
    </div>
  )
}
