import { Icon, Stepper } from './ui.jsx'

// The set rows of one exercise (weight, reps, tick) with − Set / + Set: used by the workout
// in progress and by the logged-session editor.

export default function SetTable({ sets, unit, step = 5, onSet, onAdd, onRemove }) {
  return <>
    <div className="sets">
      <div className="set-h"><span>Set</span><span>{unit}</span><span>Reps</span><span /></div>
      {sets.map((s, si) => (
        <div key={si} className={'set' + (s.done ? ' done' : '')}>
          <span className="set-n">{si + 1}</span>
          <Stepper label={`set ${si + 1} weight`} value={s.w} step={step} max={999} width={56} onChange={w => onSet(si, { w })} />
          <Stepper label={`set ${si + 1} reps`} value={s.r} step={1} max={99} width={26} compact onChange={r => onSet(si, { r })} />
          <button className="tick" aria-label={s.done ? `Undo set ${si + 1}` : `Done set ${si + 1}`} aria-pressed={s.done}
            onClick={() => onSet(si, { done: !s.done })}><Icon name="check" size={20} stroke={3} /></button>
        </div>
      ))}
    </div>
    <div className="row gap end">
      <button className="btn ghost small" onClick={onRemove} disabled={sets.length <= 1}><Icon name="minus" size={14} /> Set</button>
      <button className="btn ghost small" onClick={onAdd}><Icon name="plus" size={14} /> Set</button>
    </div>
  </>
}
