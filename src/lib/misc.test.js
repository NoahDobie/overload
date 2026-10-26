import { describe, it, expect } from 'vitest'
import { nextDayIndex, dayNumber } from './rotation.js'
import { runsForWeek, weekStart, normalizeRuns, programRuns, runKm, runName, runTarget, keepRunIds, MAX_RUNS } from './runs.js'
import { avg7, weeklyChange } from './bodyweight.js'
import { mergeDocs, syncedPart, applyReset } from './merge.js'
import { muscleLoad, levelsOf, normalizeMuscle } from './muscles.js'

const days = ['A1', 'A2', 'A3', 'A4', 'A5', 'B1', 'B2', 'B3', 'B4', 'B5'].map(id => ({ id, week: id[0], name: id, exercises: [] }))

describe('rotation', () => {
  it('starts at day 0 and follows the last logged day, wrapping', () => {
    expect(nextDayIndex(days, [])).toBe(0)
    expect(nextDayIndex(days, [{ id: 1, date: '2026-10-01', dayId: 'A3' }])).toBe(3)
    expect(nextDayIndex(days, [{ id: 1, date: '2026-10-01', dayId: 'B5' }])).toBe(0)
  })
  it('uses the most recent session, not the order in the array', () => {
    const s = [{ id: 2, date: '2026-10-05', dayId: 'B1' }, { id: 1, date: '2026-10-01', dayId: 'A1' }]
    expect(nextDayIndex(days, s)).toBe(6)
  })
  it('ignores deleted sessions and unknown days', () => {
    const s = [{ id: 1, date: '2026-10-01', dayId: 'A1' }, { id: 2, date: '2026-10-02', dayId: 'A2', deleted: true }, { id: 3, date: '2026-10-03', dayId: 'ZZ' }]
    expect(nextDayIndex(days, s)).toBe(1)
  })
  it('numbers days within their week', () => {
    expect(dayNumber(days, 7)).toBe(3)
  })
})

describe('runs', () => {
  it('buckets Monday to Sunday', () => {
    expect(weekStart('2026-11-01')).toBe('2026-10-26')   // Sunday → previous Monday
    const { plan } = programRuns({})
    const runs = [
      { id: 1, date: '2026-10-26', type: 'easy', miles: 4 },                 // old record
      { id: 2, date: '2026-11-01', planId: 'long', km: 12 },
      { id: 3, date: '2026-11-02', planId: 'quality', km: 8 },               // next week
      { id: 4, date: '2026-10-28', planId: 'quality', km: 8, deleted: true },
      { id: 5, date: '2026-10-29', planId: 'gone', km: 3 }                   // no longer planned
    ]
    const w = runsForWeek(runs, '2026-10-29', plan)
    expect(w.count).toBe(2)
    expect(w.done.quality).toBeUndefined()
    expect(w.done.easy.id).toBe(1)
    expect(w.km).toBe(21.4)                                                  // 6.4 + 12 + 3
  })

  it('normalizes run plans and converts the old miles targets', () => {
    expect(programRuns({}).plan.map(p => p.id)).toEqual(['easy', 'quality', 'long'])
    const old = programRuns({ runTargets: { long: { miles: 8, notes: 'easy pace' } } })
    expect(old.plan[2]).toEqual({ id: 'long', name: 'Long', km: 12.9, notes: 'easy pace' })
    const r = normalizeRuns({ enabled: false, plan: Array.from({ length: 9 }, (_, i) => ({ name: i ? '' : 'Tempo', km: i === 1 ? '5.5' : '' })) })
    expect(r.enabled).toBe(false)
    expect(r.plan).toHaveLength(MAX_RUNS)
    expect(r.plan.slice(0, 2).map(p => [p.name, p.km])).toEqual([['Tempo', null], ['Run 2', 5.5]])
    expect(new Set(r.plan.map(p => p.id)).size).toBe(MAX_RUNS)
  })

  it('ids come from names, and re-imports keep the current ids', () => {
    expect(normalizeRuns({ plan: [{ name: 'Easy' }, { name: 'Easy' }] }).plan[0].id).toBe('easy')
    const current = { enabled: true, plan: [{ id: 'abc123', name: 'Tempo', km: 8, notes: '' }] }
    const next = normalizeRuns({ plan: [{ name: 'tempo ', km: 9 }, { name: 'Long', km: 14 }] })
    expect(keepRunIds(next, current).plan.map(p => p.id)).toEqual(['abc123', 'long'])
    expect(keepRunIds(undefined, current)).toBeUndefined()
  })

  it('names, distances and deload targets', () => {
    expect(runKm({ km: 5 })).toBe(5)
    expect(runKm({ miles: 5 })).toBe(8)
    expect(runKm({})).toBeNull()
    expect(runName({ type: 'long' })).toBe('Long')
    expect(runName({ planId: 'x', name: 'Hill reps' })).toBe('Hill reps')
    expect(runTarget({ km: 10, notes: 'z2' }, true)).toEqual({ km: 7, notes: 'z2' })
    expect(runTarget({ km: null, notes: '' }, false)).toEqual({ km: null, notes: '' })
  })
})

describe('bodyweight', () => {
  it('averages the last 7 days and compares to the week before', () => {
    const e = [
      { id: 1, date: '2026-10-20', weight: 182 },
      { id: 2, date: '2026-10-25', weight: 180 },
      { id: 3, date: '2026-10-26', weight: 179 },
      { id: 4, date: '2026-10-18', weight: 184 }
    ]
    expect(avg7(e, '2026-10-26')).toBeCloseTo((182 + 180 + 179) / 3)
    expect(weeklyChange(e, '2026-10-26')).toBeCloseTo((182 + 180 + 179) / 3 - 184)
  })
})

describe('merge', () => {
  it('unions records by id, newest wins, tombstones stick', () => {
    const local = {
      sessions: [{ id: 'a', updatedAt: 5, v: 'local' }, { id: 'b', updatedAt: 9, deleted: true }],
      program: { name: 'L', updatedAt: 1 }, settings: { updatedAt: 3, unit: 'lb' }
    }
    const remote = {
      sessions: [{ id: 'a', updatedAt: 7, v: 'remote' }, { id: 'b', updatedAt: 2 }, { id: 'c', updatedAt: 1 }],
      program: { name: 'R', updatedAt: 2 }, settings: { updatedAt: 1, unit: 'kg' }
    }
    const m = mergeDocs(local, remote)
    const by = Object.fromEntries(m.sessions.map(s => [s.id, s]))
    expect(by.a.v).toBe('remote')
    expect(by.b.deleted).toBe(true)
    expect(by.c).toBeTruthy()
    expect(m.program.name).toBe('R')
    expect(m.settings.unit).toBe('lb')
  })
})

describe('muscles', () => {
  it('normalizes aliases', () => {
    expect(normalizeMuscle('Quads')).toBe('quadriceps')
    expect(normalizeMuscle('rear delts')).toBe('deltoids')
    expect(normalizeMuscle('upper back')).toBe('upper-back')
    expect(normalizeMuscle('pinky')).toBeNull()
  })
  it('counts primary sets fully and secondaries at half', () => {
    const program = { days: [{ exercises: [{ name: 'Bench', muscles: ['chest', 'triceps'] }] }] }
    const sessions = [{ id: 1, date: '2026-10-26', entries: [{ name: 'Bench', sets: [{ done: true }, { done: true }, { done: false }] }] }]
    const load = muscleLoad(sessions, program, '2026-10-20')
    expect(load).toEqual({ chest: 2, triceps: 1 })
    expect(levelsOf(load).chest).toBe(4)
    expect(levelsOf(load).triceps).toBe(2)
  })
})

describe('clearing and resetting', () => {
  const prog = (t, name = 'P') => ({ name, days: [], updatedAt: t })

  it('a cleared program syncs as a tombstone and beats older copies', () => {
    const phone = syncedPart({ program: null, programClearedAt: 200, sessions: [], runs: [], bodyweight: [], settings: null })
    expect(phone.program).toEqual({ deleted: true, updatedAt: 200 })
    const server = { program: prog(100), sessions: [], runs: [], bodyweight: [] }
    expect(mergeDocs(phone, server).program).toEqual({ deleted: true, updatedAt: 200 })
    // a program set after the clear wins over the tombstone
    expect(mergeDocs(phone, { ...server, program: prog(300, 'New') }).program.name).toBe('New')
  })

  it('an account reset wipes older data from a device that missed it, keeping newer entries', () => {
    const offlineLaptop = {
      resetAt: 0, program: prog(50), settings: { unit: 'kg', updatedAt: 50 },
      sessions: [{ id: 'old', updatedAt: 90 }, { id: 'new', updatedAt: 1500 }],
      runs: [{ id: 'r', updatedAt: 10 }], bodyweight: []
    }
    const server = { resetAt: 1000, program: { deleted: true, updatedAt: 1000 }, settings: { unit: 'lb', blockStart: null, updatedAt: 1000 }, sessions: [], runs: [], bodyweight: [] }
    const m = mergeDocs(offlineLaptop, server)
    expect(m.resetAt).toBe(1000)
    expect(m.sessions.map(s => s.id)).toEqual(['new'])          // logged after the reset: kept
    expect(m.runs).toEqual([])
    expect(m.program.deleted).toBe(true)
    expect(m.settings.unit).toBe('lb')
    // once both sides know the reset, nothing more is filtered
    expect(mergeDocs({ ...m }, server).sessions.map(s => s.id)).toEqual(['new'])
  })

  it('applyReset keeps only what changed after the reset', () => {
    const d = applyReset({ sessions: [{ id: 1, updatedAt: 5 }, { id: 2 }], runs: [], bodyweight: [], program: prog(20), settings: { updatedAt: 1 } }, 10)
    expect(d.sessions).toEqual([])
    expect(d.program).toEqual(prog(20))
    expect(d.settings.updatedAt).toBe(0)
  })
})
