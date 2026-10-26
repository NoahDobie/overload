import { useEffect, useRef } from 'react'
import { isoOf, todayISO, MONTHS, live } from '../lib/util.js'
import { blockPosition } from '../lib/block.js'

// GitHub-style activity grid, simplified from openGym's components/Heatmap.jsx: each day is
// lifted, ran, or both, and deload weeks are marked under their column.
export default function Heatmap({ sessions, runs, block, blockStart, weeks = 26 }) {
  const wrapRef = useRef(null)
  useEffect(() => { if (wrapRef.current) wrapRef.current.scrollLeft = wrapRef.current.scrollWidth }, [])

  const lift = new Set(live(sessions).map(s => s.date))
  const ran = new Set(live(runs).map(r => r.date))

  const today = new Date(); today.setHours(12, 0, 0, 0)
  const monday = new Date(today); monday.setDate(today.getDate() - (today.getDay() + 6) % 7)
  const start = new Date(monday); start.setDate(monday.getDate() - (weeks - 1) * 7)

  const cols = [], months = []
  let lastMonth = -1
  for (let wk = 0; wk < weeks; wk++) {
    const colStart = new Date(start); colStart.setDate(start.getDate() + wk * 7)
    const mo = colStart.getMonth()
    months.push(<span key={wk}>{mo !== lastMonth ? MONTHS[mo] : ''}</span>)
    lastMonth = mo
    const deload = blockPosition(block, blockStart, isoOf(colStart)).isDeload
    const cells = []
    for (let d = 0; d < 7; d++) {
      const day = new Date(colStart); day.setDate(colStart.getDate() + d)
      const key = isoOf(day)
      const l = lift.has(key), r = ran.has(key)
      const cls = 'hm-c' + (l && r ? ' both' : l ? ' lift' : r ? ' run' : '') + (key === todayISO() ? ' today' : '') + (day > today ? ' future' : '')
      cells.push(<div key={d} className={cls} title={key + (l ? ' · lifted' : '') + (r ? ' · ran' : '')} />)
    }
    cols.push(<div key={wk} className={'hm-col' + (deload ? ' deload' : '')}>{cells}</div>)
  }

  return <>
    <div className="hm-wrap" ref={wrapRef}>
      <div className="hm-months">{months}</div>
      <div className="hm-body">
        <div className="hm-days">{['Mon', '', 'Wed', '', 'Fri', '', ''].map((l, i) => <span key={i}>{l}</span>)}</div>
        <div className="hm-grid">{cols}</div>
      </div>
    </div>
    <div className="hm-legend">
      <span><i className="hm-c lift" /> Lift</span>
      <span><i className="hm-c run" /> Run</span>
      <span><i className="hm-c both" /> Both</span>
      {block?.enabled !== false && <span><i className="hm-dl" /> Deload week</span>}
    </div>
  </>
}
