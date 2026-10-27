// The exercise library (src/data/exercises.json, built from openGym's catalogue by
// scripts/build-exercises.mjs): search for the program editor, and muscle guesses for
// exercises imported without a Muscles column. Loaded on demand; it is ~40 KB gzipped.

let cache = null

/** [{ name, equipment, muscles: string[] }], primary muscle first. */
export async function loadLibrary() {
  if (!cache) {
    const { default: data } = await import('../data/exercises.json')
    cache = libraryFrom(data)
  }
  return cache
}

export const libraryFrom = data => data.exercises.map(([name, eq, m]) => ({
  name, equipment: data.equipment[eq], muscles: m.split(','), tokens: tokens(name)
}))

// Gym shorthand → the words the catalogue uses. "lat" is "lateral" in both lateral raise and
// the catalogue's "lateral pulldown".
const EXPAND = {
  db: ['dumbbell'], dbs: ['dumbbell'], bb: ['barbell'], kb: ['kettlebell'], ez: ['ez'],
  ohp: ['overhead', 'press'], rdl: ['romanian', 'deadlift'], sldl: ['stiff', 'leg', 'deadlift'],
  bw: ['body', 'weight'], lat: ['lateral'], lats: ['lateral'], tib: ['tibialis'], tibs: ['tibialis'],
  tri: ['triceps'], tricep: ['triceps'], bi: ['biceps'], bicep: ['biceps'], ext: ['extension'],
  pushdown: ['pushdown'], pulldown: ['pulldown'], pullup: ['pull', 'up'], chinup: ['chin', 'up'],
  smith: ['smith'], cgbp: ['close', 'grip', 'bench', 'press'], ghr: ['glute', 'ham', 'raise'],
  hip: ['hip'], in: ['adduction'], out: ['abduction'], ff: [], rf: [], bss: ['bulgarian', 'split', 'squat'],
  flat: [], paused: [], pause: []
}
// Movement words. A library entry that adds one the name doesn't have is a different exercise.
const MOVES = new Set(['press', 'row', 'curl', 'raise', 'squat', 'deadlift', 'lunge', 'fly', 'pulldown', 'pushdown',
  'extension', 'crunch', 'plank', 'twist', 'shrug', 'thrust', 'bridge', 'dip', 'pull', 'push', 'kickback', 'pullover',
  'swing', 'clean', 'snatch', 'jump', 'hold', 'walk', 'carry', 'stretch', 'rotation', 'deadbug', 'hyper', 'up'])
// Words that make an entry a variation; an unasked-for one ranks it below the plain version.
const VARIANT = new Set(['lying', 'kneeling', 'alternate', 'alternating', 'single', 'one', 'arm', 'leg', 'cross', 'banded',
  'band', 'close', 'wide', 'pin', 'guillotine', 'jm', 'reverse', 'pause', 'isometric', 'tempo', 'partial', 'side', 'floor'])
// Equipment most gym programs use; the rest (bands, balls, suspension trainers) rank lower.
const COMMON = new Set(['barbell', 'dumbbell', 'cable', 'leverage machine', 'smith machine', 'body weight', 'ez barbell', 'weighted', 'trap bar', 'landmine'])
const CLASSIC = new Set(['barbell', 'dumbbell', 'cable', 'lever', 'smith'])
export const MAX_GUESSED_MUSCLES = 3

/** Library equipment that means bodyweight: these progress by reps (Increment 0). */
export const BODYWEIGHT_EQUIPMENT = new Set(['body weight', 'assisted', 'suspension trainer'])
const STOP = new Set(['with', 'the', 'a', 'on', 'and', 'of', 'to', 'v'])
const stem = w => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w)

export function tokens(name) {
  const out = []
  for (const raw of String(name).toLowerCase().replace(/[’']/g, '').split(/[^a-z0-9]+/)) {
    if (!raw || STOP.has(raw)) continue
    for (const w of EXPAND[raw] ?? [raw]) out.push(stem(w))
  }
  return out
}

/** Tokens for something a person typed: "Flat Bench", "Incline DB" and "Smith Incline" mean a press. */
export function queryTokens(name) {
  const out = tokens(name)
  if (out.some(w => w === 'bench' || w === 'incline' || w === 'decline') && !out.some(w => MOVES.has(w) || w === 'flye')) out.push('press')
  return out
}

/**
 * Library entries ranked for a query. All query words must appear (as a word or a prefix of
 * one); shorter, plainer names rank first. Filters: muscle slug, equipment string.
 */
export function search(lib, query, { muscle, equipment, limit = 60, exact = false } = {}) {
  const q = typeof query === 'string' ? queryTokens(query) : query
  const res = []
  for (const e of lib) {
    if (muscle && !e.muscles.includes(muscle)) continue
    if (equipment && e.equipment !== equipment) continue
    let score = 0
    if (q.length) {
      let hit = 0
      for (const t of q) if (e.tokens.some(w => w === t || (!exact && t.length >= 3 && w.startsWith(t)))) hit++
      if (hit < q.length) continue
      score = e.tokens.length - q.length
      if (!score) score = -4                                  // exactly what was asked for
      for (const w of e.tokens) {
        if (q.includes(w)) continue
        if (MOVES.has(w)) score += 3
        else if (VARIANT.has(w)) score += 1
      }
    } else score = e.tokens.length
    if (!COMMON.has(e.equipment)) score += 2
    else if (CLASSIC.has(e.tokens[0])) score -= 1.5
    if (muscle && e.muscles[0] === muscle) score -= 2          // primary mover first
    res.push([score, e])
  }
  return res.sort((a, b) => a[0] - b[0] || a[1].name.length - b[1].name.length).slice(0, limit).map(r => r[1])
}

// Last resort for names that match nothing in the library: a word → muscles table.
const KEYWORDS = [
  [/nordic|leg curl|hamstring curl|ham curl|glute ham/, ['hamstring']],
  [/reverse curl|wrist|dead ?hang|farmer|grip/, ['forearm']],
  [/curl/, ['biceps']],
  [/crunch|sit.?up|plank|leg raise|ab wheel|rollout|hollow/, ['abs']],
  [/twist|woodchop|side bend|pallof/, ['obliques', 'abs']],
  [/calf/, ['calves']],
  [/tib/, ['tibialis']],
  [/shrug/, ['trapezius']],
  [/face pull|rear delt|reverse fly/, ['deltoids', 'trapezius', 'upper-back']],
  [/lateral raise|lat raise|side raise|front raise|overhead press|shoulder press|\bohp\b|military/, ['deltoids', 'triceps']],
  [/pushdown|skull|tricep|kickback|dip/, ['triceps']],
  [/bench|chest press|push.?up|fly|flye|pec/, ['chest', 'triceps', 'deltoids']],
  [/pulldown|pull.?up|chin.?up|pullover/, ['upper-back', 'biceps']],
  [/row/, ['upper-back', 'biceps', 'deltoids']],
  [/good morning|back extension|hyperextension|rdl|romanian|stiff/, ['hamstring', 'gluteal', 'lower-back']],
  [/deadlift/, ['gluteal', 'hamstring', 'lower-back', 'trapezius']],
  [/hip thrust|glute bridge|kickback|abduct|hip out/, ['gluteal']],
  [/adduct|hip in|copenhagen/, ['adductors']],
  [/leg extension/, ['quadriceps']],
  [/squat|lunge|leg press|step.?up|split/, ['quadriceps', 'gluteal', 'adductors']]
]

/**
 * Muscles for an exercise name: the best library match (all of the name's words present,
 * fewest extra), else the keyword table. Returns { muscles, match } or null.
 */
export function guessMuscles(lib, name) {
  const q = queryTokens(name)
  if (q.length) {
    // Drop words the library never uses ("FF", "paused", "Z") and require the rest.
    const known = q.filter(t => lib.some(e => e.tokens.includes(t)))
    if (known.length && known.length >= q.length - 1) {
      const best = search(lib, known, { limit: 1, exact: true })[0]
      const extraMoves = best ? best.tokens.filter(w => MOVES.has(w) && !known.includes(w)).length : 0
      if (best && !extraMoves && best.tokens.length - known.length <= 3) return { muscles: best.muscles.slice(0, MAX_GUESSED_MUSCLES), match: best.name }
    }
  }
  const n = String(name).toLowerCase()
  const kw = KEYWORDS.find(([re]) => re.test(n))
  return kw ? { muscles: kw[1], match: null } : null
}

/** Fill in muscles for exercises that have none. Returns the names it could not place. */
export function fillMuscles(program, lib) {
  const missed = []
  for (const d of program.days) for (const e of d.exercises) {
    if (e.muscles?.length) continue
    const g = guessMuscles(lib, e.name)
    if (g) e.muscles = [...g.muscles]
    else if (!missed.includes(e.name)) missed.push(e.name)
  }
  return missed
}
