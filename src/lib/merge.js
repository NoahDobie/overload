// Merging two copies of the user document (this device vs. the server).
// Record collections are unioned by id with the newest updatedAt winning; deletions are
// tombstones ({ id, deleted: true, updatedAt }) so they win over an older live copy.
// program and settings are whole objects: newest updatedAt wins.

export const COLLECTIONS = ['sessions', 'runs', 'bodyweight']
export const OBJECTS = ['program', 'settings']

const newer = (a, b) => ((b?.updatedAt || 0) > (a?.updatedAt || 0) ? b : a)

export function mergeCollection(a = [], b = []) {
  const map = new Map()
  for (const x of a) map.set(x.id, x)
  for (const x of b) map.set(x.id, map.has(x.id) ? newer(map.get(x.id), x) : x)
  return [...map.values()]
}

export function mergeDocs(local = {}, remote = {}) {
  const out = { ...remote, ...local }
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
  return out
}
