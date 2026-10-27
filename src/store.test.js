import { describe, it, expect, beforeEach, vi } from 'vitest'

// zustand's persist middleware wants localStorage
globalThis.localStorage ??= { _m: new Map(), getItem(k) { return this._m.get(k) ?? null }, setItem(k, v) { this._m.set(k, String(v)) }, removeItem(k) { this._m.delete(k) } }
const { useStore, isStale, lastActivity, STALE_WORKOUT_MS, convertWeight, convertStep, hasWeights } = await import('./store.js')

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

describe('updateSession', () => {
  it('fixes a typo, keeps the session, and the next target follows', async () => {
    const { targetFor } = await import('./store.js')
    useStore.getState().resetAll()
    const ex = { id: 'b', name: 'Bench', sets: 1, repMin: 3, repMax: 5, rir: 1, increment: 5, startWeight: 0, muscles: [] }
    useStore.getState().setProgram({ name: 'P', days: [{ id: 'A1', week: 'A', name: 'Push', exercises: [ex] }] })
    useStore.setState({ sessions: [{ id: 's1', dayId: 'A1', date: '2026-10-25', updatedAt: 1, entries: [{ exId: 'b', name: 'Bench', sets: [{ w: 2500, r: 5, done: true }] }] }] })
    expect(targetFor(useStore.getState(), ex, false).weight).toBe(2505)
    const s = useStore.getState().sessions[0]
    useStore.getState().updateSession('s1', { ...s, date: '2026-10-24', entries: [{ ...s.entries[0], sets: [{ w: '250', r: '5', done: true }] }] })
    const after = useStore.getState().sessions[0]
    expect(after).toMatchObject({ id: 's1', date: '2026-10-24', deload: false })
    expect(after.entries[0].sets[0]).toEqual({ w: 250, r: 5, done: true })
    expect(after.updatedAt).toBeGreaterThan(1)
    expect(targetFor(useStore.getState(), ex, false).weight).toBe(255)
  })
})

describe('convertUnits', () => {
  it('converts weights and maps increments to plate steps', () => {
    expect(convertWeight(225, 'kg')).toBe(102.1)
    expect(convertWeight(100, 'lb')).toBe(220.5)
    expect(convertWeight(0, 'kg')).toBe(0)
    expect([2.5, 5, 10, 7].map(s => convertStep(s, 'kg'))).toEqual([1.25, 2.5, 5, 3])
    expect([1.25, 2.5, 5, 0].map(s => convertStep(s, 'lb'))).toEqual([2.5, 5, 10, 0])
  })

  it('converts sessions, bodyweight, program and the workout in progress', () => {
    useStore.getState().resetAll()
    useStore.getState().setProgram({ name: 'P', unit: 'lb', days: [{ id: 'A1', week: 'A', name: 'Push', exercises: [{ id: 'b', name: 'Bench', sets: 1, repMin: 3, repMax: 5, rir: 1, increment: 5, startWeight: 250, muscles: [] }] }] })
    useStore.setState({
      sessions: [{ id: 's1', dayId: 'A1', date: '2026-10-25', updatedAt: 1, entries: [{ exId: 'b', name: 'Bench', sets: [{ w: 225, r: 5, done: true }] }] }],
      bodyweight: [{ id: 'w', date: '2026-10-25', weight: 180, updatedAt: 1 }],
      runs: [{ id: 'r', date: '2026-10-25', planId: 'easy', km: 6, updatedAt: 1 }]
    })
    useStore.getState().startWorkout('A1')
    expect(hasWeights(useStore.getState())).toBe(true)
    useStore.getState().convertUnits('kg')
    const S = useStore.getState()
    expect(S.settings.unit).toBe('kg')
    expect(S.program.unit).toBe('kg')
    expect(S.sessions[0].entries[0].sets[0].w).toBe(102.1)
    expect(S.sessions[0].updatedAt).toBeGreaterThan(1)
    expect(S.bodyweight[0].weight).toBe(81.6)
    expect(S.runs[0].km).toBe(6)
    expect(S.program.days[0].exercises[0]).toMatchObject({ startWeight: 113.4, increment: 2.5 })
    // in progress: last 225 × 5 hit the top of 3-5, so the target was 230 lb
    expect(S.active.entries[0].target.weight).toBe(104.3)
    expect(S.active.entries[0].sets[0].w).toBe(104.3)
    // and back again lands close to where it started
    useStore.getState().convertUnits('lb')
    expect(useStore.getState().sessions[0].entries[0].sets[0].w).toBe(225.1)
    expect(useStore.getState().program.days[0].exercises[0].increment).toBe(5)
  })
})

describe('changing a workout in progress', () => {
  const bench = { id: 'bench', name: 'Bench', sets: 2, repMin: 5, repMax: 8, rir: 2, increment: 5, startWeight: 100, muscles: ['chest'] }
  const row = { id: 'row', name: 'Row', sets: 3, repMin: 8, repMax: 10, rir: 1, increment: 5, startWeight: 80, muscles: ['lats'] }
  const program = { name: 'P', days: [
    { id: 'A1', week: 'A', name: 'Push', exercises: [bench] },
    { id: 'A2', week: 'A', name: 'Pull', exercises: [row] }
  ] }
  beforeEach(() => { useStore.getState().resetAll(); useStore.getState().setProgram(program); useStore.getState().startWorkout('A1') })

  it('adds an exercise from elsewhere in the program with its own prescription', () => {
    useStore.getState().addEntry({ name: 'row', muscles: [] })
    const e = useStore.getState().active.entries[1]
    expect(e).toMatchObject({ name: 'Row', muscles: ['lats'], adhoc: { sets: 3, repMin: 8 } })
    expect(e.sets).toEqual([{ w: 80, r: 8, done: false }, { w: 80, r: 8, done: false }, { w: 80, r: 8, done: false }])
  })

  it('adds a new exercise for today only, following its logged history', () => {
    useStore.setState({ sessions: [{ id: 's0', dayId: 'A1', date: '2026-10-20', updatedAt: 1, entries: [{ exId: 'x-1', name: 'Dips', sets: [{ w: 20, r: 9, done: true }] }] }] })
    useStore.getState().addEntry({ name: 'Dips', muscles: ['chest', 'triceps'], equipment: 'weighted' })
    useStore.getState().updateSet(1, 0, { done: true })
    useStore.getState().finishWorkout()
    const S = useStore.getState()
    expect(S.program.days[0].exercises).toHaveLength(1)
    const dips = S.sessions[1].entries.find(e => e.name === 'Dips')
    expect(dips).toMatchObject({ muscles: ['chest', 'triceps'], sets: [{ w: 20, r: 10, done: true }, { w: 20, r: 8, done: false }, { w: 20, r: 8, done: false }] })
  })

  it('leaves skipped and removed exercises out of the saved session', () => {
    useStore.getState().addEntry({ name: 'Fly', muscles: [] })
    useStore.getState().removeEntry(1)
    useStore.getState().addEntry({ name: 'Curl', muscles: [] })
    useStore.getState().updateSet(1, 0, { done: true })
    useStore.getState().skipEntry(0)
    useStore.getState().finishWorkout()
    expect(useStore.getState().sessions[0].entries.map(e => e.name)).toEqual(['Curl'])
  })

  it('re-prescribes an added exercise for a deload session', () => {
    useStore.getState().addEntry({ name: 'Row', muscles: [] })
    useStore.getState().setActiveDeload(true)
    expect(useStore.getState().active.entries[1].sets).toHaveLength(2)
  })
})

describe('setRuns', () => {
  it('switches runs on with one easy run when none are planned', () => {
    useStore.getState().resetAll()
    useStore.getState().setProgram({ name: 'P', runs: { enabled: false, plan: [] }, days: [] })
    useStore.getState().setRuns({ enabled: true })
    expect(useStore.getState().program.runs).toMatchObject({ enabled: true, plan: [{ name: 'Easy' }] })
    useStore.getState().setRuns({ enabled: false })
    expect(useStore.getState().program.runs).toMatchObject({ enabled: false, plan: [{ name: 'Easy' }] })
  })
})
