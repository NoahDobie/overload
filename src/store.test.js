import { describe, it, expect, beforeEach, vi } from 'vitest'

// zustand's persist middleware wants localStorage
globalThis.localStorage ??= { _m: new Map(), getItem(k) { return this._m.get(k) ?? null }, setItem(k, v) { this._m.set(k, String(v)) }, removeItem(k) { this._m.delete(k) } }
const { useStore, isStale, lastActivity, STALE_WORKOUT_MS } = await import('./store.js')

describe('renameHistory', () => {
  beforeEach(() => useStore.getState().resetAll())

  it('moves logged sets to the new name and marks sessions changed for sync', () => {
    useStore.setState({
      sessions: [
        { id: 's1', date: '2026-10-01', updatedAt: 1, entries: [{ name: 'Flat Bench', sets: [{ w: 135, r: 8, done: true }] }, { name: 'Squat', sets: [] }] },
        { id: 's2', date: '2026-10-03', updatedAt: 1, entries: [{ name: 'Squat', sets: [] }] },
        { id: 's3', deleted: true, updatedAt: 1 }
      ]
    })
    useStore.getState().renameHistory({ 'flat bench': 'Barbell Bench Press' })
    const [s1, s2, s3] = useStore.getState().sessions
    expect(s1.entries.map(e => e.name)).toEqual(['Barbell Bench Press', 'Squat'])
    expect(s1.updatedAt).toBeGreaterThan(1)
    expect(s2).toEqual({ id: 's2', date: '2026-10-03', updatedAt: 1, entries: [{ name: 'Squat', sets: [] }] })
    expect(s3.deleted).toBe(true)
  })
})

describe('workout in progress', () => {
  const program = { name: 'P', days: [{ id: 'A1', week: 'A', name: 'Push', exercises: [{ id: 'bench', name: 'Bench', sets: 2, repMin: 5, repMax: 8, rir: 2, increment: 5, startWeight: 100, muscles: [] }] }] }
  beforeEach(() => { useStore.getState().resetAll(); useStore.getState().setProgram(program) })

  it('times the session to the last ticked set, not to Finish', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-26T18:00:00'))
    useStore.getState().startWorkout('A1')
    vi.setSystemTime(new Date('2026-10-26T18:40:00'))
    useStore.getState().updateSet(0, 0, { done: true })
    vi.setSystemTime(new Date('2026-10-26T18:50:00'))
    useStore.getState().updateSet(0, 1, { r: 6 })             // an edit, not a tick
    vi.setSystemTime(new Date('2026-10-26T21:00:00'))          // came back hours later
    useStore.getState().finishWorkout()
    const s = useStore.getState().sessions[0]
    expect(s.durationMin).toBe(40)
    expect(s.date).toBe('2026-10-26')
    vi.useRealTimers()
  })

  it('goes stale four hours after the last change', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-26T18:00:00'))
    useStore.getState().startWorkout('A1')
    vi.setSystemTime(new Date('2026-10-26T19:00:00'))
    useStore.getState().addSet(0)
    const a = useStore.getState().active
    expect(lastActivity(a)).toBe(new Date('2026-10-26T19:00:00').getTime())
    expect(isStale(a, new Date('2026-10-26T22:59:00').getTime())).toBe(false)
    expect(isStale(a, new Date('2026-10-26T19:00:00').getTime() + STALE_WORKOUT_MS + 1)).toBe(true)
    vi.setSystemTime(new Date('2026-10-27T08:00:00'))
    useStore.getState().touchWorkout()                          // "Keep going"
    expect(isStale(useStore.getState().active)).toBe(false)
    vi.useRealTimers()
  })
})

describe('clearProgram', () => {
  it('removes the program and workout in progress, keeps history', () => {
    useStore.getState().resetAll()
    useStore.getState().setProgram({ name: 'P', days: [{ id: 'A1', week: 'A', name: 'Push', exercises: [{ id: 'b', name: 'Bench', sets: 1, repMin: 5, repMax: 8, rir: 2, increment: 5, startWeight: 100, muscles: [] }] }] })
    useStore.setState({ sessions: [{ id: 's', date: '2026-10-01', updatedAt: 1, entries: [] }] })
    useStore.getState().startWorkout('A1')
    useStore.getState().clearProgram()
    const S = useStore.getState()
    expect(S.program).toBeNull()
    expect(S.active).toBeNull()
    expect(S.programClearedAt).toBeGreaterThan(0)
    expect(S.sessions).toHaveLength(1)
  })
})
