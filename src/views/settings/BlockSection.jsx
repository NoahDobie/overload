import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore, blockOf } from '../../store.js'
import { normalizeBlock, DEFAULT_BLOCK, startDeloadNow, restartThisWeek, restartNextMonday } from '../../lib/block.js'
import { programRuns } from '../../lib/runs.js'
import { todayISO, fmtDate } from '../../lib/util.js'
import { Segmented, Sheet, Stepper } from '../../components/ui.jsx'

const pct = f => `${Math.round(f * 100)}%`

const pc = f => Math.round(f * 100)
const inRange = (v, lo, hi) => Math.min(hi, Math.max(lo, Number(v) || lo))

/** Deload settings as small ± fields; saved together, like logging a run. */
function DeloadSheet({ b, runs, onSave, onClose }) {
  const [v, setV] = useState({
    deload: b.deload, sets: pc(b.liftDeload.setsFactor), weight: pc(b.liftDeload.weightFactor),
    rir: b.liftDeload.rirAdd, run: pc(b.runDeloadFactor)
  })
  const field = (k, label, step, min, max) => (
    <div className="fld">{label}<Stepper label={label} value={v[k]} step={step} min={min} max={max} width={44} onChange={x => setV({ ...v, [k]: x })} /></div>
  )
  const save = e => {
    e.preventDefault()
    onSave({
      deload: inRange(Math.round(v.deload), 1, 2),
      liftDeload: { setsFactor: inRange(v.sets, 25, 100) / 100, weightFactor: inRange(v.weight, 60, 100) / 100, rirAdd: inRange(v.rir, 0, 4) },
      runDeloadFactor: inRange(v.run, 40, 100) / 100
    })
    onClose()
  }
  const d = DEFAULT_BLOCK
  const reset = () => setV({ deload: d.deload, sets: pc(d.liftDeload.setsFactor), weight: pc(d.liftDeload.weightFactor), rir: d.liftDeload.rirAdd, run: pc(d.runDeloadFactor) })
  return (
    <Sheet open onClose={onClose} title="Deload">
      <form className="form-grid" onSubmit={save}>
        {field('deload', 'Weeks', 1, 1, 2)}
        {field('sets', 'Sets %', 10, 25, 100)}
        {field('weight', 'Weight %', 5, 60, 100)}
        {field('rir', 'Extra RIR', 1, 0, 4)}
        {runs.enabled && field('run', 'Run distance %', 10, 40, 100)}
        <div className="row gap span2">
          <button type="button" className="btn ghost" onClick={reset}>Defaults</button>
          <button className="btn primary grow">Save</button>
        </div>
      </form>
    </Sheet>
  )
}

export default function BlockSection() {
  const S = useStore()
  const { setBlock, setSettings, setRuns } = S
  const [editing, setEditing] = useState(false)
  if (!S.program) return null
  const b = normalizeBlock(S.program.block)
  const ld = b.liftDeload
  const runs = programRuns(S.program)
  const pos = blockOf(S)
  const today = todayISO()
  return (
    <section className="card">
      <div className="card-h"><h2>Training</h2></div>
      <label className="toggle-row">
        <span>Weekly runs<br /><span className="muted small">A run checklist on Today. <Link className="link" to="/program">Edit runs</Link></span></span>
        <input type="checkbox" checked={runs.enabled} onChange={e => setRuns({ enabled: e.target.checked })} />
      </label>
      <label className="toggle-row">
        <span>Planned deload weeks</span>
        <input type="checkbox" checked={b.enabled} onChange={e => setBlock({ enabled: e.target.checked })} />
      </label>
      {b.enabled && <>
        <p className="small muted">Build weeks before each deload</p>
        <Segmented value={String(b.build)} onChange={v => setBlock({ build: Number(v) })}
          options={[2, 3, 4, 5, 6].map(n => ({ value: String(n), label: `${n}:${b.deload}` }))} />
        <p className="small">
          Now: <b>{pos.isDeload ? 'Deload week' : `Week ${pos.week} of ${pos.length} (build)`}</b>
          {S.settings.blockStart && <span className="muted"> · block started {fmtDate(S.settings.blockStart)}</span>}
        </p>
        <p className="small muted">
          Deload: {b.deload > 1 ? `${b.deload} weeks, ` : ''}{pct(ld.setsFactor)} of sets at {ld.weightFactor < 1 ? `${pct(ld.weightFactor)} weight` : 'the same weight'}, RIR +{ld.rirAdd}{runs.enabled ? `; planned runs at ${pct(b.runDeloadFactor)} distance` : ''}.
        </p>
        <button className="link small" onClick={() => setEditing(true)}>Customize deload</button>
        {editing && <DeloadSheet b={b} runs={runs} onSave={setBlock} onClose={() => setEditing(false)} />}
        <div className="btn-col">
          {!pos.isDeload && <button className="btn" onClick={() => setSettings({ blockStart: startDeloadNow(b, today) })}>Start deload this week</button>}
          <button className="btn" onClick={() => setSettings({ blockStart: restartThisWeek(today) })}>{pos.isDeload ? 'Skip deload: build week 1 now' : 'Restart block: this week is week 1'}</button>
          <button className="btn ghost" onClick={() => setSettings({ blockStart: restartNextMonday(today) })}>{pos.isDeload ? 'Extend deload: start block next Monday' : 'Start block next Monday'}</button>
        </div>
      </>}
    </section>
  )
}
