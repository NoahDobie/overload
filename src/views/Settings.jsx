import { useRef, useState } from 'react'
import { useStore, blockOf } from '../store.js'
import { importFile, normalizeProgram, downloadXlsx } from '../lib/import.js'
import { normalizeBlock, startDeloadNow, restartThisWeek, restartNextMonday } from '../lib/block.js'
import { syncedPart, mergeDocs } from '../lib/merge.js'
import { syncConfigured, sendMagicLink, verifyCode, signOut } from '../lib/sync.js'
import { useSync } from '../syncStatus.js'
import { todayISO, fmtDate } from '../lib/util.js'
import { Segmented, Sheet } from '../components/ui.jsx'
import sample from '../../examples/program.json'

const download = (name, text, type = 'application/json') => {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

function ProgramSection() {
  const S = useStore()
  const setProgram = useStore(s => s.setProgram)
  const fileRef = useRef(null)
  const [preview, setPreview] = useState(null)   // { program, errors, warnings }

  const onFile = async e => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    try { setPreview(await importFile(f)) } catch (err) { setPreview({ program: null, errors: [err.message], warnings: [] }) }
  }
  const apply = () => { setProgram(preview.program); setPreview(null) }
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
        <button className="btn primary" onClick={() => fileRef.current.click()}>Import JSON / Excel / CSV</button>
        <input ref={fileRef} type="file" hidden accept=".json,.xlsx,.xls,.csv,application/json,text/csv" onChange={onFile} />
        {!S.program && <button className="btn" onClick={() => setPreview(normalizeProgram(sample))}>Use sample PPLUL A/B</button>}
        {S.program && <div className="row gap">
          <button className="btn grow" onClick={() => downloadXlsx(S.program, `${S.program.name}.xlsx`)}>Export .xlsx</button>
          <button className="btn grow" onClick={exportProgram}>Export .json</button>
        </div>}
        <div className="row gap">
          <button className="btn ghost grow small" onClick={() => downloadXlsx(normalizeProgram(sample).program, 'overload-template.xlsx')}>Excel template</button>
          <button className="btn ghost grow small" onClick={() => download('overload-template.json', JSON.stringify(sample, null, 2))}>JSON template</button>
        </div>
      </div>
      <details className="help">
        <summary>Spreadsheet format</summary>
        <p className="small">One row per exercise. Columns: <code>Week</code> (A/B), <code>Day</code> (1–5), <code>DayName</code>, <code>Order</code>, <code>Exercise</code>, <code>Sets</code>, <code>Reps</code> (e.g. 8-10), <code>RIR</code>, <code>Increment</code>, <code>StartWeight</code>, <code>HitsToProgress</code>, <code>Muscles</code> (comma-separated), <code>Notes</code>.</p>
        <p className="small">Optional sheet named <code>Settings</code>: <code>Build</code> (build weeks, 0 = no blocks), <code>Deload</code>, <code>RunEasyMiles</code>, <code>RunQualityMiles</code>, <code>RunLongMiles</code> and matching <code>…Notes</code>.</p>
        <p className="small">Progression: hit the top of the rep range on every set (<code>HitsToProgress</code> sessions in a row) and the weight goes up by <code>Increment</code>; otherwise beat last time by a rep. Leaving <code>Increment</code> at 0 means progress reps only.</p>
      </details>

      <Sheet open={!!preview} onClose={() => setPreview(null)} title={preview?.program ? `Import "${preview.program.name}"?` : 'Import failed'}>
        {preview?.errors?.length > 0 && <ul className="msgs err">{preview.errors.slice(0, 12).map((e, i) => <li key={i}>{e}</li>)}{preview.errors.length > 12 && <li>…and {preview.errors.length - 12} more</li>}</ul>}
        {preview?.warnings?.length > 0 && <ul className="msgs warn">{preview.warnings.slice(0, 8).map((e, i) => <li key={i}>{e}</li>)}</ul>}
        {preview?.program && <>
          <ul className="pv-days">
            {preview.program.days.map(d => <li key={d.id}><b>{d.week} · {d.name}</b> <span className="muted small">{d.exercises.map(e => e.name).join(', ')}</span></li>)}
          </ul>
          <p className="muted small">Replaces the current program. Your logged history is kept: exercises with the same name continue their progression.</p>
          <button className="btn primary full" onClick={apply}>Import</button>
        </>}
      </Sheet>
    </section>
  )
}

function BlockSection() {
  const S = useStore()
  const { setBlock, setSettings } = S
  if (!S.program) return null
  const b = normalizeBlock(S.program.block)
  const pos = blockOf(S)
  const today = todayISO()
  return (
    <section className="card">
      <div className="card-h"><h2>Training blocks</h2></div>
      <label className="toggle-row">
        <span>Planned deload weeks</span>
        <input type="checkbox" checked={b.enabled} onChange={e => setBlock({ enabled: e.target.checked })} />
      </label>
      {b.enabled && <>
        <p className="small muted">Build weeks before each deload week</p>
        <Segmented value={String(b.build)} onChange={v => setBlock({ build: Number(v) })}
          options={[2, 3, 4, 5, 6].map(n => ({ value: String(n), label: `${n}:1` }))} />
        <p className="small">
          Now: <b>{pos.isDeload ? 'Deload week' : `Week ${pos.week} of ${pos.length} (build)`}</b>
          {S.settings.blockStart && <span className="muted"> · block started {fmtDate(S.settings.blockStart)}</span>}
        </p>
        <p className="small muted">Deload: {Math.round(b.liftDeload.setsFactor * 100)}% of sets at the same weight, RIR +{b.liftDeload.rirAdd}; runs at {Math.round(b.runDeloadFactor * 100)}% distance, quality swapped for strides.</p>
        <div className="btn-col">
          {!pos.isDeload && <button className="btn" onClick={() => setSettings({ blockStart: startDeloadNow(b, today) })}>Start deload this week</button>}
          <button className="btn" onClick={() => setSettings({ blockStart: restartThisWeek(today) })}>{pos.isDeload ? 'Skip deload: build week 1 now' : 'Restart block: this week is week 1'}</button>
          <button className="btn ghost" onClick={() => setSettings({ blockStart: restartNextMonday(today) })}>{pos.isDeload ? 'Extend deload: start block next Monday' : 'Start block next Monday'}</button>
        </div>
      </>}
    </section>
  )
}

function AccountSection() {
  const sync = useSync()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  if (!syncConfigured) {
    return (
      <section className="card">
        <div className="card-h"><h2>Sync</h2></div>
        <p className="small muted">Local-only mode: data lives on this device. Use backups below, or configure Supabase (see README) to sync across devices.</p>
      </section>
    )
  }
  const send = async e => {
    e.preventDefault(); setErr('')
    try { await sendMagicLink(email); setSent(true); setCode('') } catch (x) { setErr(x.message) }
  }
  const verify = async e => {
    e.preventDefault(); setErr(''); setBusy(true)
    try { await verifyCode(email, code) } catch (x) { setErr(x.message) } finally { setBusy(false) }
  }
  const out = async () => {
    setBusy(true)
    try {
      if (await signOut()) return
      if (confirm("Your latest changes haven't synced. Signing out clears this device, so they'd be lost. Sign out anyway?")) await signOut({ force: true })
    } finally { setBusy(false) }
  }
  const statusText = {
    syncing: 'Syncing…',
    offline: 'Offline. Changes are saved here and sync when you reconnect.',
    error: `Sync error: ${sync.error}. Retrying.`
  }[sync.state] ?? (sync.at ? `Synced ${new Date(sync.at).toLocaleTimeString()}` : '')
  return (
    <section className="card">
      <div className="card-h"><h2>Sync</h2>{sync.user && <span className={'dot ' + sync.state} title={sync.state} />}</div>
      {sync.user ? <>
        <p className="small">Signed in as <b>{sync.user.email}</b></p>
        <p className="small muted">{statusText}</p>
        <button className="btn ghost" onClick={out} disabled={busy}>Sign out</button>
        <p className="small muted">Signing out removes your data from this device. It stays in your account.</p>
      </> : sent ? <>
        <p className="small">We emailed <b>{email}</b> a code. Enter it here, or open the link in the email on this device.</p>
        <form className="row gap" onSubmit={verify}>
          <input className="grow" inputMode="numeric" autoComplete="one-time-code" required minLength={6} maxLength={12}
            placeholder="Code" value={code} onChange={e => setCode(e.target.value)} />
          <button className="btn primary" disabled={busy}>Verify</button>
        </form>
        <button className="link small" onClick={() => { setSent(false); setErr('') }}>Use a different email</button>
      </> : (
        <form className="row gap" onSubmit={send}>
          <input className="grow" type="email" required placeholder="you@email.com" value={email} onChange={e => setEmail(e.target.value)} />
          <button className="btn primary">Send code</button>
        </form>
      )}
      {err && <p className="small err-t">{err}</p>}
    </section>
  )
}

function DataSection() {
  const S = useStore()
  const { applyDoc, resetAll, setSettings } = S
  const fileRef = useRef(null)
  const backup = () => download(`overload-backup-${todayISO()}.json`, JSON.stringify(syncedPart(S), null, 2))
  const restore = async e => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    try {
      const doc = JSON.parse(await f.text())
      if (!Array.isArray(doc.sessions)) throw new Error('Not an Overload backup')
      if (confirm('Merge this backup into your data? Newer entries win; nothing is deleted.')) applyDoc(mergeDocs(syncedPart(S), doc))
    } catch (x) { alert('Could not read backup: ' + x.message) }
  }
  return (
    <section className="card">
      <div className="card-h"><h2>Data</h2></div>
      <p className="small muted">Units</p>
      <Segmented value={S.settings.unit || 'lb'} onChange={unit => setSettings({ unit })} options={[{ value: 'lb', label: 'lb' }, { value: 'kg', label: 'kg' }]} />
      <div className="btn-col">
        <div className="row gap">
          <button className="btn grow" onClick={backup}>Export backup</button>
          <button className="btn grow" onClick={() => fileRef.current.click()}>Restore backup</button>
          <input ref={fileRef} type="file" hidden accept=".json,application/json" onChange={restore} />
        </div>
        <button className="btn ghost danger" onClick={() => { if (confirm('Erase everything on this device? Export a backup first if unsure.')) resetAll() }}>Erase all data on this device</button>
      </div>
    </section>
  )
}

export default function Settings() {
  return (
    <div className="page">
      <header className="top"><h1>Settings</h1></header>
      <ProgramSection />
      <BlockSection />
      <AccountSection />
      <DataSection />
      <p className="muted small center">Overload · built on <a className="link" href="https://github.com/DuarteSantos8/openGym">openGym</a> (AGPL-3.0)</p>
    </div>
  )
}
