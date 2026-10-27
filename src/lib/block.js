// Training blocks: N build weeks then a planned deload week, shared by lifting and running.
//
// Position is calendar-based (Monday-aligned weeks counted from settings.blockStart): fatigue
// accumulates with time, not with sessions. The PPLUL day rotation stays log-driven and is
// independent of this.

import { dateOf, addDays } from './util.js'
import { weekStart } from './runs.js'
import { topWeight, roundTo } from './progression.js'

export const DEFAULT_BLOCK = {
  build: 3,
  deload: 1,
  liftDeload: { setsFactor: 0.5, rirAdd: 2, weightFactor: 1 },
  runDeloadFactor: 0.7
}

// Each deload knob kept within a sensible range; anything unreadable falls back to the default.
const clamp = (v, lo, hi, dflt) => (v == null || v === '' || !Number.isFinite(Number(v)) ? dflt : Math.min(hi, Math.max(lo, Number(v))))

export const normalizeBlock = b => {
  const ld = { ...DEFAULT_BLOCK.liftDeload, ...(b?.liftDeload || {}) }
  const d = DEFAULT_BLOCK.liftDeload
  const knobs = {
    liftDeload: {
      setsFactor: clamp(ld.setsFactor, 0.25, 1, d.setsFactor),
      rirAdd: clamp(ld.rirAdd, 0, 4, d.rirAdd),
      weightFactor: clamp(ld.weightFactor, 0.6, 1, d.weightFactor)
    },
    runDeloadFactor: clamp(b?.runDeloadFactor, 0.4, 1, DEFAULT_BLOCK.runDeloadFactor)
  }
  if (b === null || b?.enabled === false) return { ...DEFAULT_BLOCK, ...(b || {}), ...knobs, enabled: false }
  return { ...DEFAULT_BLOCK, ...(b || {}), ...knobs, enabled: true }
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

/** Deload-week prescription: fewer sets, same (or cut) weight, more reps in reserve, no progression. */
export function deloadTarget(ex, target, blockCfg) {
  const { setsFactor, rirAdd, weightFactor } = normalizeBlock(blockCfg).liftDeload
  const sets = Math.max(1, Math.ceil(ex.sets * setsFactor))
  const reps = target.reps.slice(0, sets).map(() => ex.repMin)
  // Hold the last working weight (no increase mid-deload), less the deload's weight cut if any.
  const held = target.last ? topWeight(target.last) : target.weight
  const weight = weightFactor < 1 ? roundTo(held * weightFactor, Number(ex.increment) || 0) : held
  const load = weightFactor < 1 ? `${Math.round(weightFactor * 100)}% weight` : 'same weight'
  return {
    ...target,
    weight,
    reps,
    rir: (Number(ex.rir) || 0) + rirAdd,
    kind: 'block-deload',
    reason: `Deload week: ${sets} set${sets > 1 ? 's' : ''}, ${load}, leave ${(Number(ex.rir) || 0) + rirAdd} in the tank`
  }
}

