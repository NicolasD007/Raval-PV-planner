import { useState } from 'react'
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

  const isOffline = data.weatherStale && !data.weatherLoading

  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="location">{data.setup.location.label}</span>
        <span className={`status-pill${isOffline ? ' offline' : ''}`}>
          {isOffline ? 'Wetterdaten nicht aktuell' : data.weatherLoading ? 'Aktualisiere…' : 'Live'}
        </span>
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
