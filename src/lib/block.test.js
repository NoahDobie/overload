import { describe, it, expect } from 'vitest'
import { blockPosition, startDeloadNow, restartNextMonday, deloadTarget, runTarget } from './block.js'

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

  it('scales run targets by 0.7 and swaps quality for strides', () => {
    const rt = { long: { miles: 10 }, quality: { miles: 5, notes: '6x800' } }
    expect(runTarget(rt, 'long', false)).toMatchObject({ miles: 10 })
    expect(runTarget(rt, 'long', true)).toMatchObject({ miles: 7 })
    expect(runTarget(rt, 'quality', true).notes).toMatch(/strides/)
    expect(runTarget({}, 'easy', false)).toBeNull()
  })
})
