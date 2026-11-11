import { db } from '../db/schema'
import { countDemo, startSession, suggestedTemplate } from '../db/repo'
import { useDbQuery } from '../db/useDb'
import { fmtShort, mondayOf } from '../lib/date'
import { useUi } from '../components/ui'

async function load() {
  const [templates, exercises, suggested, done, demo] = await Promise.all([
    db.templates.toArray(),
    db.exercises.toArray(),
    suggestedTemplate(),
    db.sessions.where('status').equals('done').toArray(),
    countDemo(),
  ])
  const lastBy: Record<string, number> = {}
  for (const s of done) lastBy[s.templateId] = Math.max(lastBy[s.templateId] ?? 0, s.startedAt)
  const weekStart = mondayOf(new Date()).getTime()
  return {
    templates: templates.sort((a, b) => a.id.localeCompare(b.id)),
    names: new Map(exercises.map(e => [e.id!, e.name])),
    suggested,
    lastBy,
    weekCount: done.filter(s => s.startedAt >= weekStart).length,
    demo,
  }
}

export function StartScreen({ goSettings }: { goSettings: () => void }) {
  const ui = useUi()
  const data = useDbQuery(load, [])
  if (!data) return null

  const start = async (id: string, empty: boolean) => {
    if (empty) return ui.toast('Dieser Tag hat noch keine Übungen. Füge sie im Plan hinzu.')
    await startSession(id)
  }

  return (
    <div className="stack">
      <header className="page-head">
        <h1>Training</h1>
        <p className="muted">
          {data.weekCount === 0
            ? 'Diese Woche noch kein Training'
            : `Diese Woche: ${data.weekCount} ${data.weekCount === 1 ? 'Training' : 'Trainings'}`}
        </p>
      </header>

      {data.templates.map(t => {
        const isNext = t.id === data.suggested
        const last = data.lastBy[t.id]
        return (
          <button
            key={t.id}
            className={`start-card ${isNext ? 'next' : ''}`}
            style={{ '--c': t.color } as React.CSSProperties}
            onClick={() => start(t.id, t.exerciseIds.length === 0)}
          >
            <div className="start-top">
              <span className="start-title">
                {t.name} <span className="muted">· {t.subtitle}</span>
              </span>
              {isNext && <span className="pill">Als Nächstes</span>}
            </div>
            <div className="start-list">
              {t.exerciseIds.map(id => data.names.get(id)).filter(Boolean).join(' · ') || 'Keine Übungen'}
            </div>
            <div className="start-bottom">
              <span className="muted">{last ? `Zuletzt am ${fmtShort(last)}` : 'Noch nie trainiert'}</span>
              <span className="start-go">{t.name} starten →</span>
            </div>
          </button>
        )
      })}

      {data.demo > 0 && (
        <div className="notice">
          <p>
            Es sind <b>Beispieldaten</b> ({data.demo} Trainings der letzten Wochen) geladen, damit du den Kalender testen kannst.
          </p>
          <button className="btn ghost" onClick={goSettings}>
            Zu den Einstellungen
          </button>
        </div>
      )}
    </div>
  )
}
