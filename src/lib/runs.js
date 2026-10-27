import { live, dateOf, isoOf, addDays, uid } from './util.js'

// Weekly runs: the program's plan is up to MAX_RUNS named runs, each with an optional
// planned distance (km) and notes. A logged run records which planned run it was (planId)
// plus what was actually done. Older data used three fixed types (easy/quality/long) in
// miles; those ids are kept so old logs still line up.

export const MAX_RUNS = 7
export const KM_PER_MILE = 1.609344
const LEGACY = [{ id: 'easy', name: 'Easy' }, { id: 'quality', name: 'Quality' }, { id: 'long', name: 'Long' }]

const km1 = n => Math.round(n * 10) / 10
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const numOrNull = v => (v === '' || v == null || !isFinite(Number(v)) || Number(v) < 0 ? null : Number(v))

/**
 * The run plan of a program: { enabled, plan: [{ id, name, km, notes }] }.
 * Accepts the current shape, the old runTargets ({ easy: { miles, notes }, ... }), or nothing
 * (the original three runs, no distances).
 */
export function normalizeRuns(runs, legacyTargets) {
  if (runs && typeof runs === 'object' && Array.isArray(runs.plan)) {
    const ids = new Set()
    const plan = runs.plan.slice(0, MAX_RUNS).map((r, i) => {
      const name = String(r.name || '').trim() || `Run ${i + 1}`
      let id = String(r.id || slug(name) || uid())          // from the name, so "Easy" lines up with old logs
      while (ids.has(id)) id = uid()
      ids.add(id)
      return { id, name, km: numOrNull(r.km), notes: String(r.notes || '') }
    })
    return { enabled: runs.enabled !== false, plan }
  }
  const t = legacyTargets || {}
  return {
    enabled: true,
    plan: LEGACY.map(({ id, name }) => ({
      id, name,
      km: t[id]?.miles != null && t[id].miles !== '' ? km1(Number(t[id].miles) * KM_PER_MILE) : null,
      notes: t[id]?.notes || ''
    }))
  }
}

/** Give runs in next the ids of same-named runs in current, so logged runs stay attached. */
export function keepRunIds(next, current) {
  if (!next || !current) return next
  const byName = new Map(current.plan.map(p => [p.name.trim().toLowerCase(), p.id]))
  const used = new Set()
  const plan = next.plan.map(p => {
    const id = byName.get(p.name.trim().toLowerCase())
    if (!id || used.has(id)) return p
    used.add(id)
    return { ...p, id }
  })
  return { ...next, plan }
}

export const programRuns = program => normalizeRuns(program?.runs, program?.runTargets)

/** Distance of a logged run in km (old records stored miles). */
export const runKm = r => (r.km != null ? r.km : r.miles != null ? km1(r.miles * KM_PER_MILE) : null)

export const runPlanId = r => r.planId ?? r.type

/** Display name of a logged run. */
export const runName = (r, plan = []) =>
  r.name || plan.find(p => p.id === runPlanId(r))?.name || LEGACY.find(t => t.id === r.type)?.name || 'Run'

// Distances are stored in km; runUnit ('km' or 'mi', a setting) only changes how they are shown
// and typed.
const round = (n, d) => Math.round(n * 10 ** d) / 10 ** d

/** km → the run unit, one decimal. */
export const toDist = (km, unit = 'km') => (km == null ? null : unit === 'mi' ? round(km / KM_PER_MILE, 1) : round(km, 1))

/** A typed distance in the run unit → km (null when blank or not a number). */
export function fromDist(v, unit = 'km') {
  const n = numOrNull(typeof v === 'string' ? v.replace(',', '.') : v)
  return n == null ? null : unit === 'mi' ? round(n * KM_PER_MILE, 3) : n
}

const trim = n => String(round(n, 1))

/** "6.4 km" / "4 mi" */
export const fmtDist = (km, unit = 'km') => (km == null ? '' : `${trim(toDist(km, unit))} ${unit}`)

/** Short form for the run chips: "5k", "3.1mi". */
export const shortDist = (km, unit = 'km') => (km == null ? '' : `${trim(toDist(km, unit))}${unit === 'mi' ? 'mi' : 'k'}`)

/** Short duration for the run chips: "30m", "1.5h". */
export const shortTime = min => (min == null ? '' : Math.round(min) < 60 ? `${Math.round(min)}m` : `${trim(min / 60)}h`)

/** Monday of the week containing iso. */
export function weekStart(iso) {
  const d = dateOf(iso)
  d.setDate(d.getDate() - (d.getDay() + 6) % 7)
  return isoOf(d)
}

/** { done: { [planId]: run }, count, km } for the Mon–Sun week of iso. */
export function runsForWeek(runs, iso, plan) {
  const from = weekStart(iso), to = addDays(from, 6)
  const ids = new Set(plan.map(p => p.id))
  const done = {}
  let km = 0
  for (const r of live(runs)) {
    if (r.date < from || r.date > to) continue
    km += runKm(r) || 0
    const id = runPlanId(r)
    if (!ids.has(id)) continue
    if (!done[id] || r.date > done[id].date) done[id] = r
  }
  return { done, count: Object.keys(done).length, km: km1(km) }
}

/** A planned run for this week: distance scaled down in a deload week. */
export function runTarget(item, isDeload, deloadFactor = 0.7) {
  const km = item.km != null ? (isDeload ? km1(item.km * deloadFactor) : item.km) : null
  return { km, notes: item.notes || '' }
}
