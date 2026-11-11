import { useState } from 'react'
import { getActiveSession } from './db/repo'
import { useDbQuery } from './db/useDb'
import { Icon, type IconName } from './components/icons'
import { UiProvider } from './components/ui'
import { StartScreen } from './screens/StartScreen'
import { WorkoutScreen } from './screens/WorkoutScreen'
import { CalendarScreen } from './screens/CalendarScreen'
import { ProgressScreen } from './screens/ProgressScreen'
import { PlanScreen } from './screens/PlanScreen'
import { SettingsScreen } from './screens/SettingsScreen'

type Tab = 'train' | 'calendar' | 'progress' | 'plan' | 'settings'

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'train', label: 'Training', icon: 'dumbbell' },
  { id: 'calendar', label: 'Kalender', icon: 'calendar' },
  { id: 'progress', label: 'Verlauf', icon: 'chart' },
  { id: 'plan', label: 'Plan', icon: 'list' },
  { id: 'settings', label: 'Mehr', icon: 'sliders' },
]

export default function App() {
  const [tab, setTab] = useState<Tab>('train')
  // Nach dem Beenden eines Trainings springt der Kalender auf dessen Tag
  const [calendarDay, setCalendarDay] = useState<number | undefined>()
  const active = useDbQuery(getActiveSession, [])

  if (active === undefined) return null

  const open = (t: Tab) => {
    if (t === 'calendar') setCalendarDay(undefined)
    setTab(t)
  }

  return (
    <UiProvider>
      <main className="screen">
        {tab === 'train' &&
          (active ? (
            <WorkoutScreen
              key={active.id}
              session={active}
              onFinished={startedAt => {
                setCalendarDay(startedAt)
                setTab('calendar')
              }}
            />
          ) : (
            <StartScreen goSettings={() => setTab('settings')} />
          ))}
        {tab === 'calendar' && <CalendarScreen key={calendarDay ?? 'now'} initial={calendarDay} />}
        {tab === 'progress' && <ProgressScreen />}
        {tab === 'plan' && <PlanScreen />}
        {tab === 'settings' && <SettingsScreen />}
      </main>

      <nav className="tabs" aria-label="Hauptnavigation">
        {TABS.map(t => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} aria-current={tab === t.id ? 'page' : undefined} onClick={() => open(t.id)}>
            <span className="tab-icon">
              <Icon name={t.icon} size={24} />
              {t.id === 'train' && active && <i className="live-dot" aria-label="Training läuft" />}
            </span>
            {t.label}
          </button>
        ))}
      </nav>
    </UiProvider>
  )
}
