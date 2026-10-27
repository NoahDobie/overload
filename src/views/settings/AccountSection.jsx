import { useState } from 'react'
import { syncConfigured, sendMagicLink, signOut, resetAccount } from '../../lib/sync.js'
import { useSync } from '../../syncStatus.js'

export default function AccountSection() {
  const sync = useSync()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  if (!syncConfigured) {
    return (
      <section className="card">
        <div className="card-h"><h2>Sync</h2></div>
        <p className="small muted">Local-only mode: data lives on this device. Use backups below, or configure Supabase (see README) to sync across devices.</p>
      </section>
    )
  }
  const send = async e => {
    e.preventDefault(); setErr('')
    try { await sendMagicLink(email); setSent(true) } catch (x) { setErr(x.message) }
  }
  const out = async () => {
    setBusy(true)
    try {
      if (await signOut()) return
      if (confirm("Your latest changes haven't synced. Signing out clears this device, so they'd be lost. Sign out anyway?")) await signOut({ force: true })
    } finally { setBusy(false) }
  }
  const reset = async () => {
    const typed = prompt('This permanently erases your program, workouts, runs and bodyweight from your account and every signed-in device. It cannot be undone; export a backup first if unsure.\n\nType ERASE to confirm.')
    if (typed?.trim().toUpperCase() !== 'ERASE') return
    setBusy(true); setErr('')
    try { await resetAccount(); alert('Your account is now empty. Other devices clear on their next sync.') }
    catch (x) { setErr(`Nothing was erased: ${x.message}`) }
    finally { setBusy(false) }
  }
  const statusText = {
    syncing: 'Syncing…',
    offline: 'Offline. Changes are saved here and sync when you reconnect.',
    error: `Sync error: ${sync.error}. Retrying.`
  }[sync.state] ?? (sync.at ? `Synced ${new Date(sync.at).toLocaleTimeString()}` : '')
  return (
    <section className="card">
      <div className="card-h"><h2>Sync</h2>{sync.user && <span className={'dot ' + sync.state} title={sync.state} />}</div>
      {sync.user ? <>
        <p className="small">Signed in as <b>{sync.user.email}</b></p>
        <p className="small muted">{statusText}</p>
        <button className="btn ghost" onClick={out} disabled={busy}>Sign out</button>
        <p className="small muted">Signing out removes your data from this device. It stays in your account.</p>
        <button className="btn ghost danger" onClick={reset} disabled={busy}>Erase everything in my account</button>
      </> : sent ? <>
        <p className="small">Check <b>{email}</b> for a sign-in link. Open it on this device.</p>
        <button className="link small" onClick={() => { setSent(false); setErr('') }}>Use a different email</button>
      </> : (
        <form className="row gap" onSubmit={send}>
          <input className="grow" type="email" required placeholder="you@email.com" value={email} onChange={e => setEmail(e.target.value)} />
          <button className="btn primary">Send link</button>
        </form>
      )}
      {err && <p className="small err-t">{err}</p>}
    </section>
  )
}
