import { describe, it, expect } from 'vitest'
import { nextTarget, historyFor } from './progression.js'

const ex = { name: 'Bench', sets: 3, repMin: 8, repMax: 10, rir: 2, increment: 5, startWeight: 135, hitsToProgress: 1 }
const sess = (date, w, reps, extra = {}) => ({
  id: date, date, updatedAt: 1, ...extra,
  entries: [{ name: 'Bench', sets: reps.map(r => ({ w, r, done: true })) }]
})

describe('nextTarget', () => {
  it('starts from the program with no history', () => {
    const t = nextTarget(ex, [])
    expect(t).toMatchObject({ weight: 135, reps: [8, 8, 8], kind: 'start' })
  })

  it('adds the increment after hitting the top of the range on every set', () => {
    const t = nextTarget(ex, historyFor([sess('2026-10-01', 135, [10, 10, 10])], 'Bench'))
    expect(t).toMatchObject({ weight: 140, reps: [8, 8, 8], kind: 'up' })
    expect(t.reason).toContain('+5 lb')
  })

  it('holds and aims for one more rep per set otherwise', () => {
    const t = nextTarget(ex, historyFor([sess('2026-10-01', 135, [10, 9, 8])], 'Bench'))
    expect(t).toMatchObject({ weight: 135, reps: [10, 10, 9], kind: 'hold' })
  })

  it('does not progress when fewer sets were done than prescribed', () => {
    const t = nextTarget(ex, historyFor([sess('2026-10-01', 135, [10, 10])], 'Bench'))
    expect(t.kind).toBe('hold')
  })

  it('ignores unchecked sets', () => {
    const s = sess('2026-10-01', 135, [10, 10, 10])
    s.entries[0].sets[2].done = false
    expect(nextTarget(ex, historyFor([s], 'Bench')).kind).toBe('hold')
  })

  it('needs hitsToProgress sessions in a row', () => {
    const e2 = { ...ex, hitsToProgress: 2 }
    const one = historyFor([sess('2026-10-01', 135, [10, 10, 10])], 'Bench')
    expect(nextTarget(e2, one).kind).toBe('hold')
    const two = historyFor([sess('2026-10-01', 135, [10, 10, 10]), sess('2026-10-04', 135, [10, 10, 10])], 'Bench')
    expect(nextTarget(e2, two)).toMatchObject({ kind: 'up', weight: 140 })
  })

  it('deloads 10% after two sessions under repMin at the same weight', () => {
    const h = historyFor([sess('2026-10-01', 200, [7, 6, 6]), sess('2026-10-04', 200, [7, 6, 5])], 'Bench')
    expect(nextTarget(ex, h)).toMatchObject({ kind: 'deload', weight: 180 })
  })

  it('progresses reps only for bodyweight exercises', () => {
    const bw = { ...ex, increment: 0, startWeight: 0 }
    const t = nextTarget(bw, historyFor([sess('2026-10-01', 0, [10, 10, 10])], 'Bench'))
    expect(t).toMatchObject({ kind: 'reps', weight: 0, reps: [11, 11, 11] })
  })

  it('skips planned deload sessions', () => {
    const h = historyFor([
      sess('2026-10-01', 135, [10, 10, 10]),
      sess('2026-10-08', 135, [8], { deload: true })
    ], 'Bench')
    expect(h).toHaveLength(1)
    expect(nextTarget(ex, h)).toMatchObject({ kind: 'up', weight: 140 })
  })

  it('matches exercise names case- and space-insensitively and skips deleted sessions', () => {
    const s = sess('2026-10-01', 135, [10, 10, 10]); s.entries[0].name = '  bench '
    const gone = { ...sess('2026-10-02', 300, [1]), deleted: true }
    expect(historyFor([s, gone], 'Bench')).toHaveLength(1)
  })
})
