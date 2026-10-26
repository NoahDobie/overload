// Which day of the rotation is next. Driven by the log, not the calendar, so a missed or
// doubled-up day never knocks the cycle out of sync.

import { live, byDate } from './util.js'

/** Index into days of the day after the most recently logged one (0 if none, -1 if no days). */
export function nextDayIndex(days, sessions) {
  if (!days?.length) return -1
  const ids = new Set(days.map(d => d.id))
  const done = live(sessions).filter(s => ids.has(s.dayId)).sort(byDate)
  if (!done.length) return 0
  const i = days.findIndex(d => d.id === done[done.length - 1].dayId)
  return (i + 1) % days.length
}

/** Position within its week, 1-based ("Day 3" of Week A). */
export function dayNumber(days, idx) {
  const d = days[idx]
  if (!d) return 0
  return days.slice(0, idx + 1).filter(x => x.week === d.week).length
}
