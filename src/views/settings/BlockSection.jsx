import { useStore, blockOf } from '../../store.js'
import { normalizeBlock, startDeloadNow, restartThisWeek, restartNextMonday } from '../../lib/block.js'
import { todayISO, fmtDate } from '../../lib/util.js'
import { Segmented } from '../../components/ui.jsx'

export default function BlockSection() {
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
        <p className="small muted">Deload: {Math.round(b.liftDeload.setsFactor * 100)}% of sets at the same weight, RIR +{b.liftDeload.rirAdd}; planned runs at {Math.round(b.runDeloadFactor * 100)}% distance, all easy.</p>
        <div className="btn-col">
          {!pos.isDeload && <button className="btn" onClick={() => setSettings({ blockStart: startDeloadNow(b, today) })}>Start deload this week</button>}
          <button className="btn" onClick={() => setSettings({ blockStart: restartThisWeek(today) })}>{pos.isDeload ? 'Skip deload: build week 1 now' : 'Restart block: this week is week 1'}</button>
          <button className="btn ghost" onClick={() => setSettings({ blockStart: restartNextMonday(today) })}>{pos.isDeload ? 'Extend deload: start block next Monday' : 'Start block next Monday'}</button>
        </div>
      </>}
    </section>
  )
}
