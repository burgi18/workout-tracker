import { db, type Exercise, type SetEntry, type WorkoutSession } from '../db/schema'
import {
  addSet,
  discardSession,
  finishSession,
  getSetting,
  lastPerformance,
  removeLastSet,
  setDone,
  sortSets,
  updateSet,
  type LastPerformance,
} from '../db/repo'
import { useDbQuery, useNow } from '../db/useDb'
import { fmtClock, fmtKg, fmtShort, snapKg } from '../lib/date'
import { primeAudio, useRestTimer, useWakeLock } from '../lib/device'
import { Stepper } from '../components/Stepper'
import { Icon } from '../components/icons'
import { useUi } from '../components/ui'

const INCREASE_KG = 2.5

export function WorkoutScreen({ session, onFinished }: { session: WorkoutSession; onFinished: (startedAt: number) => void }) {
  const ui = useUi()
  const rest = useRestTimer()
  useWakeLock()
  const now = useNow(1000)

  const data = useDbQuery(async () => {
    const [sets, exs, tpl] = await Promise.all([
      db.sets.where('sessionId').equals(session.id!).toArray(),
      Promise.all(session.exerciseIds.map(id => db.exercises.get(id))),
      db.templates.get(session.templateId),
    ])
    return { sets, exs: exs.filter((e): e is Exercise => !!e), tpl }
  }, [session.id])

  // Werte vom letzten Training: einmal pro Training laden (sind dann ja nicht mehr veränderlich)
  const lasts = useDbQuery(
    async () => {
      const entries = await Promise.all(session.exerciseIds.map(async id => [id, await lastPerformance(id)] as const))
      return new Map<number, LastPerformance | null>(entries)
    },
    [session.id],
    false,
  )
  const restSeconds = useDbQuery(() => getSetting<number>('restSeconds', 90), []) ?? 90

  if (!data || !lasts) return null
  const { sets, exs, tpl } = data
  const doneCount = sets.filter(s => s.done).length

  const toggle = async (s: SetEntry) => {
    primeAudio()
    await setDone(s.id!, !s.done)
    if (!s.done) rest.start(restSeconds)
  }

  const finish = async () => {
    const ok = await ui.confirm(
      doneCount === 0
        ? { title: 'Training verwerfen?', text: 'Es wurde noch kein Satz abgehakt. Das Training wird nicht gespeichert.', ok: 'Verwerfen', danger: true }
        : {
            title: 'Training beenden?',
            text:
              doneCount === sets.length
                ? `Alle ${sets.length} Sätze sind erledigt.`
                : `${doneCount} von ${sets.length} Sätzen abgehakt. Nicht abgehakte Sätze werden nicht gespeichert.`,
            ok: 'Beenden & speichern',
          },
    )
    if (!ok) return
    rest.stop()
    const result = await finishSession(session.id!)
    if (result === 'saved') {
      ui.toast('Training gespeichert')
      onFinished(session.startedAt)
    } else {
      ui.toast('Training verworfen')
    }
  }

  const discard = async () => {
    const ok = await ui.confirm({
      title: 'Training abbrechen?',
      text: 'Alle Eingaben dieses Trainings gehen verloren.',
      ok: 'Abbrechen & löschen',
      cancel: 'Weitermachen',
      danger: true,
    })
    if (!ok) return
    rest.stop()
    await discardSession(session.id!)
  }

  return (
    <div className="stack" style={{ '--c': tpl?.color ?? '#8ea2ff' } as React.CSSProperties}>
      <header className="page-head workout-head">
        <div>
          <h1>
            {tpl?.name ?? 'Training'} <span className="muted">· {tpl?.subtitle}</span>
          </h1>
          <p className="muted">
            {fmtClock((now - session.startedAt) / 1000)} · {doneCount}/{sets.length} Sätze
          </p>
        </div>
        <button className="btn primary compact" onClick={finish}>
          Beenden
        </button>
      </header>

      <div className="progress" aria-hidden="true">
        <div style={{ width: `${sets.length ? (doneCount / sets.length) * 100 : 0}%` }} />
      </div>

      {exs.map((ex, i) => (
        <ExerciseCard
          key={ex.id}
          index={i + 1}
          ex={ex}
          sets={sets.filter(s => s.exerciseId === ex.id).sort(sortSets)}
          last={lasts.get(ex.id!) ?? null}
          onToggle={toggle}
          onSessionId={session.id!}
        />
      ))}

      <button className="btn primary block big" onClick={finish}>
        Training beenden
      </button>
      <button className="btn link" onClick={discard}>
        Training abbrechen
      </button>

      {rest.active && (
        <div className="rest-bar" role="timer" aria-live="off">
          <div className="rest-fill" style={{ width: `${(rest.remaining / rest.total) * 100}%` }} />
          <div className="rest-row">
            <Icon name="timer" size={22} />
            <span className="rest-time">{fmtClock(rest.remaining)}</span>
            <span className="grow" />
            <button className="rest-btn" onClick={() => rest.adjust(-15)} aria-label="15 Sekunden weniger">
              −15
            </button>
            <button className="rest-btn" onClick={() => rest.adjust(15)} aria-label="15 Sekunden mehr">
              +15
            </button>
            <button className="rest-btn" onClick={rest.stop} aria-label="Pause überspringen">
              Skip
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ExerciseCard({
  index,
  ex,
  sets,
  last,
  onToggle,
  onSessionId,
}: {
  index: number
  ex: Exercise
  sets: SetEntry[]
  last: LastPerformance | null
  onToggle: (s: SetEntry) => void
  onSessionId: number
}) {
  const prevFor = (s: SetEntry) => last?.sets.find(p => p.setIndex === s.setIndex && p.side === s.side)

  // Progression: alle Sätze beim letzten Mal an der oberen Wiederholungsgrenze (12)
  const reached = !!last && last.sets.length > 0 && last.sets.every(p => p.reps >= ex.repMax)
  const open = sets.filter(s => !s.done)
  const lastMax = last ? Math.max(...last.sets.map(p => p.weight)) : 0
  const applied = open.length > 0 && open.every(s => s.weight > lastMax)

  const increase = async () => {
    for (const s of open) {
      const base = prevFor(s)?.weight ?? lastMax
      await updateSet(s.id!, { weight: snapKg(base + INCREASE_KG) })
    }
  }

  return (
    <section className="ex-card">
      <header className="ex-head">
        <span className="ex-num">{index}</span>
        <div className="grow">
          <h2>{ex.name}</h2>
          <p className="muted small">
            {ex.sets} × {ex.repMin}–{ex.repMax}
            {ex.unilateral && ' · einarmig, pro Seite'}
            {last && ` · zuletzt ${fmtShort(last.session.startedAt)}`}
          </p>
        </div>
      </header>

      {reached && open.length > 0 && (
        <div className={`hint ${applied ? 'ok' : ''}`}>
          <Icon name="arrowUp" size={18} />
          <span className="grow">{applied ? 'Gewicht erhöht' : `Gewicht erhöhen – letztes Mal überall ${ex.repMax} Wdh.`}</span>
          {!applied && (
            <button className="hint-btn" onClick={increase}>
              +{fmtKg(INCREASE_KG)} kg
            </button>
          )}
        </div>
      )}

      {sets.map(s => {
        const p = prevFor(s)
        return (
          <div key={s.id} className={`set ${s.done ? 'done' : ''}`}>
            <div className="set-head">
              <span className="set-label">
                Satz {s.setIndex}
                {s.side !== 'both' && <span className={`side side-${s.side}`}>{s.side === 'L' ? 'Links' : 'Rechts'}</span>}
              </span>
              <span className="muted small">{p ? `Zuletzt ${fmtKg(p.weight)} kg × ${p.reps}` : 'Noch keine Vorlage'}</span>
            </div>
            <div className="set-body">
              <Stepper
                label="Gewicht"
                value={s.weight}
                step={0.5}
                max={500}
                unit="kg"
                format={fmtKg}
                snap={snapKg}
                onChange={v => updateSet(s.id!, { weight: v })}
              />
              <Stepper
                label="Wiederholungen"
                value={s.reps}
                step={1}
                max={100}
                unit="Wdh"
                snap={Math.round}
                onChange={v => updateSet(s.id!, { reps: v })}
              />
              <button
                className={`check ${s.done ? 'on' : ''}`}
                aria-pressed={s.done}
                aria-label={s.done ? 'Satz zurücksetzen' : 'Satz abhaken'}
                onClick={() => onToggle(s)}
              >
                <Icon name="check" size={28} />
              </button>
            </div>
          </div>
        )
      })}

      <div className="ex-foot">
        <button className="btn ghost compact" onClick={() => addSet(onSessionId, ex.id!)}>
          <Icon name="plus" size={18} /> Satz
        </button>
        {Math.max(0, ...sets.map(s => s.setIndex)) > 1 && (
          <button className="btn ghost compact" onClick={() => removeLastSet(onSessionId, ex.id!)}>
            <Icon name="minus" size={18} /> Satz
          </button>
        )}
      </div>
    </section>
  )
}
