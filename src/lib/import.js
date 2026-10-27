// Program import: JSON, or a spreadsheet (.xlsx / .csv) with one row per exercise.
// Everything is validated up front; a file with errors imports nothing.

import { normalizeMuscle } from './muscles.js'
import { normalizeBlock } from './block.js'
import { loadLibrary, fillMuscles } from './exercises.js'
import { normalizeRuns, programRuns, MAX_RUNS } from './runs.js'
import { historyFor, exKey } from './progression.js'

export const SHEET_COLUMNS = ['Week', 'Day', 'DayName', 'Order', 'Exercise', 'Sets', 'Reps', 'RIR', 'Increment', 'StartWeight', 'HitsToProgress', 'Muscles', 'Notes']
export const SETTINGS_COLUMNS = ['Build', 'Deload', 'DeloadSets', 'DeloadWeight', 'DeloadRIR', 'DeloadRun', 'Runs']
export const RUN_COLUMNS = ['Name', 'Km', 'Notes']

const DEFAULTS = { sets: 3, rir: 2, increment: 5, startWeight: 0, hitsToProgress: 1 }

const num = v => (v === '' || v == null ? undefined : Number(v))
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const sorted = (a, b) => (a <= b ? [a, b] : [b, a])

/** A range that a spreadsheet turned into a date ("3-5" → 5 Mar) → [min, max], or null. */
function repRangeFromDate(v) {
  if (v instanceof Date) return sorted(v.getMonth() + 1, v.getDate())
  // Excel serial day numbers; no rep count gets anywhere near 10000
  if (typeof v === 'number' && v >= 10000) {
    const d = new Date(Date.UTC(1899, 11, 30) + v * 864e5)
    return sorted(d.getUTCMonth() + 1, d.getUTCDate())
  }
  // What Excel writes back to a CSV: "5-Mar", "Mar-5", "5 Mar"
  const m = String(v).trim().toLowerCase().match(/^(\d{1,2})[\s-]([a-z]{3})[a-z]*$|^([a-z]{3})[a-z]*[\s-](\d{1,2})$/)
  if (!m) return null
  const month = MONTHS.indexOf(m[2] || m[3]) + 1
  return month ? sorted(month, Number(m[1] || m[4])) : null
}

/** "8-10", "8–10", "8 to 10" or "8" → [min, max]. Undoes Excel's date conversion of "8-10". */
export function parseRepRange(v) {
  if (v == null || v === '') return [undefined, undefined]
  const fromDate = repRangeFromDate(v)
  if (fromDate) return fromDate
  const m = String(v).match(/(\d+)\s*(?:-|–|—|to)\s*(\d+)/)
  if (m) return [Number(m[1]), Number(m[2])]
  const n = Number(v)
  return isFinite(n) ? [n, n] : [NaN, NaN]
}

const splitMuscles = v => (Array.isArray(v) ? v : String(v || '').split(/[,;/]/)).map(s => s.trim()).filter(Boolean)

/** Validate and fill one exercise. Pushes messages onto errors / warnings. */
function normalizeExercise(e, where, errors, warnings, used) {
  const name = String(e.name ?? e.exercise ?? '').trim()
  if (!name) { errors.push(`${where}: missing exercise name`); return null }
  let repMin = num(e.repMin), repMax = num(e.repMax)
  if ((repMin == null || repMax == null) && e.reps != null) {
    const [a, b] = parseRepRange(e.reps)
    repMin = repMin ?? a; repMax = repMax ?? b
  }
  if (repMin == null && repMax != null) repMin = repMax
  if (repMax == null && repMin != null) repMax = repMin
  const ex = {
    name,
    sets: num(e.sets) ?? DEFAULTS.sets,
    repMin, repMax,
    rir: num(e.rir) ?? DEFAULTS.rir,
    increment: num(e.increment) ?? DEFAULTS.increment,
    startWeight: num(e.startWeight) ?? DEFAULTS.startWeight,
    hitsToProgress: num(e.hitsToProgress) ?? DEFAULTS.hitsToProgress,
    muscles: [],
    notes: e.notes ? String(e.notes) : '',
    // Old name(s) in a file whose exercises were renamed, so import can move the logged history
    ...(e.renamedFrom ? { renamedFrom: [].concat(e.renamedFrom).map(String).filter(Boolean) } : {})
  }
  const bad = k => !Number.isFinite(ex[k]) || ex[k] < 0
  if (repMin == null) errors.push(`${where} (${name}): needs Reps (e.g. 8-10) or RepMin/RepMax`)
  else if (bad('repMin') || bad('repMax') || ex.repMin < 1) errors.push(`${where} (${name}): reps must be positive numbers`)
  else if (ex.repMax < ex.repMin) errors.push(`${where} (${name}): RepMax (${ex.repMax}) is less than RepMin (${ex.repMin})`)
  if (bad('sets') || ex.sets < 1 || !Number.isInteger(ex.sets)) errors.push(`${where} (${name}): Sets must be a whole number ≥ 1`)
  for (const k of ['rir', 'increment', 'startWeight', 'hitsToProgress']) if (bad(k)) errors.push(`${where} (${name}): ${k} must be a number ≥ 0`)
  for (const m of splitMuscles(e.muscles)) {
    const s = normalizeMuscle(m)
    if (s) { if (!ex.muscles.includes(s)) ex.muscles.push(s) } else warnings.push(`${where} (${name}): unknown muscle "${m}" ignored`)
  }
  let id = slug(name) || 'ex', i = 2
  while (used.has(id)) id = slug(name) + '-' + i++
  used.add(id)
  ex.id = id
  return ex
}

/** Validate a program object (the JSON format). Returns { program, errors, warnings }. */
export function normalizeProgram(input) {
  const errors = [], warnings = []
  const src = input?.program && !input.days ? input.program : input
  if (!src || !Array.isArray(src.days) || !src.days.length) {
    return { program: null, errors: ['Program needs a non-empty "days" array'], warnings }
  }
  const dayIds = new Set()
  const days = src.days.map((d, di) => {
    const week = String(d.week ?? 'A').toUpperCase()
    let id = String(d.id ?? `${week}${di + 1}`)
    if (dayIds.has(id)) errors.push(`Day ${di + 1}: duplicate id "${id}"`)
    dayIds.add(id)
    const used = new Set()
    const exercises = (d.exercises || []).map((e, ei) =>
      normalizeExercise(e, `Day "${d.name || id}" exercise ${ei + 1}`, errors, warnings, used)).filter(Boolean)
    if (!exercises.length) errors.push(`Day "${d.name || id}" has no exercises`)
    return { id, week, name: String(d.name || `Day ${di + 1}`), exercises }
  })
  const program = {
    name: String(src.name || 'My program'),
    unit: src.unit === 'kg' ? 'kg' : 'lb',
    days,
    block: src.block === null || src.block === false ? { enabled: false } : normalizeBlock(src.block)
  }
  // Left out when the source says nothing about runs, so an import keeps the current run plan.
  if (src.runs != null) {
    if (src.runs?.plan?.length > MAX_RUNS) warnings.push(`Only the first ${MAX_RUNS} runs are kept (max ${MAX_RUNS} a week)`)
    program.runs = normalizeRuns(src.runs)
  }
  const b = program.block
  if (b.enabled !== false && (!Number.isInteger(b.build) || b.build < 1 || !Number.isInteger(b.deload) || b.deload < 0)) {
    errors.push('block.build must be a whole number ≥ 1 and block.deload ≥ 0')
  }
  return { program: errors.length ? null : program, errors, warnings }
}

/**
 * { oldName: newName } for exercises marked renamedFrom whose old name has logged history and
 * is no longer used in the program (so it is not taken from an exercise that keeps the name).
 */
export function historyRenames(program, sessions) {
  const names = new Set(program.days.flatMap(d => d.exercises.map(e => exKey(e.name))))
  const out = {}
  for (const d of program.days) for (const e of d.exercises) {
    for (const old of e.renamedFrom || []) {
      if (exKey(old) === exKey(e.name) || names.has(exKey(old)) || out[old]) continue
      if (historyFor(sessions, old, { includeDeload: true }).length) out[old] = e.name
    }
  }
  return out
}

/** The program without renamedFrom markers (they only matter during import). */
export const withoutRenames = program => ({
  ...program,
  days: program.days.map(d => ({ ...d, exercises: d.exercises.map(({ renamedFrom, ...e }) => e) }))
})

const lc = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [String(k).trim().toLowerCase().replace(/[\s_]/g, ''), typeof v === 'string' ? v.trim() : v]))

// "50", "50%" or 0.5 → 0.5 (spreadsheet deload columns are percentages)
const pct = v => {
  const n = num(String(v ?? '').replace('%', '').trim())
  return n == null || !Number.isFinite(n) ? undefined : n > 1 ? n / 100 : n
}

const ON = v => !/^(off|no|n|false|0)$/i.test(String(v ?? '').trim())

/**
 * Spreadsheet rows (objects keyed by header) → program. settingsRow is the optional Settings
 * sheet; runRows the optional Runs sheet (Name, Km, Notes).
 */
export function programFromRows(rows, settingsRow, name = 'Imported program', runRows = null) {
  const errors = []
  const groups = new Map()
  rows.forEach((raw, i) => {
    const r = lc(raw)
    if (Object.values(r).every(v => v === '' || v == null)) return
    const rowNo = i + 2                         // header is row 1
    if (!r.exercise) { errors.push(`Row ${rowNo}: missing Exercise`); return }
    let week = String(r.week ?? 'A').trim().toUpperCase()
    if (week === '1') week = 'A'
    if (week === '2') week = 'B'
    const day = String(r.day ?? '').trim()
    if (!day) { errors.push(`Row ${rowNo} (${r.exercise}): missing Day`); return }
    const key = week + '|' + day
    if (!groups.has(key)) groups.set(key, { week, day, name: r.dayname || '', rows: [] })
    const g = groups.get(key)
    if (!g.name && r.dayname) g.name = r.dayname
    g.rows.push({ rowNo, order: num(r.order) ?? g.rows.length + 1, r })
  })

  const weekOrder = w => (w.length === 1 ? w.charCodeAt(0) : 1000)
  const dayOrder = d => (isFinite(Number(d)) ? Number(d) : 1000)
  const ordered = [...groups.values()].sort((a, b) => weekOrder(a.week) - weekOrder(b.week) || dayOrder(a.day) - dayOrder(b.day))

  const program = {
    name,
    days: ordered.map(g => ({
      id: g.week + slug(g.day),
      week: g.week,
      name: g.name || `${g.week}${g.day}`,
      exercises: g.rows.sort((a, b) => a.order - b.order).map(({ r }) => ({
        name: r.exercise, sets: r.sets, reps: r.reps, repMin: r.repmin, repMax: r.repmax, rir: r.rir,
        increment: r.increment, startWeight: r.startweight, hitsToProgress: r.hitstoprogress,
        muscles: r.muscles, notes: r.notes
      }))
    }))
  }
  if (settingsRow) {
    const s = lc(settingsRow)
    if (s.unit) program.unit = String(s.unit).toLowerCase()
    if (s.build != null && s.build !== '') {
      program.block = Number(s.build) === 0 ? null : { build: Number(s.build), deload: num(s.deload) ?? 1 }
    }
    if (program.block) {
      const ld = { setsFactor: pct(s.deloadsets), weightFactor: pct(s.deloadweight), rirAdd: num(s.deloadrir) }
      program.block.liftDeload = Object.fromEntries(Object.entries(ld).filter(([, v]) => v != null))
      const run = pct(s.deloadrun)
      if (run != null) program.block.runDeloadFactor = run
    }
    if (s.runs != null && s.runs !== '') program.runs = { enabled: ON(s.runs), plan: [] }
  }
  if (runRows) {
    const plan = runRows.map(lc).filter(r => r.name || r.km).map(r => ({ name: r.name, km: r.km, notes: r.notes }))
    program.runs = { enabled: settingsRow && lc(settingsRow).runs != null && lc(settingsRow).runs !== '' ? ON(lc(settingsRow).runs) : true, plan }
  }
  if (!program.days.length && !errors.length) errors.push('No exercise rows found')
  const res = normalizeProgram(program)
  return { ...res, program: errors.length ? null : res.program, errors: [...errors, ...res.errors] }
}

/**
 * Fill in muscles for exercises imported without any, from the exercise library.
 * Adds an info line (how many were filled) and a warning naming any it could not place.
 */
export async function withMuscles(res) {
  if (!res.program) return res
  const blank = res.program.days.reduce((n, d) => n + d.exercises.filter(e => !e.muscles.length).length, 0)
  if (!blank) return res
  const missed = fillMuscles(res.program, await loadLibrary())
  const left = res.program.days.reduce((n, d) => n + d.exercises.filter(e => !e.muscles.length).length, 0)
  const filled = blank - left
  const info = [...(res.info || [])]
  if (filled) info.push(`Muscles filled in from the exercise library for ${filled} exercise${filled === 1 ? '' : 's'}. To choose them yourself, add a Muscles column.`)
  const warnings = [...res.warnings]
  if (missed.length) warnings.push(`No muscles found for: ${missed.join(', ')}. Add a Muscles column to set them.`)
  return { ...res, info, warnings }
}

/**
 * Program JSON as text into { program, errors, warnings, info }. Also takes a pasted AI reply:
 * the JSON is pulled out of a ```json code block, or from the first { to the last }.
 */
export async function importJsonText(text, name = 'Imported program') {
  const src = String(text || '')
  const fenced = src.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const body = fenced ? fenced[1] : src.slice(src.indexOf('{'), src.lastIndexOf('}') + 1)
  let obj
  try { obj = JSON.parse(body) } catch (e) { return { program: null, errors: ['Not valid JSON: ' + e.message], warnings: [] } }
  return withMuscles(normalizeProgram({ name, ...obj }))
}

/** Read a File (json/xlsx/xls/csv) into { program, errors, warnings, info }. */
export async function importFile(file) {
  const name = file.name.replace(/\.[^.]+$/, '')
  if (/\.json$/i.test(file.name)) return importJsonText(await file.text(), name)
  const XLSX = await import('xlsx')
  // raw: keep CSV cells as text, otherwise SheetJS reads "3-5" as a date
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', raw: /\.csv$/i.test(file.name) })
  const sheetName = wb.SheetNames.find(n => !/^(settings|runs)$/i.test(n)) || wb.SheetNames[0]
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' })
  const settingsSheet = wb.SheetNames.find(n => /^settings$/i.test(n))
  const settingsRow = settingsSheet ? XLSX.utils.sheet_to_json(wb.Sheets[settingsSheet], { defval: '' })[0] : null
  const runsSheet = wb.SheetNames.find(n => /^runs$/i.test(n))
  const runRows = runsSheet ? XLSX.utils.sheet_to_json(wb.Sheets[runsSheet], { defval: '' }) : null
  return withMuscles(programFromRows(rows, settingsRow, name, runRows))
}

/** The program as spreadsheet rows (for the Excel template and export). */
export function programToRows(program) {
  return program.days.flatMap(d => d.exercises.map((e, i) => ({
    Week: d.week, Day: d.id.slice(d.week.length) || String(i + 1), DayName: d.name, Order: i + 1,
    Exercise: e.name, Sets: e.sets, Reps: e.repMin === e.repMax ? String(e.repMin) : `${e.repMin}-${e.repMax}`,
    RIR: e.rir, Increment: e.increment, StartWeight: e.startWeight,
    HitsToProgress: e.hitsToProgress, Muscles: (e.muscles || []).join(', '), Notes: e.notes || ''
  })))
}

export function settingsToRow(program) {
  const b = program.block || {}
  const n = normalizeBlock(b), p = f => Math.round(f * 100)
  return {
    Build: b.enabled === false ? 0 : b.build ?? 3, Deload: b.deload ?? 1,
    DeloadSets: p(n.liftDeload.setsFactor), DeloadWeight: p(n.liftDeload.weightFactor), DeloadRIR: n.liftDeload.rirAdd, DeloadRun: p(n.runDeloadFactor),
    Runs: programRuns(program).enabled ? 'on' : 'off'
  }
}

export const runsToRows = program => programRuns(program).plan.map(p => ({ Name: p.name, Km: p.km ?? '', Notes: p.notes }))

/** Build and download an .xlsx of a program (used for the template). */
export async function downloadXlsx(program, filename) {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(programToRows(program), { header: SHEET_COLUMNS }), 'Program')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([settingsToRow(program)], { header: SETTINGS_COLUMNS }), 'Settings')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(runsToRows(program), { header: RUN_COLUMNS }), 'Runs')
  XLSX.writeFile(wb, filename)
}
