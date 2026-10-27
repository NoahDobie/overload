// The whole app state: one Zustand store persisted to localStorage, the same pattern as
// openGym's store/useStore.js. `active` (the workout in progress) is device-local; the rest
// syncs (see lib/sync.js).

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { uid, todayISO } from './lib/util.js'
import { historyFor, nextTarget, exKey } from './lib/progression.js'
import { blockPosition, deloadTarget, restartThisWeek } from './lib/block.js'
import { programRuns } from './lib/runs.js'
import { BODYWEIGHT_EQUIPMENT, MAX_GUESSED_MUSCLES } from './lib/exercises.js'

const now = () => Date.now()

export const unitOf = S => S.settings?.unit || S.program?.unit || 'lb'

/** Unit runs are shown and typed in ('km' or 'mi'); they are always stored in km. */
export const runUnitOf = S => (S.settings?.runUnit === 'mi' ? 'mi' : 'km')

export const blockOf = (S, iso = todayISO()) => blockPosition(S.program?.block, S.settings?.blockStart, iso)

/** Target for one exercise today, deload-adjusted when the block says so. */
export function targetFor(S, ex, isDeload) {
  const t = nextTarget(ex, historyFor(S.sessions, ex.name), unitOf(S))
  return isDeload ? deloadTarget(ex, t, S.program?.block) : t
}

const touch = x => ({ ...x, updatedAt: now() })

// lb ↔ kg. Weights keep one decimal; increments map to the matching plate step.
export const LB_PER_KG = 2.20462262
const STEP_LB_TO_KG = { 1.25: 0.5, 2.5: 1.25, 5: 2.5, 10: 5, 20: 10 }
const STEP_KG_TO_LB = { 0.5: 1.25, 1.25: 2.5, 2.5: 5, 5: 10, 10: 20 }
const half = n => Math.round(n * 2) / 2
export function convertWeight(w, to) {
  const n = Number(w)
  if (!n) return w
  return Math.round((to === 'kg' ? n / LB_PER_KG : n * LB_PER_KG) * 10) / 10
}
export function convertStep(step, to) {
  const n = Number(step) || 0
  if (!n) return 0
  const table = to === 'kg' ? STEP_LB_TO_KG : STEP_KG_TO_LB
  return table[n] ?? Math.max(0.5, half(to === 'kg' ? n / LB_PER_KG : n * LB_PER_KG))
}
/** Whether anything has a weight that a unit switch would convert. */
export const hasWeights = S =>
  (S.sessions || []).some(s => !s.deleted && s.entries?.some(e => e.sets.some(x => Number(x.w)))) ||
  (S.bodyweight || []).some(b => !b.deleted) ||
  !!S.program?.days.some(d => d.exercises.some(e => Number(e.startWeight)))

// A workout left untouched this long is treated as abandoned: on return the app asks to save
// or discard it instead of jumping back in.
export const STALE_WORKOUT_MS = 4 * 60 * 60 * 1000
export const lastActivity = a => Math.max(a.startedAt || 0, a.touchedAt || 0, a.lastSetAt || 0)
export const isStale = (a, at = now()) => !!a && at - lastActivity(a) > STALE_WORKOUT_MS

export const useStore = create(persist((set, get) => ({
  program: null,
  sessions: [],
  runs: [],
  bodyweight: [],
  settings: { unit: 'lb', blockStart: null, updatedAt: 0 },
  active: null,
  programClearedAt: 0,   // when the program was cleared (synced as a tombstone)
  resetAt: 0,            // last account reset (see lib/merge.js)

  setProgram(program) {
    const S = get()
    set({
      program: touch(program),
      settings: touch({ ...S.settings, unit: program.unit || S.settings.unit, blockStart: S.settings.blockStart || restartThisWeek(todayISO()) })
    })
  },

  setSettings(patch) { set({ settings: touch({ ...get().settings, ...patch }) }) },

  setBlock(patch) {
    const p = get().program
    if (p) set({ program: touch({ ...p, block: { ...p.block, ...patch } }) })
  },

  setRuns(patch) {
    const p = get().program
    if (!p) return
    const runs = { ...programRuns(p), ...patch }
    // Switching runs on with nothing planned starts with one easy run, as the editor does.
    if (runs.enabled && !runs.plan.length) runs.plan = [{ id: uid(), name: 'Easy', km: null, notes: '' }]
    set({ program: touch({ ...p, runs }) })
  },

  startWorkout(dayId) {
    const S = get()
    const day = S.program?.days.find(d => d.id === dayId)
    if (!day) return
    const isDeload = blockOf(S).isDeload
    set({
      active: {
        id: uid(), dayId, date: todayISO(), startedAt: now(), deload: isDeload,
        entries: day.exercises.map(ex => {
          const target = targetFor(S, ex, isDeload)
          return {
            exId: ex.id, name: ex.name, target,
            sets: target.reps.map(r => ({ w: target.weight, r, done: false }))
          }
        })
      }
    })
  },

  updateSet(ei, si, patch) {
    const a = get().active
    if (!a) return
    const entries = a.entries.map((e, i) => i !== ei ? e : {
      ...e,
      // A weight change carries down to later sets that are not done yet.
      sets: e.sets.map((s, j) =>
        j === si ? { ...s, ...patch }
          : j > si && 'w' in patch && !s.done ? { ...s, w: patch.w }
            : s)
    })
    const t = now()
    set({ active: { ...a, entries, touchedAt: t, ...(patch.done ? { lastSetAt: t } : {}) } })
  },

  addSet(ei) {
    const a = get().active
    if (!a) return
    const entries = a.entries.map((e, i) => {
      if (i !== ei) return e
      const last = e.sets[e.sets.length - 1] || { w: e.target.weight, r: e.target.reps[0] }
      return { ...e, sets: [...e.sets, { w: last.w, r: last.r, done: false }] }
    })
    set({ active: { ...a, entries, touchedAt: now() } })
  },

  removeSet(ei) {
    const a = get().active
    if (!a) return
    set({ active: { ...a, touchedAt: now(), entries: a.entries.map((e, i) => (i === ei && e.sets.length > 1 ? { ...e, sets: e.sets.slice(0, -1) } : e)) } })
  },

  /**
   * Add an exercise to today's workout only (the program is unchanged). One the program has
   * elsewhere keeps its prescription; a new one gets the editor's defaults. Either way the
   * target follows its own logged history.
   */
  addEntry(pick) {
    const S = get()
    const a = S.active
    if (!a) return
    const known = S.program?.days.flatMap(d => d.exercises).find(x => exKey(x.name) === exKey(pick.name))
    const bodyweight = pick.equipment && BODYWEIGHT_EQUIPMENT.has(pick.equipment)
    const ex = known
      ? { ...known }
      : { name: pick.name, sets: 3, repMin: 8, repMax: 12, rir: 2, increment: bodyweight ? 0 : unitOf(S) === 'kg' ? 2.5 : 5, startWeight: 0, hitsToProgress: 1 }
    const target = targetFor(S, ex, !!a.deload)
    const entry = {
      exId: 'x-' + uid(), name: known?.name || pick.name, adhoc: ex,
      muscles: (known?.muscles?.length ? known.muscles : pick.muscles || []).slice(0, MAX_GUESSED_MUSCLES),
      target, sets: target.reps.map(r => ({ w: target.weight, r, done: false }))
    }
    set({ active: { ...a, entries: [...a.entries, entry], touchedAt: now() } })
  },

  /** Skip (or un-skip) an exercise for today: it is left out of the count and of the saved session. */
  skipEntry(ei, skipped = true) {
    const a = get().active
    if (!a) return
    set({ active: { ...a, touchedAt: now(), entries: a.entries.map((e, i) => (i === ei ? { ...e, skipped } : e)) } })
  },

  /** Take an added exercise back out of today's workout. */
  removeEntry(ei) {
    const a = get().active
    if (!a) return
    set({ active: { ...a, touchedAt: now(), entries: a.entries.filter((_, i) => i !== ei) } })
  },

  setActiveDeload(deload) {
    const S = get()
    const a = S.active
    if (!a) return
    const day = S.program?.days.find(d => d.id === a.dayId)
    if (!day) return
    // Re-prescribe sets that have not been touched yet.
    const entries = a.entries.map(e => {
      const ex = day.exercises.find(x => x.id === e.exId) || e.adhoc
      if (!ex || e.sets.some(s => s.done)) return e
      const target = targetFor(S, ex, deload)
      return { ...e, target, sets: target.reps.map(r => ({ w: target.weight, r, done: false })) }
    })
    set({ active: { ...a, deload, entries, touchedAt: now() } })
  },

  finishWorkout() {
    const a = get().active
    if (!a) return
    const session = {
      id: a.id, dayId: a.dayId, date: a.date, deload: !!a.deload,
      // Until the last ticked set, so time away from the app after it doesn't count.
      durationMin: Math.round(((a.lastSetAt > a.startedAt ? a.lastSetAt : now()) - a.startedAt) / 60000),
      entries: a.entries.filter(e => !e.skipped && e.sets.length).map(e => ({
        exId: e.exId, name: e.name, ...(e.muscles?.length ? { muscles: e.muscles } : {}),
        sets: e.sets.map(({ w, r, done }) => ({ w: Number(w) || 0, r: Number(r) || 0, done }))
      })),
      updatedAt: now()
    }
    set({ sessions: [...get().sessions, session], active: null })
  },

  discardWorkout() { set({ active: null }) },

  /** Mark the workout in progress as current again (after "Keep going"). */
  touchWorkout() { const a = get().active; if (a) set({ active: { ...a, touchedAt: now() } }) },

  /** Fix a logged workout: date, deload flag and its sets. Next targets follow immediately. */
  updateSession(id, { date, deload, entries }) {
    set({
      sessions: get().sessions.map(x => (x.id !== id || x.deleted ? x : touch({
        ...x, date, deload: !!deload,
        entries: entries.map(e => ({ ...e, sets: e.sets.map(({ w, r, done }) => ({ w: Number(w) || 0, r: Number(r) || 0, done: !!done })) }))
      })))
    })
  },

  deleteSession(id) {
    set({ sessions: get().sessions.map(s => (s.id === id ? { id, deleted: true, updatedAt: now() } : s)) })
  },

  logRun(run) {
    const runs = get().runs
    const rec = touch({ id: run.id || uid(), date: run.date || todayISO(), planId: run.planId, name: run.name, km: run.km ?? null, minutes: run.minutes ?? null, notes: run.notes || '' })
    set({ runs: runs.some(r => r.id === rec.id) ? runs.map(r => (r.id === rec.id ? rec : r)) : [...runs, rec] })
  },

  deleteRun(id) { set({ runs: get().runs.map(r => (r.id === id ? { id, deleted: true, updatedAt: now() } : r)) }) },

  addWeight(weight, date = todayISO()) {
    // One reading per day: a second entry replaces the first.
    const bw = get().bodyweight
    const same = bw.find(e => e.date === date && !e.deleted)
    const rec = touch({ id: same?.id || uid(), date, weight })
    set({ bodyweight: same ? bw.map(e => (e.id === same.id ? rec : e)) : [...bw, rec] })
  },

  deleteWeight(id) { set({ bodyweight: get().bodyweight.map(e => (e.id === id ? { id, deleted: true, updatedAt: now() } : e)) }) },

  /** Move logged history to new exercise names: { oldName: newName }. */
  renameHistory(renames) {
    const to = Object.fromEntries(Object.entries(renames).map(([a, b]) => [exKey(a), b]))
    const fix = entries => entries.map(e => (to[exKey(e.name)] ? { ...e, name: to[exKey(e.name)] } : e))
    const S = get()
    set({
      sessions: S.sessions.map(s => (s.deleted || !s.entries?.some(e => to[exKey(e.name)]) ? s : { ...s, entries: fix(s.entries), updatedAt: now() })),
      active: S.active ? { ...S.active, entries: fix(S.active.entries) } : S.active
    })
  },

  /** Replace the synced part with a merged/imported document. */
  applyDoc(doc) {
    set({
      program: doc.program?.deleted ? null : doc.program ?? null,
      programClearedAt: doc.program?.deleted ? doc.program.updatedAt : get().programClearedAt,
      resetAt: doc.resetAt ?? get().resetAt,
      sessions: doc.sessions || [],
      runs: doc.runs || [],
      bodyweight: doc.bodyweight || [],
      settings: doc.settings || get().settings
    })
  },

  /** Switch units and convert every logged and planned weight to them. Runs (km) are untouched. */
  convertUnits(to) {
    const S = get()
    if (unitOf(S) === to) return
    const cw = w => convertWeight(w, to)
    const sets = list => list.map(x => ({ ...x, w: cw(x.w) }))
    set({
      sessions: S.sessions.map(s => (s.deleted ? s : touch({ ...s, entries: s.entries.map(e => ({ ...e, sets: sets(e.sets) })) }))),
      bodyweight: S.bodyweight.map(b => (b.deleted ? b : touch({ ...b, weight: cw(b.weight) }))),
      program: S.program && touch({
        ...S.program, unit: to,
        days: S.program.days.map(d => ({ ...d, exercises: d.exercises.map(e => ({ ...e, startWeight: cw(e.startWeight), increment: convertStep(e.increment, to) })) }))
      }),
      active: S.active && {
        ...S.active,
        entries: S.active.entries.map(e => ({ ...e, sets: sets(e.sets), target: e.target && { ...e.target, weight: cw(e.target.weight) } }))
      },
      settings: touch({ ...S.settings, unit: to })
    })
  },

  /** Remove the program; logged workouts, runs and bodyweight stay. */
  clearProgram() { set({ program: null, programClearedAt: now(), active: null }) },

  resetAll() { set({ program: null, sessions: [], runs: [], bodyweight: [], settings: { unit: 'lb', blockStart: null, updatedAt: now() }, active: null }) }
}), { name: 'overload_v1', version: 1 }))
