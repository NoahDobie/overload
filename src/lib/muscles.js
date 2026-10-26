// Muscles a body map can shade, and weekly working sets per muscle.
// Trimmed from openGym's lib/muscles.js (MUSCLES, MUSCLE_NAME, the alias idea, levelsOf).

import { live } from './util.js'
import { exKey } from './progression.js'

export const MUSCLES = [
  'trapezius', 'deltoids', 'chest', 'upper-back', 'serratus',
  'biceps', 'triceps', 'forearm',
  'abs', 'obliques', 'lower-back',
  'gluteal', 'quadriceps', 'hamstring', 'adductors', 'hip-flexors',
  'calves', 'tibialis'
]

export const INERT = ['head', 'hair', 'neck', 'hands', 'feet', 'knees', 'ankles']

export const MUSCLE_NAME = {
  trapezius: 'Traps', deltoids: 'Shoulders', chest: 'Chest', 'upper-back': 'Lats & upper back',
  serratus: 'Serratus', biceps: 'Biceps', triceps: 'Triceps', forearm: 'Forearms',
  abs: 'Abs', obliques: 'Obliques', 'lower-back': 'Lower back', gluteal: 'Glutes',
  quadriceps: 'Quads', hamstring: 'Hamstrings', adductors: 'Adductors',
  'hip-flexors': 'Hip flexors', calves: 'Calves', tibialis: 'Shins'
}

// Common spellings → map slug. Anything else is reported as unknown on import.
const ALIAS = {
  traps: 'trapezius', trap: 'trapezius', 'upper traps': 'trapezius',
  shoulders: 'deltoids', shoulder: 'deltoids', delts: 'deltoids', delt: 'deltoids', 'front delts': 'deltoids',
  'side delts': 'deltoids', 'rear delts': 'deltoids', 'lateral delts': 'deltoids', 'rotator cuff': 'deltoids',
  pecs: 'chest', pec: 'chest', pectorals: 'chest', 'upper chest': 'chest',
  lats: 'upper-back', lat: 'upper-back', back: 'upper-back', 'upper back': 'upper-back', rhomboids: 'upper-back',
  'latissimus dorsi': 'upper-back', 'mid back': 'upper-back',
  'serratus anterior': 'serratus',
  bicep: 'biceps', brachialis: 'biceps', tricep: 'triceps', forearms: 'forearm', grip: 'forearm',
  core: 'abs', abdominals: 'abs', ab: 'abs', oblique: 'obliques',
  'lower back': 'lower-back', erectors: 'lower-back', spine: 'lower-back',
  glutes: 'gluteal', glute: 'gluteal', abductors: 'gluteal',
  quads: 'quadriceps', quad: 'quadriceps', hamstrings: 'hamstring', hams: 'hamstring',
  adductor: 'adductors', 'hip flexors': 'hip-flexors', calf: 'calves', shins: 'tibialis', tibs: 'tibialis'
}

/** Map a free-text muscle name to a slug, or null. */
export function normalizeMuscle(name) {
  const k = String(name || '').trim().toLowerCase()
  if (!k) return null
  if (MUSCLES.includes(k)) return k
  const dashed = k.replace(/\s+/g, '-')
  if (MUSCLES.includes(dashed)) return dashed
  return ALIAS[k] || null
}

/**
 * Working sets per muscle across sessions on/after sinceISO. The first listed muscle of an
 * exercise gets a full set, the others half, the same primary/secondary split openGym uses.
 */
export function muscleLoad(sessions, program, sinceISO) {
  const musclesOf = {}
  for (const d of program?.days || []) for (const e of d.exercises) musclesOf[exKey(e.name)] = e.muscles || []
  const load = {}
  for (const s of live(sessions)) {
    if (s.date < sinceISO) continue
    for (const e of s.entries || []) {
      const n = (e.sets || []).filter(x => x.done).length
      const ms = musclesOf[exKey(e.name)] || e.muscles || []
      ms.forEach((m, i) => { load[m] = (load[m] || 0) + n * (i === 0 ? 1 : 0.5) })
    }
  }
  return load
}

/** 0–4 shade per muscle, relative to the hardest-worked one. */
export function levelsOf(load) {
  const max = Math.max(0, ...MUSCLES.map(m => load[m] || 0))
  const lv = {}
  MUSCLES.forEach(m => {
    const v = load[m] || 0
    lv[m] = !v || max <= 0 ? 0 : Math.max(1, Math.min(4, Math.ceil(v / max * 4)))
  })
  return lv
}
