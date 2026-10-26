import { useState } from 'react'
import { useStore, unitOf } from '../store.js'
import { toPoints, sortedWeights, avg7, weeklyChange } from '../lib/bodyweight.js'
import { muscleLoad, MUSCLES, MUSCLE_NAME } from '../lib/muscles.js'
import { todayISO, addDays, dateOf, fmtDate, fmtNum } from '../lib/util.js'
import LineChart from '../components/LineChart.jsx'
import BodyMap from '../components/BodyMap.jsx'
import { Icon, Segmented } from '../components/ui.jsx'

export default function Body() {
  const S = useStore()
  const unit = unitOf(S)
  const [range, setRange] = useState('7')
  const [span, setSpan] = useState('90')
  const today = todayISO()

  const all = toPoints(S.bodyweight)
  const from = span === 'all' ? '' : addDays(today, -Number(span))
  const pts = all.filter(p => p.d >= from)
  const avgLine = pts.map(p => ({ t: p.t, y: avg7(S.bodyweight, p.d) }))
  const avg = avg7(S.bodyweight, today)
  const ch = weeklyChange(S.bodyweight, today)

  const load = muscleLoad(S.sessions, S.program, addDays(today, -(Number(range) - 1)))
  const ranked = MUSCLES.filter(m => load[m]).sort((a, b) => load[b] - load[a])

  return (
    <div className="page">
      <header className="top"><h1>Body</h1></header>

      <section className="card">
        <div className="card-h">
          <h2>Bodyweight</h2>
          {avg != null && <span className="muted small">7d avg <b>{fmtNum(avg)}</b> {unit}{ch != null ? ` (${ch >= 0 ? '+' : ''}${fmtNum(ch)}/wk)` : ''}</span>}
        </div>
        <Segmented value={span} onChange={setSpan} options={[{ value: '30', label: '30d' }, { value: '90', label: '90d' }, { value: '365', label: '1y' }, { value: 'all', label: 'All' }]} />
        <LineChart points={pts} extra={avgLine} unit={unit} />
        <p className="muted small">Solid: daily weigh-ins · dashed: 7-day average. Log from the Today tab.</p>
      </section>

      <section className="card">
        <div className="card-h">
          <h2>Muscles trained</h2>
          <Segmented value={range} onChange={setRange} options={[{ value: '7', label: '7d' }, { value: '14', label: '14d' }, { value: '28', label: '28d' }]} />
        </div>
        <BodyMap load={load} />
        <div className="hm-legend center">Less <i className="hm-c l1" /><i className="hm-c l2" /><i className="hm-c l3" /><i className="hm-c l4" /> More</div>
        {ranked.length ? (
          <ul className="mlist">
            {ranked.map(m => <li key={m}><span>{MUSCLE_NAME[m]}</span><span className="muted">{fmtNum(load[m])} sets</span></li>)}
          </ul>
        ) : <p className="empty small">No sets in this range yet.</p>}
      </section>

      <WeightList S={S} unit={unit} />
    </div>
  )
}

function WeightList({ S, unit }) {
  const [all, setAll] = useState(false)
  const del = useStore(s => s.deleteWeight)
  const rows = sortedWeights(S.bodyweight).reverse()
  if (!rows.length) return null
  return (
    <ul className="list card">
      {(all ? rows : rows.slice(0, 7)).map(e => (
        <li key={e.id} className="lrow"><div className="lrow-h">
          <span>{fmtDate(e.date, dateOf(e.date).getFullYear() !== new Date().getFullYear())}</span>
          <span><b>{fmtNum(e.weight)}</b> {unit}
            <button className="iconbtn" aria-label="Delete weigh-in" onClick={() => { if (confirm('Delete this weigh-in?')) del(e.id) }}><Icon name="trash" size={15} /></button></span>
        </div></li>
      ))}
      {rows.length > 7 && <li><button className="btn ghost small full" onClick={() => setAll(!all)}>{all ? 'Show less' : `Show all ${rows.length}`}</button></li>}
    </ul>
  )
}
