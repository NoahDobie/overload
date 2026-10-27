import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore, unitOf, runUnitOf } from '../../store.js'
import { importFile, importJsonText, normalizeProgram, downloadXlsx, historyRenames, withoutRenames } from '../../lib/import.js'
import { programRuns, keepRunIds, fmtDist } from '../../lib/runs.js'
import { download } from '../../lib/util.js'
import { buildPrompt } from '../../lib/aiPrompt.js'
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
  const [pasting, setPasting] = useState(false)
  const [pasted, setPasted] = useState('')
  const [copied, setCopied] = useState(false)
  const renames = preview?.program ? Object.entries(historyRenames(preview.program, S.sessions)) : []

  const onFile = async e => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    try { setPreview(await importFile(f)) } catch (err) { setPreview({ program: null, errors: [err.message], warnings: [] }) }
  }
  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(buildPrompt(S.program, unitOf(S)))
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch { alert('Copying was blocked by the browser.') }
  }
  const importPasted = async () => {
    const res = await importJsonText(pasted, 'AI program')
    setPasting(false); setPasted('')
    setPreview(res)
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
        <summary>Build with AI</summary>
        <p className="small">Copy a prompt into ChatGPT, Claude or any AI chat. It asks about your goals and equipment{S.program ? ' (and sees your current program)' : ''}, then replies with a program. Paste that reply back here to import it.</p>
        <div className="row gap ai-row">
          <button className="btn grow small" onClick={copyPrompt}>{copied ? 'Copied' : 'Copy AI prompt'}</button>
          <button className="btn grow small" onClick={() => setPasting(true)}>Paste program</button>
        </div>
      </details>
      <details className="help">
        <summary>Spreadsheet format</summary>
        <p className="small">One row per exercise. Columns: <code>Week</code> (A/B), <code>Day</code> (1–5), <code>DayName</code>, <code>Order</code>, <code>Exercise</code>, <code>Sets</code>, <code>Reps</code> (e.g. 8-10), <code>RIR</code>, <code>Increment</code>, <code>StartWeight</code>, <code>HitsToProgress</code>, <code>Muscles</code> (optional, comma-separated), <code>Notes</code>. Leave Muscles blank and they're filled in from the exercise library.</p>
        <p className="small">Optional sheet named <code>Settings</code>: <code>Build</code> (build weeks, 0 = no blocks), <code>Deload</code> (weeks), <code>DeloadSets</code>, <code>DeloadWeight</code> and <code>DeloadRun</code> (percent), <code>DeloadRIR</code> (extra), <code>Runs</code> (on/off). Optional sheet named <code>Runs</code>, one row per weekly run: <code>Name</code>, <code>Km</code> (optional), <code>Notes</code>. Without them your current run plan is kept.</p>
        <p className="small">Progression: hit the top of the rep range on every set (<code>HitsToProgress</code> sessions in a row) and the weight goes up by <code>Increment</code>; otherwise beat last time by a rep. Leaving <code>Increment</code> at 0 means progress reps only.</p>
      </details>

      <Sheet open={pasting} onClose={() => setPasting(false)} title="Paste program">
        <p className="muted small">Paste the AI's reply. The JSON is picked out of it, and you'll see a preview before anything changes.</p>
        <textarea className="paste" rows={10} aria-label="Program JSON" value={pasted} onChange={e => setPasted(e.target.value)} placeholder='{ "name": …, "days": [ … ] }' />
        <button className="btn primary full" disabled={!pasted.trim()} onClick={importPasted}>Preview</button>
      </Sheet>

      <Sheet open={!!preview} onClose={() => setPreview(null)} title={preview?.program ? `Import "${preview.program.name}"?` : 'Import failed'}>
        {preview?.errors?.length > 0 && <ul className="msgs err">{preview.errors.slice(0, 12).map((e, i) => <li key={i}>{e}</li>)}{preview.errors.length > 12 && <li>…and {preview.errors.length - 12} more</li>}</ul>}
        {preview?.warnings?.length > 0 && <ul className="msgs warn">{preview.warnings.slice(0, 8).map((e, i) => <li key={i}>{e}</li>)}</ul>}
        {preview?.info?.length > 0 && <ul className="msgs info">{preview.info.map((e, i) => <li key={i}>{e}</li>)}</ul>}
        {preview?.program && <>
          <ul className="pv-days">
            {preview.program.days.map(d => <li key={d.id}><b>{d.week} · {d.name}</b> <span className="muted small">{d.exercises.map(e => e.name).join(', ')}</span></li>)}
          </ul>
          <p className="muted small">{preview.program.runs
            ? (preview.program.runs.enabled ? `Runs: ${preview.program.runs.plan.map(r => r.name + (r.km != null ? ` ${fmtDist(r.km, runUnitOf(S))}` : '')).join(', ')}.` : 'Runs: off.')
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
