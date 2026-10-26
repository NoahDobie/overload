// The whole app state: one Zustand store persisted to localStorage, the same pattern as
// openGym's store/useStore.js. `active` (the workout in progress) is device-local; the rest
// syncs (see lib/sync.js).

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { uid, todayISO } from './lib/util.js'
import { historyFor, nextTarget } from './lib/progression.js'
import { blockPosition, deloadTarget, restartThisWeek } from './lib/block.js'

const now = () => Date.now()

export const unitOf = S => S.settings?.unit || S.program?.unit || 'lb'

export const blockOf = (S, iso = todayISO()) => blockPosition(S.program?.block, S.settings?.blockStart, iso)

/** Target for one exercise today, deload-adjusted when the block says so. */
export function targetFor(S, ex, isDeload) {
  const t = nextTarget(ex, historyFor(S.sessions, ex.name), unitOf(S))
  return isDeload ? deloadTarget(ex, t, S.program?.block) : t
}

const touch = x => ({ ...x, updatedAt: now() })

export const useStore = create(persist((set, get) => ({
  program: null,
  sessions: [],
  runs: [],
  bodyweight: [],
  settings: { unit: 'lb', blockStart: null, updatedAt: 0 },
  active: null,

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
    set({ active: { ...a, entries } })
  },

  addSet(ei) {
    const a = get().active
    if (!a) return
    const entries = a.entries.map((e, i) => {
      if (i !== ei) return e
      const last = e.sets[e.sets.length - 1] || { w: e.target.weight, r: e.target.reps[0] }
      return { ...e, sets: [...e.sets, { w: last.w, r: last.r, done: false }] }
    })
    set({ active: { ...a, entries } })
  },

  removeSet(ei) {
    const a = get().active
    if (!a) return
    set({ active: { ...a, entries: a.entries.map((e, i) => (i === ei && e.sets.length > 1 ? { ...e, sets: e.sets.slice(0, -1) } : e)) } })
  },

  setActiveDeload(deload) {
    const S = get()
    const a = S.active
    if (!a) return
    const day = S.program?.days.find(d => d.id === a.dayId)
    if (!day) return
    // Re-prescribe sets that have not been touched yet.
    const entries = a.entries.map(e => {
      const ex = day.exercises.find(x => x.id === e.exId)
      if (!ex || e.sets.some(s => s.done)) return e
      const target = targetFor(S, ex, deload)
      return { ...e, target, sets: target.reps.map(r => ({ w: target.weight, r, done: false })) }
    })
    set({ active: { ...a, deload, entries } })
  },

  finishWorkout() {
    const a = get().active
    if (!a) return
    const session = {
      id: a.id, dayId: a.dayId, date: a.date, deload: !!a.deload,
      durationMin: Math.round((now() - a.startedAt) / 60000),
      entries: a.entries.map(e => ({ exId: e.exId, name: e.name, sets: e.sets.map(({ w, r, done }) => ({ w: Number(w) || 0, r: Number(r) || 0, done })) })),
      updatedAt: now()
    }
    set({ sessions: [...get().sessions, session], active: null })
  },

  discardWorkout() { set({ active: null }) },

  deleteSession(id) {
    set({ sessions: get().sessions.map(s => (s.id === id ? { id, deleted: true, updatedAt: now() } : s)) })
  },

  logRun(run) {
    const runs = get().runs
    const rec = touch({ id: run.id || uid(), date: run.date || todayISO(), type: run.type, miles: run.miles ?? null, minutes: run.minutes ?? null, notes: run.notes || '' })
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

  /** Replace the synced part with a merged/imported document. */
  applyDoc(doc) {
    set({
      program: doc.program ?? null,
      sessions: doc.sessions || [],
      runs: doc.runs || [],
      bodyweight: doc.bodyweight || [],
      settings: doc.settings || get().settings
    })
  },

  resetAll() { set({ program: null, sessions: [], runs: [], bodyweight: [], settings: { unit: 'lb', blockStart: null, updatedAt: now() }, active: null }) }
}), { name: 'overload_v1', version: 1 }))
