// Merging two copies of the user document (this device vs. the server).
// Record collections are unioned by id with the newest updatedAt winning; deletions are
// tombstones ({ id, deleted: true, updatedAt }) so they win over an older live copy.
// program and settings are whole objects: newest updatedAt wins. A cleared program is the
// tombstone { deleted: true, updatedAt } so the clear reaches other devices.
// resetAt marks an account reset: anything older than it is dropped from every copy, so a
// device that was offline during the reset can't bring the old data back.

export const COLLECTIONS = ['sessions', 'runs', 'bodyweight']
export const OBJECTS = ['program', 'settings']

const newer = (a, b) => ((b?.updatedAt || 0) > (a?.updatedAt || 0) ? b : a)

export function mergeCollection(a = [], b = []) {
  const map = new Map()
  for (const x of a) map.set(x.id, x)
  for (const x of b) map.set(x.id, map.has(x.id) ? newer(map.get(x.id), x) : x)
  return [...map.values()]
}

const BLANK_SETTINGS = { unit: 'lb', blockStart: null, updatedAt: 0 }

/** doc with everything last changed at or before resetAt removed. */
export function applyReset(doc, resetAt) {
  const keep = x => (x?.updatedAt || 0) > resetAt
  const out = { ...doc, resetAt }
  for (const k of COLLECTIONS) out[k] = (doc[k] || []).filter(keep)
  out.program = keep(doc.program) ? doc.program : { deleted: true, updatedAt: resetAt }
  out.settings = keep(doc.settings) ? doc.settings : BLANK_SETTINGS
  return out
}

export function mergeDocs(local = {}, remote = {}) {
  const R = Math.max(local.resetAt || 0, remote.resetAt || 0)
  if ((local.resetAt || 0) < R) local = applyReset(local, R)
  if ((remote.resetAt || 0) < R) remote = applyReset(remote, R)
  const out = { ...remote, ...local, resetAt: R }
  for (const k of COLLECTIONS) out[k] = mergeCollection(local[k], remote[k])
  for (const k of OBJECTS) {
    if (local[k] && remote[k]) out[k] = newer(local[k], remote[k])
    else out[k] = local[k] || remote[k] || null
  }
  return out
}

/** Only the synced part of the document (no in-progress workout, no UI state). */
export const syncedPart = doc => {
  const out = {}
  for (const k of [...COLLECTIONS, ...OBJECTS]) out[k] = doc[k] ?? null
  if (!out.program && doc.programClearedAt) out.program = { deleted: true, updatedAt: doc.programClearedAt }
  out.resetAt = doc.resetAt || 0
  return out
}
