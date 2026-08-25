import { Sun, CalendarDays, BatteryCharging, Flag, Settings } from 'lucide-react'

const TABS = [
  { id: 'today', label: 'Heute', icon: Sun },
  { id: 'week', label: 'Woche', icon: CalendarDays },
  { id: 'soc', label: 'SoC', icon: BatteryCharging },
  { id: 'goals', label: 'Ziele', icon: Flag },
  { id: 'setup', label: 'Setup', icon: Settings },
]

export default function BottomNav({ active, onChange }) {
  return (
    <nav className="bottom-nav" aria-label="Hauptnavigation">
      <div className="bottom-nav-inner">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = tab.id === active
          return (
            <button
              key={tab.id}
              type="button"
              className={`nav-btn${isActive ? ' active' : ''}`}
              onClick={() => onChange(tab.id)}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon size={20} strokeWidth={isActive ? 2.4 : 2} />
              {tab.label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
