import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore, runUnitOf } from '../store.js'
import { normalizeProgram } from '../lib/import.js'
import { loadLibrary, guessMuscles, MAX_GUESSED_MUSCLES, BODYWEIGHT_EQUIPMENT } from '../lib/exercises.js'
import { MUSCLE_NAME } from '../lib/muscles.js'
import { historyFor, exKey } from '../lib/progression.js'
import { uid } from '../lib/util.js'
import { programRuns, MAX_RUNS, toDist, fromDist, fmtDist } from '../lib/runs.js'
import { Icon, Sheet, Stepper } from '../components/ui.jsx'
import { SortableList, DragHandle, moveItem } from '../components/Sortable.jsx'
import AddExerciseSheet from '../components/AddExerciseSheet.jsx'
import pplul from '../../examples/program.json'
import upperLower from '../../examples/upper-lower.json'
import fullBody from '../../examples/full-body.json'

export const TEMPLATES = [
  { id: 'pplul', name: 'Push / Pull / Legs + Upper / Lower', desc: '5 days a week, alternating A and B weeks', data: pplul },
  { id: 'ul', name: 'Upper / Lower', desc: '4 days a week', data: upperLower },
  { id: 'fb', name: 'Full body', desc: '3 days a week', data: fullBody },
  { id: 'blank', name: 'Blank', desc: 'Start empty and add your own days', data: { name: 'My program', days: [], runs: { enabled: false, plan: [] } } }
]

const DEFAULTS = { sets: 3, repMin: 8, repMax: 12, rir: 2, increment: 5, startWeight: 0, hitsToProgress: 1, notes: '' }

// Editor copy of a program: every exercise gets a React key and remembers the name it had
// when the editor opened, so renames can carry their history along.
function toDraft(p) {
  const src = normalizeProgram(p).program || { name: p.name || 'My program', unit: 'lb', days: [], block: p.block }
  return {
    ...src,
    runs: structuredClone(programRuns(p)),
    days: (p.days?.length ? src.days : []).map(d => ({
      ...d, key: uid(),
      exercises: d.exercises.map(e => ({ ...e, key: uid(), orig: e.name }))
    }))
  }
}

function fromDraft(draft) {
  const { days, ...rest } = draft
  return {
    ...rest,
    days: days.map(({ key, exercises, ...d }) => ({
      ...d, exercises: exercises.map(({ key: _k, orig: _o, id: _i, mName: _m, ...e }) => e)
    }))
  }
}

const summary = (e, unit) => [
  `${e.sets} × ${e.repMin === e.repMax ? e.repMin : `${e.repMin}–${e.repMax}`}`,
  `RIR ${e.rir}`,
  e.increment ? `+${e.increment} ${unit}` : 'reps only',
  e.muscles?.length ? e.muscles.map(m => MUSCLE_NAME[m]).join(', ') : 'no muscles'
].join(' · ')

export default function ProgramEditor() {
  const nav = useNavigate()
  const S = useStore()
  const { setProgram, renameHistory } = S
  const [draft, setDraft] = useState(() => (S.program ? toDraft(S.program) : null))
  const [dirty, setDirty] = useState(false)
  const [lib, setLib] = useState(null)
  const [editing, setEditing] = useState(null)   // { day, ex } keys
  const [adding, setAdding] = useState(null)     // day key
  const [errors, setErrors] = useState([])
  const [draggingDay, setDraggingDay] = useState(false)
  useEffect(() => { loadLibrary().then(setLib) }, [])

  const unit = draft?.unit || 'lb'
  const twoWeeks = draft?.days.some(d => d.week === 'B')

  const update = fn => { setDraft(d => fn(structuredClone(d))); setDirty(true) }
  const updateDay = (key, fn) => update(d => { const i = d.days.findIndex(x => x.key === key); fn(d.days[i], d, i); return d })

  const useTemplate = t => {
    if (draft && dirty && !confirm(`Replace what you have here with the ${t.name} template?`)) return
    setDraft({ ...toDraft(t.data), unit: S.settings?.unit || 'lb' }); setDirty(true); setErrors([])
  }

  const cancel = () => { if (!dirty || confirm('Discard your changes?')) nav(-1) }

  const save = () => {
    // Muscles follow the name they were set for: blank or renamed exercises are matched again.
    const out = fromDraft(draft)
    if (lib) draft.days.forEach((d, di) => d.exercises.forEach((e, ei) => {
      if (e.muscles?.length && exKey(e.mName ?? e.orig ?? e.name) === exKey(e.name)) return
      const g = guessMuscles(lib, e.name)
      if (g) out.days[di].exercises[ei].muscles = [...g.muscles]
    }))
    const res = normalizeProgram(out)
    if (!res.program) { setErrors(res.errors); window.scrollTo(0, 0); return }
    // Renamed exercises whose old name is gone from the program and has history: offer to move it.
    const names = new Set(draft.days.flatMap(d => d.exercises.map(e => exKey(e.name))))
    const renames = {}
    for (const d of draft.days) for (const e of d.exercises) {
      if (!e.orig || exKey(e.orig) === exKey(e.name) || names.has(exKey(e.orig)) || renames[e.orig]) continue
      if (historyFor(S.sessions, e.orig).length) renames[e.orig] = e.name
    }
    const list = Object.entries(renames)
    if (list.length && confirm(`Keep your logged history under the new name${list.length > 1 ? 's' : ''}?\n\n${list.map(([a, b]) => `${a} → ${b}`).join('\n')}\n\nCancel keeps the history under the old name (it stops showing for this exercise).`)) {
      renameHistory(renames)
    }
    setProgram(res.program)
    nav('/settings')
  }

  const addDay = () => update(d => {
    const week = d.days.length ? d.days[d.days.length - 1].week : 'A'
    d.days.push({ key: uid(), id: uid(), week, name: `Day ${d.days.length + 1}`, exercises: [] })
    return d
  })

  const setTwoWeeks = on => update(d => {
    if (!on) for (const day of d.days) day.week = 'A'
    else if (d.days.length > 1) d.days.slice(Math.ceil(d.days.length / 2)).forEach(day => { day.week = 'B' })
    return d
  })

  const addExercise = (dayKey, pick) => {
    const key = uid()
    updateDay(dayKey, day => {
      day.exercises.push({
        ...DEFAULTS, key, name: pick.name, mName: pick.name, muscles: [...pick.muscles].slice(0, MAX_GUESSED_MUSCLES),
        increment: pick.equipment && BODYWEIGHT_EQUIPMENT.has(pick.equipment) ? 0 : DEFAULTS.increment
      })
    })
    setAdding(null)
    setEditing({ day: dayKey, ex: key })
  }

  if (!draft) {
    return (
      <div className="page">
        <header className="top">
          <button className="iconbtn" aria-label="Back" onClick={() => nav(-1)}><Icon name="back" /></button>
          <h1 className="h-sm grow">Build a program</h1>
        </header>
        <p className="muted">Pick a starting point. You can change every day and exercise afterwards.</p>
        <TemplateList onPick={useTemplate} />
      </div>
    )
  }

  const editDay = editing && draft.days.find(d => d.key === editing.day)
  const editEx = editDay?.exercises.find(e => e.key === editing.ex)

  return (
    <div className="page">
      <header className="top sticky">
        <button className="iconbtn" aria-label="Cancel" onClick={cancel}><Icon name="back" /></button>
        <h1 className="h-sm grow">Edit program</h1>
        <button className="btn primary" onClick={save}>Save</button>
      </header>

      {errors.length > 0 && <ul className="msgs err">{errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}</ul>}

      <section className="card">
        <label className="field">
          <span>Program name</span>
          <input value={draft.name} onChange={e => update(d => { d.name = e.target.value; return d })} />
        </label>
        <label className="toggle-row">
          <span>Alternate A and B weeks<br /><span className="muted small">For splits that change exercises every other week</span></span>
          <input type="checkbox" checked={twoWeeks} onChange={e => setTwoWeeks(e.target.checked)} />
        </label>
        <details className="help">
          <summary>Start over from a template</summary>
          <TemplateList onPick={useTemplate} compact />
        </details>
      </section>

      <p className="small muted">Days run in this order and repeat. Drag <Icon name="grip" size={13} stroke={3} /> to reorder; tap an exercise to change it.</p>

      <SortableList as="div" className="days" itemClassName="card day" items={draft.days} getKey={d => d.key}
        onMove={(from, to) => { setDraft(d => ({ ...d, days: moveItem(d.days, from, to) })); setDirty(true) }} onDragChange={setDraggingDay}>
        {(day, di, handle) => <>
          <div className="row gap">
            <DragHandle {...handle(day.key, day.name)} />
            <input className="grow day-name" aria-label="Day name" value={day.name} onChange={e => updateDay(day.key, x => { x.name = e.target.value })} />
            {draggingDay && <span className="muted small">{day.exercises.length} exercises</span>}
          </div>
          {!draggingDay && <>
            {twoWeeks && (
              <div className="seg sm" role="radiogroup" aria-label="Week">
                {['A', 'B'].map(w => <button key={w} type="button" role="radio" aria-checked={day.week === w} className={day.week === w ? 'on' : ''} onClick={() => updateDay(day.key, x => { x.week = w })}>Week {w}</button>)}
              </div>
            )}
            {day.exercises.length ? (
              <SortableList className="ed-list" items={day.exercises} getKey={e => e.key}
                onMove={(from, to) => updateDay(day.key, x => { x.exercises = moveItem(x.exercises, from, to) })}>
                {(e, ei, exHandle) => (
                  <div className="row ed-row">
                    <DragHandle {...exHandle(e.key, e.name)} />
                    <button className="ed-ex" onClick={() => setEditing({ day: day.key, ex: e.key })}>
                      <span className="ed-name">{e.name}</span>
                      <span className="ed-sum">{summary(e, unit)}</span>
                    </button>
                  </div>
                )}
              </SortableList>
            ) : <p className="empty small">No exercises yet</p>}
            <div className="row gap">
              <button className="btn primary small grow" onClick={() => setAdding(day.key)}><Icon name="plus" size={16} /> Exercise</button>
              <button className="iconbtn" aria-label={`Copy ${day.name}`} onClick={() => update(d => {
                const copy = structuredClone(day)
                copy.key = uid(); copy.id = uid(); copy.name = `${day.name} copy`
                copy.exercises.forEach(e => { e.key = uid() })
                d.days.splice(di + 1, 0, copy)
                return d
              })}><Icon name="copy" size={18} /></button>
              <button className="iconbtn danger" aria-label={`Delete ${day.name}`} onClick={() => {
                if (!day.exercises.length || confirm(`Delete ${day.name}?`)) update(d => { d.days.splice(di, 1); return d })
              }}><Icon name="trash" size={18} /></button>
            </div>
          </>}
        </>}
      </SortableList>

      <button className="btn ghost" onClick={addDay}><Icon name="plus" size={16} /> Add day</button>

      <RunsEditor runs={draft.runs} unit={runUnitOf(S)} onChange={fn => update(d => { fn(d.runs); return d })} />
      <button className="btn primary big" onClick={save}>Save program</button>

      <AddExerciseSheet open={!!adding} lib={lib} onClose={() => setAdding(null)} onPick={pick => addExercise(adding, pick)} />
      {editEx && (
        <ExerciseSheet ex={editEx} unit={unit}
          onChange={fn => updateDay(editing.day, x => fn(x.exercises.find(e => e.key === editing.ex)))}
          onRemove={() => { updateDay(editing.day, x => { x.exercises = x.exercises.filter(e => e.key !== editing.ex) }); setEditing(null) }}
          onClose={() => setEditing(null)} />
      )}
    </div>
  )
}

/** Distance typed in the run unit, kept in km. Holds the text while typing ("3." stays "3."). */
function DistInput({ km, unit, onChange }) {
  const [text, setText] = useState(km == null || km === '' ? '' : String(toDist(Number(km), unit)))
  return (
    <input inputMode="decimal" value={text} placeholder="Leave blank for no plan"
      onChange={e => { const t = e.target.value.replace(',', '.').replace(/[^0-9.]/g, ''); setText(t); onChange(fromDist(t, unit)) }} />
  )
}

function RunsEditor({ runs, unit, onChange }) {
  const [editing, setEditing] = useState(null)   // run id
  const toggle = on => onChange(r => {
    r.enabled = on
    if (on && !r.plan.length) r.plan.push({ id: uid(), name: 'Easy', km: null, notes: '' })
  })
  const add = () => {
    const id = uid()
    onChange(x => { x.plan.push({ id, name: `Run ${x.plan.length + 1}`, km: null, notes: '' }) })
    setEditing(id)
  }
  const run = runs.plan.find(r => r.id === editing)
  const full = runs.plan.length >= MAX_RUNS
  return (
    <section className="card">
      <label className="toggle-row">
        <span><h2><Icon name="run" size={18} /> Weekly runs</h2><span className="muted small">A checklist on Today, reset every Monday</span></span>
        <input type="checkbox" checked={runs.enabled} onChange={e => toggle(e.target.checked)} />
      </label>
      {runs.enabled && <>
        {runs.plan.length ? (
          <SortableList className="ed-list" items={runs.plan} getKey={r => r.id}
            onMove={(from, to) => onChange(x => { x.plan = moveItem(x.plan, from, to) })}>
            {(r, i, handle) => (
              <div className="row ed-row">
                <DragHandle {...handle(r.id, r.name || `run ${i + 1}`)} />
                <button className="ed-ex" onClick={() => setEditing(r.id)}>
                  <span className="ed-name">{r.name}</span>
                  <span className="ed-sum">{[r.km !== '' && r.km != null ? `${fmtDist(Number(r.km), unit)} planned` : 'No planned distance', r.notes].filter(Boolean).join(' · ')}</span>
                </button>
              </div>
            )}
          </SortableList>
        ) : <p className="empty small">No runs yet</p>}
        <div className="row gap">
          <button className="btn primary small grow" disabled={full} onClick={add}><Icon name="plus" size={16} /> {full ? `${MAX_RUNS} runs max` : 'Run'}</button>
        </div>
        <p className="small muted">Planned distance is optional. When you mark a run done, you enter what you actually ran.</p>
      </>}
      {run && (
        <Sheet open onClose={() => setEditing(null)} title="Run">
          <label className="field">
            <span>Name</span>
            <input value={run.name} placeholder="e.g. Easy, Tempo, Long" onChange={e => onChange(x => { x.plan.find(r => r.id === run.id).name = e.target.value })} />
          </label>
          <label className="field">
            <span>Planned distance ({unit}, optional)</span>
            <DistInput key={run.id} km={run.km} unit={unit} onChange={km => onChange(x => { x.plan.find(r => r.id === run.id).km = km })} />
          </label>
          <label className="field">
            <span>Notes</span>
            <input value={run.notes} placeholder="Optional, e.g. zone 2, 6×800 m" onChange={e => onChange(x => { x.plan.find(r => r.id === run.id).notes = e.target.value })} />
          </label>
          <div className="row gap">
            <button className="btn ghost small danger grow" onClick={() => { onChange(x => { x.plan = x.plan.filter(r => r.id !== run.id) }); setEditing(null) }}><Icon name="trash" size={16} /> Remove</button>
          </div>
          <button className="btn primary full" onClick={() => setEditing(null)}>Done</button>
        </Sheet>
      )}
    </section>
  )
}

function TemplateList({ onPick, compact }) {
  return (
    <div className={'btn-col' + (compact ? ' tpl-compact' : '')}>
      {TEMPLATES.map(t => (
        <button key={t.id} className="tpl" onClick={() => onPick(t)}>
          <span className="tpl-name">{t.name}</span>
          <span className="tpl-desc">{t.desc}{t.data.days.length ? ` · ${t.data.days.length} workouts` : ''}</span>
          <Icon name="chev" size={18} />
        </button>
      ))}
    </div>
  )
}

function ExerciseSheet({ ex, unit, onChange, onRemove, onClose }) {
  const set = (k, v) => onChange(e => { e[k] = v })
  const num = v => Number(v) || 0
  const renamed = ex.orig && exKey(ex.orig) !== exKey(ex.name)
  return (
    <Sheet open onClose={onClose} title="Exercise">
      <label className="field">
        <span>Name</span>
        <input value={ex.name} onChange={e => set('name', e.target.value)} />
      </label>
      {renamed && <p className="small muted">Renamed from “{ex.orig}”. When you save, you can keep its history under the new name.</p>}
      <div className="form-grid">
        <label>Sets<Stepper label="sets" value={ex.sets} min={1} onChange={v => set('sets', Math.max(1, Math.round(num(v))))} /></label>
        <label>RIR (reps in reserve)<Stepper label="RIR" value={ex.rir} onChange={v => set('rir', num(v))} /></label>
        <label>Reps, low<Stepper label="lowest reps" value={ex.repMin} min={1} onChange={v => onChange(e => { e.repMin = Math.max(1, num(v)); if (e.repMax < e.repMin) e.repMax = e.repMin })} /></label>
        <label>Reps, high<Stepper label="highest reps" value={ex.repMax} min={1} onChange={v => onChange(e => { e.repMax = Math.max(1, num(v)); if (e.repMin > e.repMax) e.repMin = e.repMax })} /></label>
        <label>Add per step ({unit})<Stepper label="weight increase" value={ex.increment} step={2.5} onChange={v => set('increment', v)} /></label>
        <label>Starting weight ({unit})<Stepper label="starting weight" value={ex.startWeight} step={5} onChange={v => set('startWeight', v)} /></label>
      </div>
      <p className="small muted">Hit the top of the rep range on every set and the weight goes up by the step. Set the step to 0 to progress reps only (bodyweight moves).</p>
      <label className="field">
        <span>Notes</span>
        <input value={ex.notes || ''} placeholder="Optional, e.g. pause at the bottom" onChange={e => set('notes', e.target.value)} />
      </label>
      <div className="row gap">
        <button className="btn ghost small danger grow" onClick={onRemove}><Icon name="trash" size={16} /> Remove</button>
      </div>
      <button className="btn primary full" onClick={onClose}>Done</button>
    </Sheet>
  )
}
