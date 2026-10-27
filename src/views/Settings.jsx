import ProgramSection from './settings/ProgramSection.jsx'
import BlockSection from './settings/BlockSection.jsx'
import AccountSection from './settings/AccountSection.jsx'
import DataSection from './settings/DataSection.jsx'

export default function Settings() {
  return (
    <div className="page">
      <header className="top"><h1>Settings</h1></header>
      <ProgramSection />
      <BlockSection />
      <AccountSection />
      <DataSection />
      <p className="muted small center">Overload · built on <a className="link" href="https://github.com/DuarteSantos8/openGym">openGym</a> (AGPL-3.0)</p>
    </div>
  )
}
