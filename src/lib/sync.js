// Optional Supabase sync. Without VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY the app is
// local-only and none of this runs.
//
// One row per user in `user_state` (see supabase/schema.sql), protected by row-level
// security. On open/focus/reconnect: pull, merge with the local copy (lib/merge.js), push
// the result. After local changes: the same, debounced. Failures retry with backoff.
//
// Sign-in is by emailed link. On iPhone the link opens in Safari, which has separate storage
// from a home-screen install, so sign in where the link opens (Android shares Chrome's).

import { createClient } from '@supabase/supabase-js'
import { mergeDocs, syncedPart } from './merge.js'

const URL_ = import.meta.env.VITE_SUPABASE_URL
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = URL_ && KEY ? createClient(URL_, KEY) : null
export const syncConfigured = !!supabase

export async function sendMagicLink(email) {
  // Only existing accounts can sign in; new ones are invited from the Supabase dashboard.
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin, shouldCreateUser: false } })
  if (error) {
    if (error.code === 'otp_disabled' || /signups? not allowed|user not found/i.test(error.message)) {
      throw new Error('No account for this email. Ask the owner to invite you.')
    }
    throw error
  }
}

let signOutImpl = null
let resetImpl = null

/**
 * Erase everything in the account: the server copy becomes a blank document with a reset
 * marker (so other devices wipe their copies on their next sync), then this device is cleared.
 * Throws, changing nothing, when offline or the upload fails.
 */
export const resetAccount = () => {
  if (!resetImpl) throw new Error('Sign in first')
  return resetImpl()
}

/**
 * Sync one last time, sign out and clear this device. Returns false (and stays signed in)
 * when the final sync fails, unless force is set; unsynced changes would be lost.
 */
export const signOut = ({ force = false } = {}) => (signOutImpl ? signOutImpl(force) : supabase.auth.signOut().then(() => true))

async function pull(userId) {
  const { data, error } = await supabase.from('user_state').select('doc').eq('user_id', userId).maybeSingle()
  if (error) throw error
  return data?.doc || null
}

async function push(userId, doc) {
  const { error } = await supabase.from('user_state').upsert({ user_id: userId, doc, updated_at: new Date().toISOString() })
  if (error) {
    // doc_max_1mb in supabase/schema.sql
    if (error.code === '23514' || /doc_max_1mb/.test(error.message)) throw new Error('Your data is over the 1 MB limit. Export a backup and contact the owner.')
    throw error
  }
}

const RETRY_MIN = 15e3, RETRY_MAX = 5 * 60e3

/**
 * Wire the store to Supabase. Returns an unsubscribe function.
 * onStatus receives { user, state: 'idle'|'syncing'|'synced'|'offline'|'error', error?, at? }.
 */
export function startSync(useStore, onStatus) {
  if (!supabase) return () => {}
  let user = null, timer = null, retryTimer = null, backoff = 0, applying = false, lastPushed = '', inflight = null
  const status = s => onStatus({ user, ...s })

  const scheduleRetry = () => {
    clearTimeout(retryTimer)
    backoff = Math.min(backoff ? backoff * 2 : RETRY_MIN, RETRY_MAX)
    retryTimer = setTimeout(syncNow, backoff)
  }

  // One sync at a time; a caller arriving mid-sync waits, then runs its own pass.
  const syncNow = async () => {
    while (inflight) await inflight
    inflight = runSync()
    try { return await inflight } finally { inflight = null }
  }

  const runSync = async () => {
    if (!user) return false
    if (!navigator.onLine) { status({ state: 'offline' }); return false }   // the 'online' event resumes
    status({ state: 'syncing' })
    try {
      const local = syncedPart(useStore.getState())
      const remote = await pull(user.id)
      const merged = remote ? syncedPart(mergeDocs(local, remote)) : local
      const json = JSON.stringify(merged)
      if (json !== JSON.stringify(local)) {
        applying = true
        useStore.getState().applyDoc(merged)
        applying = false
      }
      if (!remote || json !== JSON.stringify(syncedPart(remote))) await push(user.id, merged)
      lastPushed = json
      backoff = 0
      clearTimeout(retryTimer)
      status({ state: 'synced', at: Date.now() })
      return true
    } catch (e) {
      applying = false
      if (!user) return false
      status({ state: navigator.onLine ? 'error' : 'offline', error: e.message || String(e) })
      scheduleRetry()
      return false
    }
  }

  resetImpl = async () => {
    if (!user) throw new Error('Sign in first')
    if (!navigator.onLine) throw new Error("You're offline. Connect and try again.")
    clearTimeout(timer)
    while (inflight) await inflight
    const resetAt = Date.now()
    const blank = {
      sessions: [], runs: [], bodyweight: [],
      program: { deleted: true, updatedAt: resetAt },
      settings: { unit: 'lb', blockStart: null, updatedAt: resetAt },
      resetAt
    }
    await push(user.id, blank)
    applying = true
    useStore.getState().resetAll()
    useStore.setState({ resetAt, programClearedAt: resetAt })
    applying = false
    lastPushed = JSON.stringify(syncedPart(useStore.getState()))
    status({ state: 'synced', at: Date.now() })
  }

  signOutImpl = async force => {
    clearTimeout(timer)
    if (user && !(await syncNow()) && !force) return false
    clearTimeout(retryTimer)
    user = null                                  // stop the store subscription before clearing
    await supabase.auth.signOut({ scope: 'local' })
    useStore.getState().resetAll()
    lastPushed = ''
    status({ state: 'idle' })
    return true
  }

  const unsubStore = useStore.subscribe(S => {
    if (!user || applying) return
    const json = JSON.stringify(syncedPart(S))
    if (json === lastPushed) return
    clearTimeout(timer)
    timer = setTimeout(syncNow, 2000)
  })

  const { data: authSub } = supabase.auth.onAuthStateChange((_evt, session) => {
    const next = session?.user || null
    const changed = next?.id !== user?.id
    user = next
    if (!user) { clearTimeout(retryTimer); status({ state: 'idle' }); return }
    if (changed) syncNow()
  })

  const onFocus = () => { if (document.visibilityState === 'visible') syncNow() }
  const onOnline = () => { backoff = 0; syncNow() }
  document.addEventListener('visibilitychange', onFocus)
  window.addEventListener('online', onOnline)

  return () => {
    unsubStore()
    authSub.subscription.unsubscribe()
    document.removeEventListener('visibilitychange', onFocus)
    window.removeEventListener('online', onOnline)
    clearTimeout(timer)
    clearTimeout(retryTimer)
    signOutImpl = null
    resetImpl = null
  }
}
