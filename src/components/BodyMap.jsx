import { useEffect, useState } from 'react'
import { MUSCLES, INERT, MUSCLE_NAME, levelsOf } from '../lib/muscles.js'

// Front and back views of a body, each muscle shaded 0–4 by how hard it was worked.
// Ported from openGym's components/BodyMap.jsx; the outlines are MuscleMap (MIT, see NOTICE.md).
// The geometry is ~90 KB, so it is fetched on first render rather than in the main bundle.

let CACHE = null
let PENDING = null

function useBodyPaths() {
  const [paths, setPaths] = useState(CACHE)
  useEffect(() => {
    if (CACHE) return
    let alive = true
    PENDING = PENDING || import('../lib/body-paths.js').then(m => (CACHE = m.default))
    PENDING.then(p => { if (alive) setPaths(p) }).catch(() => {})
    return () => { alive = false }
  }, [])
  return paths
}

function View({ view, levels }) {
  return (
    <svg className="bm-v" viewBox={view.vb} role="img">
      {INERT.map(slug => (view.p[slug] || []).map((d, i) => <path key={slug + i} className="bm-sil" d={d} />))}
      {MUSCLES.map(slug => (view.p[slug] || []).map((d, i) =>
        <path key={slug + i} className={'bm-m l' + (levels[slug] || 0)} d={d}><title>{MUSCLE_NAME[slug]}</title></path>))}
    </svg>
  )
}

export default function BodyMap({ load = {}, body = 'male' }) {
  const paths = useBodyPaths()
  const levels = levelsOf(load)
  const g = paths && (paths[body] || paths.male)
  return (
    <div className="bodymap">
      {g ? <><View view={g.front} levels={levels} /><View view={g.back} levels={levels} /></> : <div className="bm-ph" aria-hidden="true" />}
    </div>
  )
}
