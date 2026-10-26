import { useLayoutEffect, useRef, useState } from 'react'
import { fmtNum, fmtDate, MONTHS, isoOf } from '../lib/util.js'

// Trimmed port of openGym's components/LineChart.jsx: one line, gradient fill, axes and a
// touch/hover readout.
const W = 340

// points: [{ t: ms, y: num, d?: iso, note?: str }] sorted by t.
export default function LineChart({ points, h = 160, unit = '', color = 'var(--acc)', extra = null }) {
  const svgRef = useRef(null)
  const wrapRef = useRef(null)
  const tipRef = useRef(null)
  const [hover, setHover] = useState(null)

  useLayoutEffect(() => { setHover(null) }, [points])

  // Place the tooltip from its measured size so it never hangs off the edge.
  useLayoutEffect(() => {
    const tip = tipRef.current, wrap = wrapRef.current
    if (!hover || !tip || !wrap) return
    const cw = wrap.clientWidth, tw = tip.offsetWidth
    const cx = hover.x / W * cw
    tip.style.left = Math.max(4, Math.min(cw - tw - 4, cx - tw / 2)) + 'px'
  })

  if (!points?.length) return <div className="empty small">No data yet</div>
  const H = h
  const P = { l: 34, r: 12, t: 12, b: 22 }
  const single = points.length === 1
  const pts = single ? [points[0], points[0]] : points
  const ys = pts.map(p => p.y).concat(extra ? extra.map(p => p.y) : [])
  let ymin = Math.min(...ys), ymax = Math.max(...ys)
  if (ymin === ymax) { ymin -= 1; ymax += 1 }
  const pad = (ymax - ymin) * 0.12; ymin -= pad; ymax += pad
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t
  const X = t => (t1 === t0 ? (P.l + W - P.r) / 2 : P.l + (t - t0) / (t1 - t0) * (W - P.l - P.r))
  const Y = y => P.t + (1 - (y - ymin) / (ymax - ymin)) * (H - P.t - P.b)

  const grid = []
  const raw = (ymax - ymin) / 3
  const pow = Math.pow(10, Math.floor(Math.log10(raw)))
  let step = 10 * pow
  for (const m of [1, 2, 2.5, 5, 10]) if (raw <= m * pow) { step = m * pow; break }
  for (let v0 = Math.ceil(ymin / step) * step; v0 <= ymax + 1e-9; v0 += step) {
    const v = Math.round(v0 / step) * step || 0
    grid.push(<g key={'y' + v}>
      <line x1={P.l} y1={Y(v)} x2={W - P.r} y2={Y(v)} stroke="var(--sep)" strokeDasharray="2 4" />
      <text x={P.l - 5} y={Y(v) + 3.5} textAnchor="end" fontSize="9.5" fill="var(--label-2)">{fmtNum(v)}</text>
    </g>)
  }
  const d0 = new Date(t0), d1 = new Date(t1)
  const ticks = []
  for (let m = new Date(d0.getFullYear(), d0.getMonth() + 1, 1); m <= d1; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) ticks.push(m)
  const every = Math.max(1, Math.ceil(ticks.length / 6))
  ticks.forEach((m, i) => {
    if (i % every) return
    grid.push(<text key={'x' + i} x={X(+m)} y={H - 6} textAnchor="middle" fontSize="9.5" fill="var(--label-2)">{MONTHS[m.getMonth()]}</text>)
  })

  const poly = pts.map(p => X(p.t).toFixed(1) + ',' + Y(p.y).toFixed(1)).join(' ')
  const last = pts[pts.length - 1]
  const gid = 'lc' + Math.round(t0 % 1e7) + H
  const hoverPts = points.map(p => ({ x: X(p.t), y: Y(p.y), iso: p.d || isoOf(new Date(p.t)), v: p.y, note: p.note }))

  const onMove = e => {
    const c = e.touches ? e.touches[0] : e
    if (!c) return
    const r = svgRef.current.getBoundingClientRect()
    const vx = (c.clientX - r.left) / (r.width || W) * W
    let best = hoverPts[0]
    for (const p of hoverPts) if (Math.abs(p.x - vx) < Math.abs(best.x - vx)) best = p
    setHover(best)
  }

  return (
    <div className="chart" ref={wrapRef} onMouseMove={onMove} onMouseLeave={() => setHover(null)} onTouchStart={onMove} onTouchMove={onMove}>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ aspectRatio: `${W}/${H}` }}>
        <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity=".3" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient></defs>
        {grid}
        {extra?.length > 1 && <polyline points={extra.map(p => X(p.t).toFixed(1) + ',' + Y(p.y).toFixed(1)).join(' ')}
          fill="none" stroke="var(--label-3)" strokeWidth="1.6" strokeDasharray="4 3" strokeLinejoin="round" />}
        <polygon points={`${P.l},${H - P.b} ${poly} ${X(last.t).toFixed(1)},${H - P.b}`} fill={`url(#${gid})`} />
        <polyline points={poly} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {points.length < 40 && points.map((p, i) => <circle key={i} cx={X(p.t)} cy={Y(p.y)} r="2.6" fill={color} />)}
        <circle cx={X(last.t)} cy={Y(last.y)} r="4" fill={color} />
        {hover && <g>
          <line x1={hover.x} y1={P.t} x2={hover.x} y2={H - P.b} stroke="var(--label-3)" strokeDasharray="3 3" />
          <circle cx={hover.x} cy={hover.y} r="5" fill={color} stroke="var(--bg)" strokeWidth="2" />
        </g>}
      </svg>
      {hover && <div className="ctip" ref={tipRef}>{fmtDate(hover.iso)} · {fmtNum(hover.v)}{unit ? ' ' + unit : ''}{hover.note ? ' · ' + hover.note : ''}</div>}
    </div>
  )
}
