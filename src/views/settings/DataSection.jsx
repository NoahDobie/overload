import { useRef } from 'react'
import { useStore, unitOf, runUnitOf, hasWeights } from '../../store.js'
import { syncedPart, mergeDocs } from '../../lib/merge.js'
import { useSync } from '../../syncStatus.js'
import { todayISO, download } from '../../lib/util.js'
import { Segmented } from '../../components/ui.jsx'

export default function DataSection() {
  const S = useStore()
  const { applyDoc, resetAll, setSettings } = S
  const sync = useSync()
  const fileRef = useRef(null)
  const changeUnit = to => {
    if (to === unitOf(S)) return
    if (!hasWeights(S)) return setSettings({ unit: to })
    const eg = to === 'kg' ? '225 lb becomes 102 kg' : '100 kg becomes 220.5 lb'
    if (confirm(`Convert all logged weights, bodyweight, starting weights and increments to ${to}? For example ${eg}. Export a backup first if unsure.`)) S.convertUnits(to)
  }
  const backup = () => download(`overload-backup-${todayISO()}.json`, JSON.stringify(syncedPart(S), null, 2))
  const restore = async e => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    try {
      const doc = JSON.parse(await f.text())
      if (!Array.isArray(doc.sessions)) throw new Error('Not an Overload backup')
      if (confirm('Merge this backup into your data? Newer entries win; nothing is deleted.')) applyDoc(mergeDocs(syncedPart(S), { ...doc, resetAt: S.resetAt }))   // a backup restores even across an account reset
    } catch (x) { alert('Could not read backup: ' + x.message) }
  }
  return (
    <section className="card">
      <div className="card-h"><h2>Data</h2></div>
      <p className="small muted">Weight units</p>
      <Segmented value={unitOf(S)} onChange={changeUnit} options={[{ value: 'lb', label: 'lb' }, { value: 'kg', label: 'kg' }]} />
      <p className="small muted">Run units</p>
      <Segmented value={runUnitOf(S)} onChange={u => setSettings({ runUnit: u })} options={[{ value: 'km', label: 'km' }, { value: 'mi', label: 'miles' }]} />
      <div className="btn-col">
        <div className="row gap">
          <button className="btn grow small nowrap" onClick={backup}>Export backup</button>
          <button className="btn grow small nowrap" onClick={() => fileRef.current.click()}>Restore backup</button>
          <input ref={fileRef} type="file" hidden accept=".json,application/json" onChange={restore} />
        </div>
        <button className="btn ghost danger" onClick={() => {
          const msg = sync.user
            ? 'Erase this device? You are signed in, so your data downloads again on the next sync. To erase it everywhere, use "Erase everything in my account" under Sync.'
            : 'Erase everything on this device? Export a backup first if unsure.'
          if (confirm(msg)) resetAll()
        }}>Erase all data on this device</button>
      </div>
    </section>
  )
}
