import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore, unitOf, blockOf } from '../store.js'
import { fmtNum } from '../lib/util.js'
import { loadLibrary } from '../lib/exercises.js'
import { Icon } from '../components/ui.jsx'
import SetTable from '../components/SetTable.jsx'
import AddExerciseSheet from '../components/AddExerciseSheet.jsx'

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
  const skipEntry = useStore(s => s.skipEntry)
  const removeEntry = useStore(s => s.removeEntry)
  if (entry.skipped) {
    return (
      <section className="card ex skipped">
        <div className="ex-h"><h2>{entry.name}</h2><span className="muted small">Skipped</span></div>
        <button className="link" onClick={() => skipEntry(ei, false)}>Undo</button>
      </section>
    )
  }
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
      <SetTable sets={entry.sets} unit={unit} step={ex?.increment || 5}
        onSet={(si, patch) => updateSet(ei, si, patch)} onAdd={() => addSet(ei)} onRemove={() => removeSet(ei)} />
      {entry.adhoc
        ? <button className="link small" onClick={() => removeEntry(ei)}>Remove from today</button>
        : !entry.sets.some(s => s.done) && <button className="link small" onClick={() => skipEntry(ei)}>Skip today</button>}
    </section>
  )
}

export default function Workout() {
  const S = useStore()
  const nav = useNavigate()
  const { finishWorkout, discardWorkout, setActiveDeload, addEntry } = S
  const a = S.active
  const [adding, setAdding] = useState(false)
  const [lib, setLib] = useState(null)
  useEffect(() => { if (adding && !lib) loadLibrary().then(setLib) }, [adding, lib])
  useEffect(() => { if (!a) nav('/', { replace: true }) }, [a, nav])
  if (!a) return null
  const day = S.program?.days.find(d => d.id === a.dayId)
  const unit = unitOf(S)
  const live = a.entries.filter(e => !e.skipped)
  const done = live.reduce((n, e) => n + e.sets.filter(s => s.done).length, 0)
  const total = live.reduce((n, e) => n + e.sets.length, 0)
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
        <ExerciseCard key={e.exId + ei} entry={e} ei={ei} ex={day?.exercises.find(x => x.id === e.exId) || e.adhoc} unit={unit} />
      ))}

      <button className="btn ghost" onClick={() => setAdding(true)}><Icon name="plus" size={16} /> Add exercise</button>
      <AddExerciseSheet open={adding} lib={lib} onClose={() => setAdding(false)} onPick={pick => { addEntry(pick); setAdding(false) }} />

      <div className="row gap">
        <button className="btn ghost danger" onClick={discard}>Discard</button>
        <button className="btn primary grow big" onClick={finish}>Finish workout</button>
      </div>
    </div>
  )
}
