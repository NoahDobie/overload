import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { libraryFrom, loadLibrary, tokens, queryTokens, search, guessMuscles, fillMuscles } from './exercises.js'
import { normalizeProgram, importFile } from './import.js'
import { MUSCLES } from './muscles.js'

const lib = libraryFrom(JSON.parse(readFileSync(new URL('../data/exercises.json', import.meta.url), 'utf8')))
const tpl = f => JSON.parse(readFileSync(new URL(`../../examples/${f}`, import.meta.url), 'utf8'))

describe('exercise library', () => {
  it('has thousands of exercises, each with known muscles', async () => {
    expect(lib.length).toBeGreaterThan(3000)
    for (const e of lib) {
      expect(e.muscles.length).toBeGreaterThan(0)
      for (const m of e.muscles) expect(MUSCLES).toContain(m)
    }
    expect((await loadLibrary()).length).toBe(lib.length)
  })

  it('expands gym shorthand', () => {
    expect(tokens('DB Lat Raises')).toEqual(['dumbbell', 'lateral', 'raise'])
    expect(tokens('OHP BB')).toEqual(['overhead', 'press', 'barbell'])
    expect(queryTokens('Flat Bench')).toEqual(['bench', 'press'])
    expect(queryTokens('Incline DB')).toEqual(['incline', 'dumbbell', 'press'])
    expect(queryTokens('Incline DB Fly')).toEqual(['incline', 'dumbbell', 'fly'])
  })

  it('searches by words, muscle and equipment', () => {
    expect(search(lib, 'incline db', { limit: 1 })[0].name).toBe('Dumbbell Incline Bench Press')
    expect(search(lib, 'rdl', { limit: 3 }).map(e => e.name)).toContain('Barbell Romanian Deadlift')
    const calves = search(lib, '', { muscle: 'calves', limit: 20 })
    expect(calves.every(e => e.muscles.includes('calves'))).toBe(true)
    expect(search(lib, 'curl', { equipment: 'cable', limit: 20 }).every(e => e.equipment === 'cable')).toBe(true)
  })

  it('guesses muscles for everyday names', () => {
    const m = n => guessMuscles(lib, n)?.muscles[0]
    expect(m('Flat Bench')).toBe('chest')
    expect(m('Incline BB')).toBe('chest')
    expect(m('OHP DB')).toBe('deltoids')
    expect(m('DB Lat Raise')).toBe('deltoids')
    expect(m('Tricep Pushdown')).toBe('triceps')
    expect(m('Lat Pulldown')).toBe('upper-back')
    expect(m('RDL')).toBe('hamstring')
    expect(m('Squats')).toBe('quadriceps')
    expect(m('Nordic Curls')).toBe('hamstring')
    expect(m('Leg Extension')).toBe('quadriceps')
    expect(m('Hip In')).toBe('adductors')
    expect(m('Hip Out')).toBe('gluteal')
    expect(m('Tib Raise')).toBe('calves')                       // library lists calves first
    expect(guessMuscles(lib, 'Tib Raise').muscles).toContain('tibialis')
    expect(m('Dead Hangs')).toBe('forearm')                     // keyword fallback
    expect(m('Z Twists')).toBe('obliques')
    expect(guessMuscles(lib, 'Flat Bench').muscles.length).toBeLessThanOrEqual(3)
    expect(guessMuscles(lib, 'Qwerty Zorp')).toBeNull()
  })

  it('fills only exercises without muscles', () => {
    const p = { days: [{ exercises: [{ name: 'Flat Bench', muscles: [] }, { name: 'Squat', muscles: ['gluteal'] }, { name: 'Qwerty' }] }] }
    expect(fillMuscles(p, lib)).toEqual(['Qwerty'])
    expect(p.days[0].exercises[0].muscles[0]).toBe('chest')
    expect(p.days[0].exercises[1].muscles).toEqual(['gluteal'])
  })
})

describe('import without a Muscles column', () => {
  it('fills muscles from the library and says so', async () => {
    const csv = 'Week,Day,DayName,Exercise,Sets,Reps\nA,1,Push,Flat Bench,3,5-8\nA,1,Push,Tricep Pushdown,2,8-12\nA,1,Push,Qwerty Zorp,2,8-12\n'
    const res = await importFile({ name: 'p.csv', arrayBuffer: async () => new TextEncoder().encode(csv).buffer })
    expect(res.errors).toEqual([])
    const [bench, push, odd] = res.program.days[0].exercises
    expect(bench.muscles[0]).toBe('chest')
    expect(push.muscles[0]).toBe('triceps')
    expect(odd.muscles).toEqual([])
    expect(res.info[0]).toMatch(/2 exercises/)
    expect(res.warnings.join()).toMatch(/Qwerty Zorp/)
  })
})

describe('templates', () => {
  for (const f of ['program.json', 'upper-lower.json', 'full-body.json']) {
    it(`${f} is valid and uses library muscles`, () => {
      const { program, errors, warnings } = normalizeProgram(tpl(f))
      expect(errors).toEqual([])
      expect(warnings).toEqual([])
      for (const d of program.days) for (const e of d.exercises) expect(e.muscles.length).toBeGreaterThan(0)
    })
  }
  it('one-week templates have the expected days', () => {
    expect(normalizeProgram(tpl('upper-lower.json')).program.days.map(d => d.name)).toEqual(['Upper 1', 'Lower 1', 'Upper 2', 'Lower 2'])
    expect(normalizeProgram(tpl('full-body.json')).program.days).toHaveLength(3)
  })
})
