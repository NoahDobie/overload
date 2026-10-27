// Small shared helpers: ids, local ISO dates, number formatting.

export const uid = () =>
  (globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2))

const pad = n => String(n).padStart(2, '0')

/** Local calendar date as YYYY-MM-DD (never UTC, so late-evening workouts land on the right day). */
export const isoOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const todayISO = () => isoOf(new Date())
export const dateOf = iso => new Date(iso + 'T12:00:00')

export const addDays = (iso, n) => { const d = dateOf(iso); d.setDate(d.getDate() + n); return isoOf(d) }

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export const fmtDate = (iso, withYear = false) => {
  const d = dateOf(iso)
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}` + (withYear ? ` ${d.getFullYear()}` : '')
}

/** Up to one decimal, no trailing ".0". */
export const fmtNum = n => (n == null || !isFinite(n) ? '–' : String(Math.round(n * 10) / 10))

/** Live (non-deleted) records. Deletions are kept as tombstones so they sync. */
export const live = arr => (arr || []).filter(x => !x.deleted)

export const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.updatedAt || 0) - (b.updatedAt || 0))

/** Epley estimated one-rep max. */
export const e1rm = (w, r) => (r > 0 && w > 0 ? w * (1 + r / 30) : 0)

/** Save text as a file download. */
export const download = (name, text, type = 'application/json') => {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
