import { describe, it, expect } from 'vitest'
import { nextDayIndex, dayNumber } from './rotation.js'
import { runsForWeek, weekStart } from './runs.js'
import { avg7, weeklyChange } from './bodyweight.js'
import { mergeDocs } from './merge.js'
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
    const runs = [
      { id: 1, date: '2026-10-26', type: 'easy' },
      { id: 2, date: '2026-11-01', type: 'long' },
      { id: 3, date: '2026-11-02', type: 'quality' },
      { id: 4, date: '2026-10-28', type: 'quality', deleted: true }
    ]
    const w = runsForWeek(runs, '2026-10-29')
    expect(w.count).toBe(2)
    expect(w.quality).toBeNull()
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
