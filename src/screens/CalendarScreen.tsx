import { useMemo, useState } from 'react'
import type { Exercise, SetEntry, WorkoutSession, WorkoutTemplate } from '../db/schema'
import { discardSession, loadHistory, sortSets } from '../db/repo'
import { useDbQuery } from '../db/useDb'
import {
  WEEKDAYS,
  addDays,
  dayKey,
  fmtDayLong,
  fmtDuration,
  fmtKg,
  fmtMonth,
  fmtTime,
  isoWeek,
  mondayOf,
  monthGrid,
  parseKey,
} from '../lib/date'
import { Icon } from '../components/icons'
import { useUi } from '../components/ui'

export function CalendarScreen({ initial }: { initial?: number }) {
  const data = useDbQuery(loadHistory, [])
  const [cursor, setCursor] = useState(() => {
    const d = new Date(initial ?? Date.now())
    return { y: d.getFullYear(), m: d.getMonth() }
  })
  const [sel, setSel] = useState(() => dayKey(initial ?? Date.now()))

  const byDay = useMemo(() => {
    const map = new Map<string, WorkoutSession[]>()
    for (const s of data?.sessions ?? []) {
      const k = dayKey(s.startedAt)
      map.set(k, [...(map.get(k) ?? []), s])
    }
    return map
  }, [data])

  if (!data) return null

  const colors = new Map(data.templates.map(t => [t.id, t.color]))
  const templates = [...data.templates].sort((a, b) => a.id.localeCompare(b.id))
  const todayKey = dayKey(Date.now())
  const cells = monthGrid(cursor.y, cursor.m)
  const weeks: Date[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))

  const go = (delta: number) => {
    const d = new Date(cursor.y, cursor.m + delta, 1)
    setCursor({ y: d.getFullYear(), m: d.getMonth() })
  }
  const goToday = () => {
    const d = new Date()
    setCursor({ y: d.getFullYear(), m: d.getMonth() })
    setSel(dayKey(d))
  }

  const monthCount = data.sessions.filter(s => {
    const d = new Date(s.startedAt)
    return d.getFullYear() === cursor.y && d.getMonth() === cursor.m
  }).length

  const selSessions = byDay.get(sel) ?? []
  const exMap = new Map(data.exercises.map(e => [e.id!, e]))

  return (
    <div className="stack">
      <header className="page-head">
        <h1>Kalender</h1>
      </header>

      <section className="card">
        <div className="cal-nav">
          <button className="icon-btn" aria-label="Vorheriger Monat" onClick={() => go(-1)}>
            <Icon name="left" />
          </button>
          <div className="cal-title">
            <strong>{fmtMonth(cursor.y, cursor.m)}</strong>
            <span className="muted small">
              {monthCount} {monthCount === 1 ? 'Training' : 'Trainings'}
            </span>
          </div>
          <button className="icon-btn" aria-label="Nächster Monat" onClick={() => go(1)}>
            <Icon name="right" />
          </button>
        </div>

        <div className="cal-grid" role="grid" aria-label={fmtMonth(cursor.y, cursor.m)}>
          {WEEKDAYS.map(w => (
            <div key={w} className="cal-wd">
              {w}
            </div>
          ))}
          {cells.map(d => {
            const k = dayKey(d)
            const sessions = byDay.get(k) ?? []
            const ids = [...new Set(sessions.map(s => s.templateId))].sort()
            const style = { '--c1': colors.get(ids[0]), '--c2': colors.get(ids[1] ?? ids[0]) } as React.CSSProperties
            return (
              <button
                key={k}
                style={style}
                className={[
                  'day',
                  d.getMonth() !== cursor.m ? 'out' : '',
                  k === todayKey ? 'today' : '',
                  k === sel ? 'sel' : '',
                  ids.length ? `has has-${Math.min(2, ids.length)}` : '',
                ].join(' ')}
                aria-label={`${fmtDayLong(d)}${sessions.length ? `, ${sessions.length} Training` : ''}`}
                aria-pressed={k === sel}
                onClick={() => setSel(k)}
              >
                {d.getDate()}
              </button>
            )
          })}
        </div>

        <div className="legend">
          {templates.map(t => (
            <span key={t.id}>
              <i style={{ background: t.color }} /> {t.name} · {t.subtitle}
            </span>
          ))}
          <span>
            <i className="ring" /> Heute
          </span>
        </div>
        <button className="btn ghost compact today-btn" onClick={goToday}>
          Heute
        </button>
      </section>

      <section className="stack-sm">
        <h2 className="section-title">{fmtDayLong(parseKey(sel))}</h2>
        {selSessions.length === 0 ? (
          <p className="muted card">Kein Training an diesem Tag.</p>
        ) : (
          selSessions.map(s => (
            <SessionDetail
              key={s.id}
              session={s}
              template={data.templates.find(t => t.id === s.templateId)}
              sets={data.sets.filter(x => x.sessionId === s.id)}
              exercises={exMap}
            />
          ))
        )}
      </section>

      <section className="card">
        <h2 className="section-title">Wochenübersicht</h2>
        <div className="weeks">
          {weeks.map(w => {
            const mon = mondayOf(w[0])
            const next = addDays(mon, 7)
            const sessions = data.sessions.filter(s => s.startedAt >= mon.getTime() && s.startedAt < next.getTime())
            const sun = addDays(mon, 6)
            const current = todayKey >= dayKey(mon) && todayKey <= dayKey(sun)
            return (
              <div key={dayKey(mon)} className={`week ${current ? 'current' : ''}`}>
                <div className="week-label">
                  <strong>KW {isoWeek(mon)}</strong>
                  <span className="muted small">
                    {mon.getDate()}.{mon.getMonth() + 1}. – {sun.getDate()}.{sun.getMonth() + 1}.
                  </span>
                </div>
                <div className="week-pips">
                  {sessions.map(s => (
                    <i key={s.id} style={{ background: colors.get(s.templateId) }} title={`${s.templateId}`} />
                  ))}
                </div>
                <div className="week-count">{sessions.length}</div>
              </div>
            )
          })}
        </div>
        <p className="muted small">Zahl = Trainings in der Woche (KW, Montag bis Sonntag).</p>
      </section>
    </div>
  )
}

/* ---------- Details eines Trainings ---------- */

function SessionDetail({
  session,
  template,
  sets,
  exercises,
}: {
  session: WorkoutSession
  template?: WorkoutTemplate
  sets: SetEntry[]
  exercises: Map<number, Exercise>
}) {
  const ui = useUi()
  const color = template?.color ?? '#8ea2ff'

  const remove = async () => {
    const ok = await ui.confirm({
      title: 'Training löschen?',
      text: `${template?.name ?? 'Training'} vom ${parseKey(dayKey(session.startedAt)).toLocaleDateString('de-AT')} wird samt aller Sätze gelöscht.`,
      ok: 'Löschen',
      danger: true,
    })
    if (ok) await discardSession(session.id!)
  }

  const order = session.exerciseIds.filter(id => sets.some(s => s.exerciseId === id))

  return (
    <article className="card session" style={{ '--c': color } as React.CSSProperties}>
      <header className="session-head">
        <div className="grow">
          <h3>
            <i className="dot" /> {template?.name ?? 'Training'} <span className="muted">· {template?.subtitle}</span>
          </h3>
          <p className="muted small">
            {fmtTime(session.startedAt)} Uhr{session.durationSec ? ` · ${fmtDuration(session.durationSec)}` : ''}
            {session.demo ? ' · Beispiel' : ''}
          </p>
        </div>
        <button className="icon-btn" aria-label="Training löschen" onClick={remove}>
          <Icon name="trash" size={22} />
        </button>
      </header>

      {order.map(id => {
        const ex = exercises.get(id)
        const rows = sets.filter(s => s.exerciseId === id).sort(sortSets)
        return (
          <div key={id} className="log-ex">
            <div className="log-name">{ex?.name ?? 'Gelöschte Übung'}</div>
            {rows.some(r => r.side !== 'both') ? (
              (['L', 'R'] as const).map(side => (
                <div key={side} className="log-sets">
                  <span className="log-side">{side === 'L' ? 'Links' : 'Rechts'}</span>
                  {rows.filter(r => r.side === side).map(r => (
                    <span key={r.id} className="chip">
                      {fmtKg(r.weight)} × {fmtKg(r.reps)}
                    </span>
                  ))}
                </div>
              ))
            ) : (
              <div className="log-sets">
                {rows.map(r => (
                  <span key={r.id} className="chip">
                    {fmtKg(r.weight)} × {fmtKg(r.reps)}
                  </span>
                ))}
              </div>
            )}
          </div>
        )
      })}
      <p className="muted small">Angaben: kg × Wiederholungen</p>
    </article>
  )
}
