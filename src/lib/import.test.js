import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import * as XLSX from 'xlsx'
import { normalizeProgram, programFromRows, parseRepRange, programToRows, settingsToRow, runsToRows, importFile } from './import.js'

const example = JSON.parse(readFileSync(new URL('../../examples/program.json', import.meta.url), 'utf8'))

describe('JSON import', () => {
  it('accepts the example program', () => {
    const { program, errors, warnings } = normalizeProgram(example)
    expect(errors).toEqual([])
    expect(warnings).toEqual([])
    expect(program.days).toHaveLength(10)
    expect(program.days[0].exercises[0]).toMatchObject({ name: 'Barbell Bench Press', repMin: 6, repMax: 8, increment: 5, muscles: ['chest', 'triceps', 'deltoids'] })
    expect(program.block).toMatchObject({ build: 3, deload: 1, enabled: true })
    expect(program.runs.plan.map(r => [r.name, r.km])).toEqual([['Easy', 6], ['Quality', 8], ['Long', 13]])
  })

  it('fills defaults and reports bad rows without importing', () => {
    const ok = normalizeProgram({ days: [{ name: 'X', exercises: [{ name: 'Curl', reps: 10 }] }] })
    expect(ok.program.days[0].exercises[0]).toMatchObject({ sets: 3, repMin: 10, repMax: 10, rir: 2, increment: 5, hitsToProgress: 1 })
    expect(ok.program.block.build).toBe(3)

    const bad = normalizeProgram({ days: [{ name: 'X', exercises: [{ name: 'Curl', repMin: 12, repMax: 8 }, { reps: 5 }] }] })
    expect(bad.program).toBeNull()
    expect(bad.errors.join('\n')).toMatch(/RepMax \(8\) is less than RepMin \(12\)/)
    expect(bad.errors.join('\n')).toMatch(/missing exercise name/)
  })

  it('can turn blocks off', () => {
    expect(normalizeProgram({ block: null, days: example.days }).program.block.enabled).toBe(false)
  })
})

describe('spreadsheet import', () => {
  it('parses rep ranges', () => {
    expect(parseRepRange('8-10')).toEqual([8, 10])
    expect(parseRepRange('8–12')).toEqual([8, 12])
    expect(parseRepRange(5)).toEqual([5, 5])
  })

  it('undoes Excel turning rep ranges into dates', () => {
    expect(parseRepRange(36955)).toEqual([3, 5])       // 5 Mar 2001 serial
    expect(parseRepRange(46086)).toEqual([3, 5])       // 5 Mar 2026 serial
    expect(parseRepRange('5-Mar')).toEqual([3, 5])
    expect(parseRepRange('12-Aug')).toEqual([8, 12])
    expect(parseRepRange('Dec-15')).toEqual([12, 15])
    expect(parseRepRange('3-May')).toEqual([3, 5])     // day-first locales
    expect(parseRepRange(new Date(2026, 5, 10))).toEqual([6, 10])
    expect(parseRepRange('10-120')).toEqual([10, 120])
  })

  it('groups rows into ordered days and reads the Settings row', () => {
    const rows = [
      { Week: 'B', Day: 1, DayName: 'Push B', Exercise: 'Dip', Sets: 3, Reps: '6-10' },
      { Week: 'A', Day: 2, DayName: 'Pull A', Exercise: 'Row', Sets: 3, Reps: '8-12', Muscles: 'lats, biceps' },
      { Week: 'A', Day: 1, DayName: 'Push A', Order: 2, Exercise: 'Fly', Reps: '12-15' },
      { Week: 'A', Day: 1, Order: 1, Exercise: 'Bench', Sets: 4, RepMin: 5, RepMax: 8, Increment: 5, StartWeight: 185 },
      { Week: '', Day: '', Exercise: '' }
    ]
    const { program, errors } = programFromRows(rows, { Build: 4, Deload: 1 }, 'P', [{ Name: 'Tempo', Km: 8, Notes: '3×2 km' }, { Name: 'Long', Km: '' }])
    expect(errors).toEqual([])
    expect(program.days.map(d => d.name)).toEqual(['Push A', 'Pull A', 'Push B'])
    expect(program.days[0].exercises.map(e => e.name)).toEqual(['Bench', 'Fly'])
    expect(program.days[0].exercises[0]).toMatchObject({ sets: 4, repMin: 5, repMax: 8, startWeight: 185 })
    expect(program.block.build).toBe(4)
    expect(program.runs).toMatchObject({ enabled: true, plan: [{ name: 'Tempo', km: 8, notes: '3×2 km' }, { name: 'Long', km: null }] })
    // nothing about runs: left out, so the current plan is kept
    expect(programFromRows(rows, null).program.runs).toBeUndefined()
    expect(programFromRows(rows, { Runs: 'off' }).program.runs.enabled).toBe(false)
  })

  it('reports row numbers', () => {
    const { program, errors } = programFromRows([{ Week: 'A', Day: 1, Exercise: 'Bench', Reps: '10-8' }, { Week: 'A', Exercise: 'Row', Reps: 8 }])
    expect(program).toBeNull()
    expect(errors.join('\n')).toMatch(/Row 3 \(Row\): missing Day/)
  })

  it('round-trips the example through an xlsx workbook', async () => {
    const { program } = normalizeProgram(example)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(programToRows(program)), 'Program')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([settingsToRow(program)]), 'Settings')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(runsToRows(program)), 'Runs')
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
    const file = { name: 'plan.xlsx', arrayBuffer: async () => buf }
    const res = await importFile(file)
    expect(res.errors).toEqual([])
    expect(res.program.days.map(d => d.name)).toEqual(program.days.map(d => d.name))
    expect(res.program.days[2].exercises).toEqual(program.days[2].exercises)
    expect(res.program.runs).toEqual(program.runs)
  })

  it('imports CSV', async () => {
    const csv = 'Week,Day,DayName,Exercise,Sets,Reps\nA,1,Push A,Bench,3,6-8\nA,1,Push A,Fly,2,12-15\n'
    const res = await importFile({ name: 'p.csv', arrayBuffer: async () => new TextEncoder().encode(csv).buffer })
    expect(res.errors).toEqual([])
    expect(res.program.days[0].exercises.map(e => [e.sets, e.repMin, e.repMax])).toEqual([[3, 6, 8], [2, 12, 15]])
  })

  it('imports a CSV that Excel has re-saved with dates', async () => {
    const csv = 'Week,Day,DayName,Exercise,Sets,Reps,RIR,Muscles\nA,1,Push 1,Flat Bench,4,5-Mar,1,"chest, triceps"\nA,1,Push 1,Lat Raise,3,12-Aug,0,shoulders\n'
    const res = await importFile({ name: 'p.csv', arrayBuffer: async () => new TextEncoder().encode(csv).buffer })
    expect(res.errors).toEqual([])
    expect(res.program.days[0].exercises.map(e => [e.name, e.sets, e.repMin, e.repMax, e.rir])).toEqual([['Flat Bench', 4, 3, 5, 1], ['Lat Raise', 3, 8, 12, 0]])
    expect(res.program.days[0].exercises[0].muscles).toEqual(['chest', 'triceps'])
  })
})

describe('renamedFrom', () => {
  it('maps old names with history to new ones, leaving names still in use alone', async () => {
    const { historyRenames, withoutRenames } = await import('./import.js')
    const { program } = normalizeProgram({ days: [
      { name: 'Push 1', exercises: [{ name: 'Barbell Bench Press', reps: '3-5', renamedFrom: 'Bench Press' }, { name: 'Cable Pushdown', reps: '8-12', renamedFrom: ['Tricep Pushdown', 'Pushdown'] }] },
      { name: 'Push 2', exercises: [{ name: 'Barbell Bench Press', reps: '3-5', renamedFrom: 'Flat Bench' }, { name: 'Dips', reps: '8-12', renamedFrom: 'Squat' }] },
      { name: 'Legs', exercises: [{ name: 'Squat', reps: '5' }] }
    ] })
    const sessions = [
      { id: 1, date: '2026-10-20', entries: [{ name: 'Bench Press', sets: [{ w: 250, r: 5, done: true }] }, { name: 'flat bench', sets: [{ w: 245, r: 5, done: true }] }] },
      { id: 2, date: '2026-10-21', entries: [{ name: 'Tricep Pushdown', sets: [{ w: 50, r: 10, done: false }] }, { name: 'Squat', sets: [{ w: 300, r: 5, done: true }] }] }
    ]
    expect(historyRenames(program, sessions)).toEqual({ 'Bench Press': 'Barbell Bench Press', 'Flat Bench': 'Barbell Bench Press' })
    expect(JSON.stringify(withoutRenames(program))).not.toMatch(/renamedFrom/)
  })
})

describe('deload columns and pasted JSON', () => {
  it('round-trips the deload settings through the Settings sheet', () => {
    const rows = [{ Week: 'A', Day: 1, Exercise: 'Bench', Reps: '5-8' }]
    const { program } = programFromRows(rows, { Build: 4, Deload: 2, DeloadSets: '66%', DeloadWeight: 90, DeloadRIR: 3, DeloadRun: 50 })
    expect(program.block).toMatchObject({ build: 4, deload: 2, liftDeload: { setsFactor: 0.66, weightFactor: 0.9, rirAdd: 3 }, runDeloadFactor: 0.5 })
    expect(settingsToRow(program)).toMatchObject({ Build: 4, Deload: 2, DeloadSets: 66, DeloadWeight: 90, DeloadRIR: 3, DeloadRun: 50 })
    // left out: the usual deload
    expect(programFromRows(rows, { Build: 3 }).program.block.liftDeload).toEqual({ setsFactor: 0.5, rirAdd: 2, weightFactor: 1 })
  })

  it('pulls the program out of a pasted AI reply', async () => {
    const { importJsonText } = await import('./import.js')
    const reply = 'Here you go!\n```json\n{ "name": "UL", "days": [{ "name": "Upper", "exercises": [{ "name": "Bench", "reps": "6-8", "muscles": "chest" }] }] }\n```\nEnjoy {:'
    const res = await importJsonText(reply)
    expect(res.errors).toEqual([])
    expect(res.program).toMatchObject({ name: 'UL', days: [{ name: 'Upper', exercises: [{ name: 'Bench', repMin: 6, repMax: 8 }] }] })
    expect((await importJsonText('sure: { "days": [{ "name": "X", "exercises": [{ "name": "Curl", "reps": 10, "muscles": "biceps" }] }] }')).errors).toEqual([])
    expect((await importJsonText('no json here')).errors[0]).toMatch(/Not valid JSON/)
  })
})
