import { live, dateOf, isoOf, addDays } from './util.js'

export const RUN_TYPES = [
  { id: 'easy', label: 'Easy' },
  { id: 'quality', label: 'Quality' },
  { id: 'long', label: 'Long' }
]

/** Monday of the week containing iso. */
export function weekStart(iso) {
  const d = dateOf(iso)
  d.setDate(d.getDate() - (d.getDay() + 6) % 7)
  return isoOf(d)
}

/** { easy: run|null, quality: run|null, long: run|null, count } for the Mon–Sun week of iso. */
export function runsForWeek(runs, iso) {
  const from = weekStart(iso), to = addDays(from, 6)
  const out = { count: 0 }
  for (const t of RUN_TYPES) out[t.id] = null
  for (const r of live(runs)) {
    if (r.date < from || r.date > to || !(r.type in out)) continue
    if (!out[r.type] || r.date > out[r.type].date) out[r.type] = r
  }
  out.count = RUN_TYPES.filter(t => out[t.id]).length
  return out
}
