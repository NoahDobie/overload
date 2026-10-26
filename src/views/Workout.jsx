import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore, unitOf, blockOf } from '../store.js'
import { fmtNum } from '../lib/util.js'
import { Icon, Stepper } from '../components/ui.jsx'

function Elapsed({ since }) {
  const [, tick] = useState(0)
  useEffect(() => { const t = setInterval(() => tick(x => x + 1), 15000); return () => clearInterval(t) }, [])
  const m = Math.floor((Date.now() - since) / 60000)
  return <span>{m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`}</span>
}

function ExerciseCard({ entry, ei, ex, unit }) {
  const updateSet = useStore(s => s.updateSet)
  const addSet = useStore(s => s.addSet)
  const removeSet = useStore(s => s.removeSet)
  const t = entry.target
  const allDone = entry.sets.every(s => s.done)
  const range = ex ? (ex.repMin === ex.repMax ? `${ex.repMin}` : `${ex.repMin}–${ex.repMax}`) : ''
  return (
    <section className={'card ex' + (allDone ? ' complete' : '')}>
      <div className="ex-h">
        <h2>{entry.name}</h2>
        <span className={'tag k-' + t.kind}>{t.kind === 'up' ? '↑ Add weight' : t.kind === 'deload' ? '↓ Reset' : t.kind === 'block-deload' ? 'Deload' : t.kind === 'start' ? 'New' : t.kind === 'reps' ? '+ Reps' : 'Beat it'}</span>
      </div>
      <p className="target">
        {t.weight ? <b>{fmtNum(t.weight)} {unit}</b> : <b>Bodyweight</b>}
        {' × '}{range} reps · {entry.sets.length} sets{t.rir != null ? ` · RIR ${t.rir}` : ''}
      </p>
      <p className="reason">{t.reason}</p>
      {ex?.notes && <p className="muted small">{ex.notes}</p>}
      <div className="sets">
        <div className="set-h"><span>Set</span><span>{unit}</span><span>Reps</span><span /></div>
        {entry.sets.map((s, si) => (
          <div key={si} className={'set' + (s.done ? ' done' : '')}>
            <span className="set-n">{si + 1}</span>
            <Stepper label={`set ${si + 1} weight`} value={s.w} step={ex?.increment || 5} onChange={w => updateSet(ei, si, { w })} />
            <Stepper label={`set ${si + 1} reps`} value={s.r} step={1} width={40} onChange={r => updateSet(ei, si, { r })} />
            <button className="tick" aria-label={s.done ? `Undo set ${si + 1}` : `Done set ${si + 1}`} aria-pressed={s.done}
              onClick={() => updateSet(ei, si, { done: !s.done })}><Icon name="check" size={20} stroke={3} /></button>
          </div>
        ))}
      </div>
      <div className="row gap end">
        <button className="btn ghost small" onClick={() => removeSet(ei)} disabled={entry.sets.length <= 1}><Icon name="minus" size={14} /> Set</button>
        <button className="btn ghost small" onClick={() => addSet(ei)}><Icon name="plus" size={14} /> Set</button>
      </div>
    </section>
  )
}

export default function Workout() {
  const S = useStore()
  const nav = useNavigate()
  const { finishWorkout, discardWorkout, setActiveDeload } = S
  const a = S.active
  useEffect(() => { if (!a) nav('/', { replace: true }) }, [a, nav])
  if (!a) return null
  const day = S.program?.days.find(d => d.id === a.dayId)
  const unit = unitOf(S)
  const done = a.entries.reduce((n, e) => n + e.sets.filter(s => s.done).length, 0)
  const total = a.entries.reduce((n, e) => n + e.sets.length, 0)
  const pos = blockOf(S)

  const finish = () => {
    if (done === 0) { alert('Check off at least one set first.'); return }
    if (done < total && !confirm(`${total - done} set${total - done > 1 ? 's' : ''} not checked off. Unchecked sets count as not done. Finish anyway?`)) return
    finishWorkout()
    nav('/')
  }
  const discard = () => { if (confirm('Discard this workout? Nothing will be saved.')) { discardWorkout(); nav('/') } }

  return (
    <div className="page workout">
      <header className="top sticky">
        <button className="iconbtn" aria-label="Back" onClick={() => nav('/')}><Icon name="back" /></button>
        <div className="grow">
          <h1 className="h-sm">{day?.name || 'Workout'}</h1>
          <p className="eyebrow"><Elapsed since={a.startedAt} /> · {done}/{total} sets</p>
        </div>
        <button className="btn primary" onClick={finish}>Finish</button>
      </header>
      <div className="progress"><div style={{ width: `${total ? done / total * 100 : 0}%` }} /></div>

      {pos.enabled && (
        <label className="toggle-row card">
          <span><b>Deload session</b><br /><span className="muted small">{a.deload ? 'Fewer sets, same weight, more in the tank. Not used for progression.' : 'Turn on to run this as a light session.'}</span></span>
          <input type="checkbox" checked={!!a.deload} onChange={e => setActiveDeload(e.target.checked)} />
        </label>
      )}

      {a.entries.map((e, ei) => (
        <ExerciseCard key={e.exId + ei} entry={e} ei={ei} ex={day?.exercises.find(x => x.id === e.exId)} unit={unit} />
      ))}

      <div className="row gap">
        <button className="btn ghost danger" onClick={discard}>Discard</button>
        <button className="btn primary grow big" onClick={finish}>Finish workout</button>
      </div>
    </div>
  )
}
