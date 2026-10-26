// Training blocks: N build weeks then a planned deload week, shared by lifting and running.
//
// Position is calendar-based (Monday-aligned weeks counted from settings.blockStart): fatigue
// accumulates with time, not with sessions. The PPLUL day rotation stays log-driven and is
// independent of this.

import { dateOf, addDays } from './util.js'
import { weekStart } from './runs.js'
import { topWeight } from './progression.js'

export const DEFAULT_BLOCK = {
  build: 3,
  deload: 1,
  liftDeload: { setsFactor: 0.5, rirAdd: 2 },
  runDeloadFactor: 0.7
}

export const normalizeBlock = b => {
  if (b === null || b?.enabled === false) return { ...DEFAULT_BLOCK, enabled: false }
  return {
    ...DEFAULT_BLOCK,
    ...(b || {}),
    liftDeload: { ...DEFAULT_BLOCK.liftDeload, ...(b?.liftDeload || {}) },
    enabled: true
  }
}

const weeksBetween = (fromMonday, toMonday) => Math.round((dateOf(toMonday) - dateOf(fromMonday)) / (7 * 864e5))

/**
 * Where iso falls in the block cycle.
 * Returns { enabled, block (1-based), week (1-based), length, isDeload, weekStart }
 */
export function blockPosition(blockCfg, blockStart, iso) {
  const b = normalizeBlock(blockCfg)
  const ws = weekStart(iso)
  if (!b.enabled || !blockStart) return { enabled: false, block: 0, week: 0, length: 0, isDeload: false, weekStart: ws }
  const length = b.build + b.deload
  const n = weeksBetween(weekStart(blockStart), ws)
  const k = ((n % length) + length) % length
  return { enabled: true, block: Math.floor(n / length) + 1, week: k + 1, length, isDeload: k >= b.build, weekStart: ws }
}

/** blockStart that makes the week of iso the (first) deload week. */
export const startDeloadNow = (blockCfg, iso) => addDays(weekStart(iso), -7 * normalizeBlock(blockCfg).build)

/** blockStart that begins a fresh block on the Monday after iso. */
export const restartNextMonday = iso => addDays(weekStart(iso), 7)

/** blockStart that makes the week of iso build week 1 (skips a deload in progress). */
export const restartThisWeek = iso => weekStart(iso)

/** Deload-week prescription: same weight, fewer sets, more reps in reserve, no progression. */
export function deloadTarget(ex, target, blockCfg) {
  const { setsFactor, rirAdd } = normalizeBlock(blockCfg).liftDeload
  const sets = Math.max(1, Math.ceil(ex.sets * setsFactor))
  const reps = target.reps.slice(0, sets).map(() => ex.repMin)
  return {
    ...target,
    // Hold the last working weight: no increase mid-deload, and no extra cut on top of it.
    weight: target.last ? topWeight(target.last) : target.weight,
    reps,
    rir: (Number(ex.rir) || 0) + rirAdd,
    kind: 'block-deload',
    reason: `Deload week: ${sets} set${sets > 1 ? 's' : ''}, same weight, leave ${(Number(ex.rir) || 0) + rirAdd} in the tank`
  }
}

/** Run target for a type this week, scaled down in a deload week. null when none is set. */
export function runTarget(runTargets, type, isDeload, blockCfg) {
  const t = runTargets?.[type]
  const f = normalizeBlock(blockCfg).runDeloadFactor
  const miles = t?.miles != null ? (isDeload ? Math.round(t.miles * f * 10) / 10 : t.miles) : null
  let notes = t?.notes || ''
  if (isDeload) {
    notes = type === 'quality' ? 'Easy run + 4–6 strides' : type === 'long' ? 'Shorter, fully conversational' : 'Easy, keep it relaxed'
  }
  if (miles == null && !notes) return null
  return { miles, notes }
}
