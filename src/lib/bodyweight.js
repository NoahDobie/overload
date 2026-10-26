import { live, dateOf, addDays } from './util.js'

export const sortedWeights = entries => live(entries).slice().sort((a, b) => (a.date < b.date ? -1 : 1))

/** Mean of entries in the 7 days ending on iso (inclusive), or null. */
export function avg7(entries, iso) {
  const from = addDays(iso, -6)
  const xs = live(entries).filter(e => e.date >= from && e.date <= iso).map(e => e.weight)
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null
}

/** Change in the 7-day average versus a week earlier, or null with too little data. */
export function weeklyChange(entries, iso) {
  const now = avg7(entries, iso), prev = avg7(entries, addDays(iso, -7))
  return now != null && prev != null ? now - prev : null
}

export const toPoints = entries => sortedWeights(entries).map(e => ({ t: +dateOf(e.date), y: e.weight, d: e.date }))
