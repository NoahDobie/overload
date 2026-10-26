import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import * as XLSX from 'xlsx'
import { normalizeProgram, programFromRows, parseRepRange, programToRows, settingsToRow, importFile } from './import.js'

const example = JSON.parse(readFileSync(new URL('../../examples/program.json', import.meta.url), 'utf8'))

describe('JSON import', () => {
  it('accepts the example program', () => {
    const { program, errors, warnings } = normalizeProgram(example)
    expect(errors).toEqual([])
    expect(warnings).toEqual([])
    expect(program.days).toHaveLength(10)
    expect(program.days[0].exercises[0]).toMatchObject({ name: 'Barbell Bench Press', repMin: 6, repMax: 8, increment: 5, muscles: ['chest', 'triceps', 'deltoids'] })
    expect(program.block).toMatchObject({ build: 3, deload: 1, enabled: true })
    expect(program.runTargets.long.miles).toBe(8)
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

  it('groups rows into ordered days and reads the Settings row', () => {
    const rows = [
      { Week: 'B', Day: 1, DayName: 'Push B', Exercise: 'Dip', Sets: 3, Reps: '6-10' },
      { Week: 'A', Day: 2, DayName: 'Pull A', Exercise: 'Row', Sets: 3, Reps: '8-12', Muscles: 'lats, biceps' },
      { Week: 'A', Day: 1, DayName: 'Push A', Order: 2, Exercise: 'Fly', Reps: '12-15' },
      { Week: 'A', Day: 1, Order: 1, Exercise: 'Bench', Sets: 4, RepMin: 5, RepMax: 8, Increment: 5, StartWeight: 185 },
      { Week: '', Day: '', Exercise: '' }
    ]
    const { program, errors } = programFromRows(rows, { Build: 4, Deload: 1, RunLongMiles: 10 })
    expect(errors).toEqual([])
    expect(program.days.map(d => d.name)).toEqual(['Push A', 'Pull A', 'Push B'])
    expect(program.days[0].exercises.map(e => e.name)).toEqual(['Bench', 'Fly'])
    expect(program.days[0].exercises[0]).toMatchObject({ sets: 4, repMin: 5, repMax: 8, startWeight: 185 })
    expect(program.block.build).toBe(4)
    expect(program.runTargets.long.miles).toBe(10)
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
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
    const file = { name: 'plan.xlsx', arrayBuffer: async () => buf }
    const res = await importFile(file)
    expect(res.errors).toEqual([])
    expect(res.program.days.map(d => d.name)).toEqual(program.days.map(d => d.name))
    expect(res.program.days[2].exercises).toEqual(program.days[2].exercises)
    expect(res.program.runTargets).toEqual(program.runTargets)
  })

  it('imports CSV', async () => {
    const csv = 'Week,Day,DayName,Exercise,Sets,Reps\nA,1,Push A,Bench,3,6-8\nA,1,Push A,Fly,2,12-15\n'
    const res = await importFile({ name: 'p.csv', arrayBuffer: async () => new TextEncoder().encode(csv).buffer })
    expect(res.errors).toEqual([])
    expect(res.program.days[0].exercises).toHaveLength(2)
  })
})
