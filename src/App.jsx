import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useStore, isStale } from './store.js'
import { fmtDate } from './lib/util.js'
import { startSync } from './lib/sync.js'
import { useSync } from './syncStatus.js'
import { Icon, Sheet } from './components/ui.jsx'
import Today from './views/Today.jsx'
import Workout from './views/Workout.jsx'
import History from './views/History.jsx'
import ExerciseDetail from './views/ExerciseDetail.jsx'
import Body from './views/Body.jsx'
import Settings from './views/Settings.jsx'
import ProgramEditor from './views/ProgramEditor.jsx'

const TABS = [
  { to: '/', icon: 'today', label: 'Today' },
  { to: '/history', icon: 'history', label: 'History' },
  { to: '/body', icon: 'body', label: 'Body' },
  { to: '/settings', icon: 'settings', label: 'Settings' }
]

function TabBar() {
  const { pathname } = useLocation()
  if (pathname === '/workout' || pathname === '/program') return null
  return (
    <nav className="tabbar">
      {TABS.map(t => (
        <NavLink key={t.to} to={t.to} end className={({ isActive }) => 'tab' + (isActive ? ' on' : '')}>
          <Icon name={t.icon} /><span>{t.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}

// A workout in progress survives the app being closed (it is saved on every change). Opening
// the app goes straight back into it; one left untouched for hours gets a save/discard prompt.
function WorkoutGuard() {
  const nav = useNavigate()
  const active = useStore(s => s.active)
  const program = useStore(s => s.program)
  const { finishWorkout, discardWorkout, touchWorkout } = useStore.getState()
  const [stale, setStale] = useState(false)

  useEffect(() => {
    const check = launch => {
      const a = useStore.getState().active
      if (!a) return setStale(false)
      if (isStale(a)) setStale(true)
      else if (launch && window.location.pathname === '/') nav('/workout', { replace: true })
    }
    check(true)
    const onVisible = () => { if (document.visibilityState === 'visible') check(false) }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [nav])

  if (!stale || !active) return null
  const name = program?.days.find(d => d.id === active.dayId)?.name || 'your workout'
  const done = active.entries.reduce((n, e) => n + e.sets.filter(s => s.done).length, 0)
  const total = active.entries.reduce((n, e) => n + e.sets.length, 0)
  const keepGoing = () => { touchWorkout(); setStale(false); nav('/workout') }
  return (
    <Sheet open onClose={() => { touchWorkout(); setStale(false) }} title="Unfinished workout">
      <p>You started <b>{name}</b> on {fmtDate(active.date)} and didn't finish it. {done} of {total} sets are ticked.</p>
      {done > 0 && <>
        <button className="btn primary full" onClick={() => { finishWorkout(); setStale(false); nav('/') }}>Save what you logged</button>
        <p className="small muted">Saved under {fmtDate(active.date)}. Unticked sets don't count.</p>
      </>}
      <button className={'btn full ' + (done > 0 ? 'ghost danger' : 'primary')} onClick={() => { discardWorkout(); setStale(false); nav('/') }}>Discard workout</button>
      <button className="btn ghost full" onClick={keepGoing}>Keep going</button>
    </Sheet>
  )
}

function ScrollTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return null
}

export default function App() {
  useEffect(() => startSync(useStore, s => useSync.setState(s, true)), [])
  return (
    <BrowserRouter>
      <ScrollTop />
      <WorkoutGuard />
      <main>
        <Routes>
          <Route path="/" element={<Today />} />
          <Route path="/workout" element={<Workout />} />
          <Route path="/history" element={<History />} />
          <Route path="/exercise/:key" element={<ExerciseDetail />} />
          <Route path="/body" element={<Body />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/program" element={<ProgramEditor />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <TabBar />
    </BrowserRouter>
  )
}
