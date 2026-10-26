// Builds src/data/exercises.json from openGym's exercise catalogue: names, equipment and the
// muscles each one works, mapped onto Overload's body-map muscles. Text only; openGym's media
// is licensed separately and is not used. Run: node scripts/build-exercises.mjs [catalogue dir]
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { normalizeMuscle } from '../src/lib/muscles.js'

const DIR = process.argv[2] || '../openGym/catalogue/exercises'
const KEEP = new Set(['strength', 'calisthenics', 'olympic', 'isometric', 'plyometrics'])
const title = s => s.replace(/(^|[\s(/-])([a-z])/g, (m, a, b) => a + b.toUpperCase())

const seen = new Set(), unknown = {}
const rows = []
for (const f of readdirSync(DIR).sort()) {
  const e = JSON.parse(readFileSync(join(DIR, f), 'utf8'))
  if (!KEEP.has(e.category) || !e.name || / v\. ?\d+$/.test(e.name)) continue
  const name = title(e.name.trim())
  if (seen.has(name.toLowerCase())) continue
  const muscles = []
  for (const m of [e.target, ...(e.secondaryMuscles || [])]) {
    const s = normalizeMuscle(m)
    if (s) { if (!muscles.includes(s)) muscles.push(s) } else unknown[m] = (unknown[m] || 0) + 1
  }
  if (!muscles.length) continue
  seen.add(name.toLowerCase())
  rows.push([name, e.equipment || '', muscles.join(',')])
}
rows.sort((a, b) => a[0].localeCompare(b[0]))
const equipment = [...new Set(rows.map(r => r[1]))].sort()
const out = { source: 'openGym exercise catalogue (AGPL-3.0; ExerciseDB-derived entries MIT), see NOTICE.md', equipment, exercises: rows.map(([n, eq, m]) => [n, equipment.indexOf(eq), m]) }
writeFileSync(new URL('../src/data/exercises.json', import.meta.url), JSON.stringify(out))
console.log(`${rows.length} exercises, ${equipment.length} equipment types; dropped muscle names:`, unknown)
