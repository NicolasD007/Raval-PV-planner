import { useState } from 'react'
import { Menu, Sun, RefreshCw } from 'lucide-react'
import BottomNav from './components/BottomNav.jsx'
import SocUpdateSheet from './components/SocUpdateSheet.jsx'
import TodayPage from './pages/TodayPage.jsx'
import WeekPage from './pages/WeekPage.jsx'
import SocPage from './pages/SocPage.jsx'
import GoalsPage from './pages/GoalsPage.jsx'
import SetupPage from './pages/SetupPage.jsx'
import { useAppData } from './hooks/useAppData.js'

export default function App() {
  const [tab, setTab] = useState('today')
  const [socSheetOpen, setSocSheetOpen] = useState(false)
  const data = useAppData()

  return (
    <div className="app-shell">
      <header className="app-header">
        <button className="icon-btn" onClick={() => setTab('setup')} aria-label="Menü / Einstellungen">
          <Menu size={18} />
        </button>
        <span className="location">
          <Sun size={15} /> {data.setup.location.label}
        </span>
        <button
          className="icon-btn"
          onClick={data.reloadWeather}
          disabled={data.weatherLoading}
          aria-label="Wetterdaten aktualisieren"
        >
          <RefreshCw size={17} className={data.weatherLoading ? 'spin' : ''} />
        </button>
      </header>

      {tab === 'today' && <TodayPage data={data} onUpdateSoc={() => setSocSheetOpen(true)} />}
      {tab === 'week' && <WeekPage data={data} />}
      {tab === 'soc' && <SocPage data={data} onUpdateSoc={() => setSocSheetOpen(true)} />}
      {tab === 'goals' && <GoalsPage data={data} />}
      {tab === 'setup' && <SetupPage data={data} />}

      <BottomNav active={tab} onChange={setTab} />

      {socSheetOpen && (
        <SocUpdateSheet
          onClose={() => setSocSheetOpen(false)}
          onSubmit={(payload) => {
            data.updateSoc(payload)
            setSocSheetOpen(false)
          }}
        />
      )}
    </div>
  )
}
