import { describe, it, expect } from 'vitest'
import { blockPosition, startDeloadNow, restartNextMonday, deloadTarget, normalizeBlock } from './block.js'

const start = '2026-10-26'   // a Monday

describe('blockPosition', () => {
  it('walks 3 build weeks then a deload (3:1)', () => {
    const b = { build: 3, deload: 1 }
    expect(blockPosition(b, start, '2026-10-26')).toMatchObject({ block: 1, week: 1, isDeload: false })
    expect(blockPosition(b, start, '2026-11-08')).toMatchObject({ block: 1, week: 2, isDeload: false }) // Sunday
    expect(blockPosition(b, start, '2026-11-16')).toMatchObject({ block: 1, week: 4, isDeload: true })
    expect(blockPosition(b, start, '2026-11-23')).toMatchObject({ block: 2, week: 1, isDeload: false })
  })

  it('supports 4:1', () => {
    const b = { build: 4, deload: 1 }
    expect(blockPosition(b, start, '2026-11-16').isDeload).toBe(false)
    expect(blockPosition(b, start, '2026-11-23')).toMatchObject({ week: 5, length: 5, isDeload: true })
  })

  it('treats a mid-week blockStart as its Monday', () => {
    expect(blockPosition({ build: 3, deload: 1 }, '2026-10-29', '2026-10-26').week).toBe(1)
  })

  it('is off when disabled', () => {
    expect(blockPosition({ enabled: false }, start, '2026-11-16').enabled).toBe(false)
  })

  it('"start deload now" makes this week the deload', () => {
    const b = { build: 3, deload: 1 }
    const s = startDeloadNow(b, '2026-11-04')
    expect(blockPosition(b, s, '2026-11-04').isDeload).toBe(true)
    expect(blockPosition(b, s, '2026-11-09')).toMatchObject({ week: 1, isDeload: false })
  })

  it('"restart next Monday" starts week 1 next week', () => {
    const s = restartNextMonday('2026-11-18')
    expect(s).toBe('2026-11-23')
  })
})

describe('deload prescriptions', () => {
  const ex = { name: 'Bench', sets: 3, repMin: 8, repMax: 10, rir: 2 }
  it('halves sets (rounded up), holds weight, adds RIR', () => {
    const t = deloadTarget(ex, { weight: 140, reps: [8, 8, 8], kind: 'up', last: { sets: [{ w: 135, r: 10 }] } })
    expect(t).toMatchObject({ weight: 135, reps: [8, 8], rir: 4, kind: 'block-deload' })
  })
})

describe('deload settings', () => {
  const ex = { name: 'Bench', sets: 3, repMin: 8, repMax: 10, rir: 2, increment: 5 }
  const target = { weight: 140, reps: [8, 8, 8], kind: 'up', last: { sets: [{ w: 135, r: 10 }] } }

  it('cuts the weight to the nearest increment when asked', () => {
    const t = deloadTarget(ex, target, { build: 3, deload: 1, liftDeload: { setsFactor: 1, rirAdd: 1, weightFactor: 0.9 } })
    expect(t).toMatchObject({ weight: 120, reps: [8, 8, 8], rir: 3 })
    expect(t.reason).toMatch(/90% weight/)
  })

  it('keeps knobs in range and fills missing ones with the defaults', () => {
    const b = normalizeBlock({ build: 3, liftDeload: { setsFactor: 5, rirAdd: -1 }, runDeloadFactor: 'x' })
    expect(b.liftDeload).toEqual({ setsFactor: 1, rirAdd: 0, weightFactor: 1 })
    expect(b.runDeloadFactor).toBe(0.7)
  })

  it('keeps the deload knobs while blocks are off', () => {
    expect(normalizeBlock({ enabled: false, liftDeload: { rirAdd: 3 } })).toMatchObject({ enabled: false, liftDeload: { rirAdd: 3 } })
  })

  it('runs a two-week deload', () => {
    const b = { build: 3, deload: 2 }
    expect(blockPosition(b, start, '2026-11-16')).toMatchObject({ week: 4, length: 5, isDeload: true })
    expect(blockPosition(b, start, '2026-11-23')).toMatchObject({ week: 5, isDeload: true })
    expect(blockPosition(b, start, '2026-11-30')).toMatchObject({ block: 2, week: 1, isDeload: false })
  })
})
