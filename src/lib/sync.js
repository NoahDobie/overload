// Optional Supabase sync. Without VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY the app is
// local-only and none of this runs.
//
// One row per user in `user_state` (see supabase/schema.sql), protected by row-level
// security. On open/focus: pull, merge with the local copy (lib/merge.js), push the result.
// After local changes: push, debounced.

import { createClient } from '@supabase/supabase-js'
import { mergeDocs, syncedPart } from './merge.js'

const URL_ = import.meta.env.VITE_SUPABASE_URL
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = URL_ && KEY ? createClient(URL_, KEY) : null
export const syncConfigured = !!supabase

export async function sendMagicLink(email) {
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin } })
  if (error) throw error
}

export const signOut = () => supabase.auth.signOut()

async function pull(userId) {
  const { data, error } = await supabase.from('user_state').select('doc').eq('user_id', userId).maybeSingle()
  if (error) throw error
  return data?.doc || null
}

async function push(userId, doc) {
  const { error } = await supabase.from('user_state').upsert({ user_id: userId, doc, updated_at: new Date().toISOString() })
  if (error) throw error
}

/**
 * Wire the store to Supabase. Returns an unsubscribe function.
 * onStatus receives { user, state: 'idle'|'syncing'|'synced'|'error', error?, at? }.
 */
export function startSync(useStore, onStatus) {
  if (!supabase) return () => {}
  let user = null, timer = null, applying = false, lastPushed = ''
  const status = s => onStatus({ user, ...s })

  const syncNow = async () => {
    if (!user) return
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
      status({ state: 'synced', at: Date.now() })
    } catch (e) {
      applying = false
      status({ state: 'error', error: e.message || String(e) })
    }
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
    if (!user) { status({ state: 'idle' }); return }
    if (changed) syncNow()
  })

  const onFocus = () => { if (document.visibilityState === 'visible') syncNow() }
  document.addEventListener('visibilitychange', onFocus)

  return () => {
    unsubStore()
    authSub.subscription.unsubscribe()
    document.removeEventListener('visibilitychange', onFocus)
    clearTimeout(timer)
  }
}
