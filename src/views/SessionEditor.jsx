import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStore, unitOf, sessionName } from '../store.js'
import { exKey } from '../lib/progression.js'
import { Icon } from '../components/ui.jsx'
import SetTable from '../components/SetTable.jsx'

// Fix a logged workout. Targets are worked out from history every time, so a corrected set
// changes the next prescription straight away.

export default function SessionEditor() {
  const { id } = useParams()
  const nav = useNavigate()
  const S = useStore()
  const { updateSession, deleteSession } = S
  const session = S.sessions.find(s => s.id === id && !s.deleted)
  const [draft, setDraft] = useState(() => (session ? structuredClone(session) : null))
  const [dirty, setDirty] = useState(false)
  if (!session || !draft) {
    return (
      <div className="page">
        <header className="top"><button className="iconbtn" aria-label="Back" onClick={() => nav('/history')}><Icon name="back" /></button></header>
        <p className="empty">That workout no longer exists.</p>
      </div>
    )
  }
  const unit = unitOf(S)
  const dayName = sessionName(S, draft)
  const stepOf = name => S.program?.days.flatMap(d => d.exercises).find(e => exKey(e.name) === exKey(name))?.increment || (unit === 'kg' ? 2.5 : 5)
  const edit = fn => { setDraft(d => { const n = structuredClone(d); fn(n); return n }); setDirty(true) }
  const close = () => { if (!dirty || confirm('Discard your changes?')) nav('/history') }
  const save = () => { updateSession(id, draft); nav('/history') }
  const remove = () => { if (confirm('Delete this workout? Its sets stop counting toward progression.')) { deleteSession(id); nav('/history') } }

  return (
    <div className="page workout">
      <header className="top sticky">
        <button className="iconbtn" aria-label="Back" onClick={close}><Icon name="back" /></button>
        <div className="grow">
          <h1 className="h-sm">Edit {dayName}</h1>
          <p className="eyebrow">Logged workout</p>
        </div>
        <button className="btn primary" onClick={save} disabled={!dirty}>Save</button>
      </header>

      <section className="card">
        <p className="small muted">Only ticked sets count toward progression. Changes update your next targets right away.</p>
        <div className="form-grid">
          <label className="span2">Date<input type="date" value={draft.date} required onChange={e => e.target.value && edit(d => { d.date = e.target.value })} /></label>
        </div>
        <label className="toggle-row">
          <span>Deload session<br /><span className="muted small">Deload sessions don't count toward progression</span></span>
          <input type="checkbox" checked={!!draft.deload} onChange={e => edit(d => { d.deload = e.target.checked })} />
        </label>
      </section>

      {draft.entries.map((e, ei) => (
        <section className="card ex" key={ei}>
          <div className="ex-h"><h2>{e.name}</h2></div>
          <SetTable sets={e.sets} unit={unit} step={stepOf(e.name)}
            onSet={(si, patch) => edit(d => { Object.assign(d.entries[ei].sets[si], patch) })}
            onAdd={() => edit(d => { const s = d.entries[ei].sets; const last = s[s.length - 1] || { w: 0, r: 0 }; s.push({ w: last.w, r: last.r, done: false }) })}
            onRemove={() => edit(d => { if (d.entries[ei].sets.length > 1) d.entries[ei].sets.pop() })} />
        </section>
      ))}

      <div className="row gap">
        <button className="btn ghost danger" onClick={remove}><Icon name="trash" size={16} /> Delete</button>
        <button className="btn primary grow big" onClick={save} disabled={!dirty}>Save changes</button>
      </div>
    </div>
  )
}
