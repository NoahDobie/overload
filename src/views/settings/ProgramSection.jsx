import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../../store.js'
import { importFile, normalizeProgram, downloadXlsx, historyRenames, withoutRenames } from '../../lib/import.js'
import { programRuns, keepRunIds } from '../../lib/runs.js'
import { download } from '../../lib/util.js'
import { Sheet } from '../../components/ui.jsx'
import sample from '../../../examples/program.json'

export default function ProgramSection() {
  const S = useStore()
  const setProgram = useStore(s => s.setProgram)
  const renameHistory = useStore(s => s.renameHistory)
  const clearProgram = useStore(s => s.clearProgram)
  const [moveHistory, setMoveHistory] = useState(true)
  const fileRef = useRef(null)
  const [preview, setPreview] = useState(null)   // { program, errors, warnings }
  const renames = preview?.program ? Object.entries(historyRenames(preview.program, S.sessions)) : []

  const onFile = async e => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    try { setPreview(await importFile(f)) } catch (err) { setPreview({ program: null, errors: [err.message], warnings: [] }) }
  }
  // A file that says nothing about runs keeps the current run plan.
  const apply = () => {
    const current = S.program ? programRuns(S.program) : undefined
    if (renames.length && moveHistory) renameHistory(Object.fromEntries(renames))
    setProgram(withoutRenames({ ...preview.program, runs: keepRunIds(preview.program.runs, current) ?? current }))
    setPreview(null)
  }
  const exportProgram = () => {
    const { updatedAt, ...p } = S.program
    download(`${p.name || 'program'}.json`, JSON.stringify(p, null, 2))
  }

  return (
    <section className="card">
      <div className="card-h"><h2>Program</h2></div>
      {S.program
        ? <p><b>{S.program.name}</b><br /><span className="muted small">{S.program.days.length} days · {S.program.days.reduce((n, d) => n + d.exercises.length, 0)} exercises</span></p>
        : <p className="muted">No program loaded.</p>}
      <div className="btn-col">
        <Link className="btn primary" to="/program">{S.program ? 'Edit program' : 'Build a program'}</Link>
        <button className="btn" onClick={() => fileRef.current.click()}>Import JSON / Excel / CSV</button>
        <input ref={fileRef} type="file" hidden accept=".json,.xlsx,.xls,.csv,application/json,text/csv" onChange={onFile} />
        {S.program && <div className="row gap">
          <button className="btn grow" onClick={() => downloadXlsx(S.program, `${S.program.name}.xlsx`)}>Export .xlsx</button>
          <button className="btn grow" onClick={exportProgram}>Export .json</button>
        </div>}
        {S.program && <button className="btn ghost danger small" onClick={() => {
          if (confirm(`Clear "${S.program.name}"? Your logged workouts, runs and bodyweight are kept, and the program can be rebuilt or imported again.${S.active ? ' The workout in progress will be discarded.' : ''}`)) clearProgram()
        }}>Clear program</button>}
        <div className="row gap">
          <button className="btn ghost grow small" onClick={() => downloadXlsx(normalizeProgram(sample).program, 'overload-template.xlsx')}>Excel template</button>
          <button className="btn ghost grow small" onClick={() => download('overload-template.json', JSON.stringify(sample, null, 2))}>JSON template</button>
        </div>
      </div>
      <details className="help">
        <summary>Spreadsheet format</summary>
        <p className="small">One row per exercise. Columns: <code>Week</code> (A/B), <code>Day</code> (1–5), <code>DayName</code>, <code>Order</code>, <code>Exercise</code>, <code>Sets</code>, <code>Reps</code> (e.g. 8-10), <code>RIR</code>, <code>Increment</code>, <code>StartWeight</code>, <code>HitsToProgress</code>, <code>Muscles</code> (optional, comma-separated), <code>Notes</code>. Leave Muscles blank and they're filled in from the exercise library.</p>
        <p className="small">Optional sheet named <code>Settings</code>: <code>Build</code> (build weeks, 0 = no blocks), <code>Deload</code>, <code>Runs</code> (on/off). Optional sheet named <code>Runs</code>, one row per weekly run: <code>Name</code>, <code>Km</code> (optional), <code>Notes</code>. Without them your current run plan is kept.</p>
        <p className="small">Progression: hit the top of the rep range on every set (<code>HitsToProgress</code> sessions in a row) and the weight goes up by <code>Increment</code>; otherwise beat last time by a rep. Leaving <code>Increment</code> at 0 means progress reps only.</p>
      </details>

      <Sheet open={!!preview} onClose={() => setPreview(null)} title={preview?.program ? `Import "${preview.program.name}"?` : 'Import failed'}>
        {preview?.errors?.length > 0 && <ul className="msgs err">{preview.errors.slice(0, 12).map((e, i) => <li key={i}>{e}</li>)}{preview.errors.length > 12 && <li>…and {preview.errors.length - 12} more</li>}</ul>}
        {preview?.warnings?.length > 0 && <ul className="msgs warn">{preview.warnings.slice(0, 8).map((e, i) => <li key={i}>{e}</li>)}</ul>}
        {preview?.info?.length > 0 && <ul className="msgs info">{preview.info.map((e, i) => <li key={i}>{e}</li>)}</ul>}
        {preview?.program && <>
          <ul className="pv-days">
            {preview.program.days.map(d => <li key={d.id}><b>{d.week} · {d.name}</b> <span className="muted small">{d.exercises.map(e => e.name).join(', ')}</span></li>)}
          </ul>
          <p className="muted small">{preview.program.runs
            ? (preview.program.runs.enabled ? `Runs: ${preview.program.runs.plan.map(r => r.name + (r.km != null ? ` ${r.km} km` : '')).join(', ')}.` : 'Runs: off.')
            : 'No runs in this file: your current run plan is kept.'}</p>
          {renames.length > 0 && (
            <label className="toggle-row renames">
              <span><b>Move logged history to the new names</b><br />
                <span className="muted small">{renames.map(([a, b]) => `${a} → ${b}`).join(' · ')}</span></span>
              <input type="checkbox" checked={moveHistory} onChange={e => setMoveHistory(e.target.checked)} />
            </label>
          )}
          <p className="muted small">Replaces the current program. Your logged history is kept: exercises with the same name continue their progression.</p>
          <button className="btn primary full" onClick={apply}>Import</button>
        </>}
      </Sheet>
    </section>
  )
}
