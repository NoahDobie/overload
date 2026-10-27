import { useEffect, useMemo, useState } from 'react'
import { search, guessMuscles, MAX_GUESSED_MUSCLES } from '../lib/exercises.js'
import { MUSCLES, MUSCLE_NAME } from '../lib/muscles.js'
import { Icon, Sheet } from './ui.jsx'

// Search the exercise library (or name your own): used by the program editor and by the
// workout in progress.

export default function AddExerciseSheet({ open, lib, onClose, onPick }) {
  const [q, setQ] = useState('')
  const [muscle, setMuscle] = useState('')
  const [equipment, setEquipment] = useState('')
  useEffect(() => { if (open) { setQ(''); setMuscle(''); setEquipment('') } }, [open])
  const equipmentList = useMemo(() => (lib ? [...new Set(lib.map(e => e.equipment))].sort() : []), [lib])
  const results = useMemo(() => (lib ? search(lib, q, { muscle, equipment, limit: 50 }) : []), [lib, q, muscle, equipment])
  const custom = () => {
    const g = lib ? guessMuscles(lib, q) : null
    onPick({ name: q.trim(), muscles: g?.muscles || [], equipment: '' })
  }
  return (
    <Sheet open={open} onClose={onClose} title="Add exercise">
      <input autoFocus type="search" placeholder="Search, e.g. incline db press" value={q} onChange={e => setQ(e.target.value)} />
      <div className="row gap">
        <select className="grow" aria-label="Muscle" value={muscle} onChange={e => setMuscle(e.target.value)}>
          <option value="">Any muscle</option>
          {MUSCLES.map(m => <option key={m} value={m}>{MUSCLE_NAME[m]}</option>)}
        </select>
        <select className="grow" aria-label="Equipment" value={equipment} onChange={e => setEquipment(e.target.value)}>
          <option value="">Any equipment</option>
          {equipmentList.map(x => <option key={x} value={x}>{x[0].toUpperCase() + x.slice(1)}</option>)}
        </select>
      </div>
      {q.trim() && (
        <button className="pick custom" onClick={custom}>
          <span className="pick-name"><Icon name="plus" size={16} /> Add “{q.trim()}”</span>
          <span className="pick-sub">As your own exercise. Its muscles are matched from the name.</span>
        </button>
      )}
      {!lib ? <p className="empty small">Loading exercises…</p> : (
        <ul className="picks">
          {results.map(e => (
            <li key={e.name}>
              <button className="pick" onClick={() => onPick(e)}>
                <span className="pick-name">{e.name}</span>
                <span className="pick-sub">{e.muscles.slice(0, MAX_GUESSED_MUSCLES).map(m => MUSCLE_NAME[m]).join(', ')} · {e.equipment}</span>
              </button>
            </li>
          ))}
          {!results.length && <li className="empty small">Nothing found. Add it as your own exercise above.</li>}
        </ul>
      )}
    </Sheet>
  )
}
