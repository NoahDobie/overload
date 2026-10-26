import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom'
import { useStore } from './store.js'
import { startSync } from './lib/sync.js'
import { useSync } from './syncStatus.js'
import { Icon } from './components/ui.jsx'
import Today from './views/Today.jsx'
import Workout from './views/Workout.jsx'
import History from './views/History.jsx'
import ExerciseDetail from './views/ExerciseDetail.jsx'
import Body from './views/Body.jsx'
import Settings from './views/Settings.jsx'

const TABS = [
  { to: '/', icon: 'today', label: 'Today' },
  { to: '/history', icon: 'history', label: 'History' },
  { to: '/body', icon: 'body', label: 'Body' },
  { to: '/settings', icon: 'settings', label: 'Settings' }
]

function TabBar() {
  const { pathname } = useLocation()
  if (pathname === '/workout') return null
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
      <main>
        <Routes>
          <Route path="/" element={<Today />} />
          <Route path="/workout" element={<Workout />} />
          <Route path="/history" element={<History />} />
          <Route path="/exercise/:key" element={<ExerciseDetail />} />
          <Route path="/body" element={<Body />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <TabBar />
    </BrowserRouter>
  )
}
