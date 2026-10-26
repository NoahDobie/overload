// What to lift next: double progression, derived purely from the log.
//
// Ported in spirit from openGym's lib/progression.js: nothing is stored, the next target is
// recomputed from history every time, so fixing a mistyped set immediately fixes the next
// prescription. Reading a session honestly:
//   · a set checked off with at least repMax reps → hit
//   · fewer reps, unchecked, or fewer sets than prescribed → not a hit
// so a session that fell apart can never advance the load. Planned deload sessions are
// skipped entirely: a light week says nothing about what you can lift.

import { live, byDate } from './util.js'

export const DELOAD_FACTOR = 0.9
export const DELOAD_AFTER = 2

export const exKey = name => String(name || '').trim().toLowerCase().replace(/\s+/g, ' ')

/** Completed appearances of an exercise, oldest first: [{ date, sets: [{ w, r }], deload }]. */
export function historyFor(sessions, name, { includeDeload = false } = {}) {
  const key = exKey(name)
  const out = []
  for (const s of live(sessions).sort(byDate)) {
    if (s.deload && !includeDeload) continue
    for (const e of s.entries || []) {
      if (exKey(e.name) !== key) continue
      const sets = (e.sets || []).filter(x => x.done).map(x => ({ w: Number(x.w) || 0, r: Number(x.r) || 0 }))
      if (sets.length) out.push({ date: s.date, sets, deload: !!s.deload })
    }
  }
  return out
}

export const topWeight = h => Math.max(...h.sets.map(s => s.w))

export const roundTo = (w, step) => (step > 0 ? Math.round(w / step) * step : Math.round(w * 10) / 10)

/** Every prescribed set done at ≥ repMax, at (at least) weight w. */
const isHit = (h, ex, w) => {
  const work = h.sets.filter(s => s.w >= w)
  return work.length >= ex.sets && work.slice(0, ex.sets).every(s => s.r >= ex.repMax)
}

/** Every set short of repMin, with the top set at weight w. */
const isMiss = (h, ex, w) => topWeight(h) === w && h.sets.every(s => s.r < ex.repMin)

/**
 * The next prescription for one exercise (build week).
 * Returns { weight, reps: number[], rir, kind: 'start'|'up'|'hold'|'deload'|'reps', reason, last }
 */
export function nextTarget(ex, history, unit = 'lb') {
  const inc = Number(ex.increment) || 0
  const sets = ex.sets
  const rir = ex.rir
  const fill = n => Array(sets).fill(n)

  if (!history.length) {
    return { weight: Number(ex.startWeight) || 0, reps: fill(ex.repMin), rir, kind: 'start', reason: 'First session: starting weight from your program', last: null }
  }

  const last = history[history.length - 1]
  const w = topWeight(last)
  const lastReps = last.sets.filter(s => s.w >= w).map(s => s.r)
  const repsTxt = last.sets.map(s => s.r).join('/')

  // Consecutive hits at this weight, newest backwards.
  let streak = 0
  for (let i = history.length - 1; i >= 0 && isHit(history[i], ex, w); i--) streak++
  const need = Math.max(1, Number(ex.hitsToProgress) || 1)

  if (streak >= need) {
    if (inc > 0) {
      return { weight: roundTo(w + inc, inc), reps: fill(ex.repMin), rir, kind: 'up', reason: `Hit ${repsTxt} @ ${w} → +${inc} ${unit}`, last }
    }
    // Bodyweight / no load: keep climbing reps past the range.
    const reps = Array.from({ length: sets }, (_, i) => (lastReps[i] ?? ex.repMax) + 1)
    return { weight: w, reps, rir, kind: 'reps', reason: `Top of range (${repsTxt}): add a rep or make it harder`, last }
  }

  const recent = history.slice(-DELOAD_AFTER)
  if (inc > 0 && recent.length === DELOAD_AFTER && recent.every(h => isMiss(h, ex, w))) {
    const dw = Math.max(0, roundTo(w * DELOAD_FACTOR, inc))
    return { weight: dw, reps: fill(ex.repMin), rir, kind: 'deload', reason: `Under ${ex.repMin} reps ${DELOAD_AFTER}× at ${w}: drop 10% and rebuild`, last }
  }

  const reps = Array.from({ length: sets }, (_, i) =>
    Math.min(ex.repMax, Math.max(ex.repMin, (lastReps[i] ?? ex.repMin - 1) + 1)))
  const hint = need > 1 && streak > 0 ? ` (${streak}/${need} at top)` : ''
  return { weight: w, reps, rir, kind: 'hold', reason: `Last: ${repsTxt} @ ${w}. Beat it by a rep${hint}`, last }
}
