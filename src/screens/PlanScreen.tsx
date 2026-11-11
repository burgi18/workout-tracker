import { useState } from 'react'
import { DEFAULT_WEIGHT_STEP, db, weightStepOf, type Exercise } from '../db/schema'
import { fmtKg, snapKg } from '../lib/date'
import { addToTemplate, moveInTemplate, removeFromTemplate, saveExercise } from '../db/repo'
import { useDbQuery } from '../db/useDb'
import { Stepper } from '../components/Stepper'
import { Icon } from '../components/icons'
import { Sheet, Switch, useUi } from '../components/ui'

async function load() {
  const [templates, exercises] = await Promise.all([db.templates.toArray(), db.exercises.toArray()])
  return { templates: templates.sort((a, b) => a.id.localeCompare(b.id)), exercises }
}

type Editing = { mode: 'edit'; exercise: Exercise } | { mode: 'new' } | null

export function PlanScreen() {
  const ui = useUi()
  const data = useDbQuery(load, [])
  const [tab, setTab] = useState('A')
  const [editing, setEditing] = useState<Editing>(null)
  if (!data) return null

  const tpl = data.templates.find(t => t.id === tab) ?? data.templates[0]
  if (!tpl) return null
  const exMap = new Map(data.exercises.map(e => [e.id!, e]))

  const remove = async (ex: Exercise) => {
    const ok = await ui.confirm({
      title: `„${ex.name}“ entfernen?`,
      text: `Die Übung wird aus ${tpl.name} entfernt. Bisherige Trainings und der Verlauf bleiben erhalten.`,
      ok: 'Entfernen',
      danger: true,
    })
    if (ok) await removeFromTemplate(tpl.id, ex.id!)
  }

  return (
    <div className="stack">
      <header className="page-head">
        <h1>Plan</h1>
        <p className="muted">Änderungen gelten ab dem nächsten Training.</p>
      </header>

      <div className="seg" role="tablist" aria-label="Trainingstag">
        {data.templates.map(t => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)} style={{ '--c': t.color } as React.CSSProperties}>
            {t.name} · {t.subtitle}
          </button>
        ))}
      </div>

      <div className="stack-sm">
        {tpl.exerciseIds.length === 0 && <p className="muted card">Noch keine Übungen. Füge unten eine hinzu.</p>}
        {tpl.exerciseIds.map((id, i) => {
          const ex = exMap.get(id)
          if (!ex) return null
          return (
            <div key={id} className="card plan-row">
              <span className="ex-num">{i + 1}</span>
              <div className="grow">
                <strong>{ex.name}</strong>
                <p className="muted small">
                  {ex.sets} × {ex.repMin}–{ex.repMax} · ±{fmtKg(weightStepOf(ex))} kg
                  {ex.unilateral && ' · einarmig (links/rechts)'}
                </p>
              </div>
              <div className="plan-actions">
                <button className="icon-btn" aria-label="Nach oben" disabled={i === 0} onClick={() => moveInTemplate(tpl.id, i, -1)}>
                  <Icon name="up" size={22} />
                </button>
                <button className="icon-btn" aria-label="Nach unten" disabled={i === tpl.exerciseIds.length - 1} onClick={() => moveInTemplate(tpl.id, i, 1)}>
                  <Icon name="down" size={22} />
                </button>
                <button className="icon-btn" aria-label="Bearbeiten" onClick={() => setEditing({ mode: 'edit', exercise: ex })}>
                  <Icon name="edit" size={20} />
                </button>
                <button className="icon-btn danger-text" aria-label="Entfernen" onClick={() => remove(ex)}>
                  <Icon name="trash" size={20} />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <button className="btn primary block" onClick={() => setEditing({ mode: 'new' })}>
        <Icon name="plus" size={20} /> Übung hinzufügen
      </button>

      {editing && (
        <ExerciseSheet
          key={editing.mode === 'edit' ? editing.exercise.id : 'new'}
          editing={editing}
          templateId={tpl.id}
          templateName={tpl.name}
          available={data.exercises.filter(e => !tpl.exerciseIds.includes(e.id!))}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function ExerciseSheet({
  editing,
  templateId,
  templateName,
  available,
  onClose,
}: {
  editing: NonNullable<Editing>
  templateId: string
  templateName: string
  available: Exercise[]
  onClose: () => void
}) {
  const ui = useUi()
  const base: Exercise = editing.mode === 'edit' ? editing.exercise : { name: '', unilateral: false, sets: 2, repMin: 8, repMax: 12, weightStep: DEFAULT_WEIGHT_STEP }
  const [name, setName] = useState(base.name)
  const [unilateral, setUnilateral] = useState(base.unilateral)
  const [sets, setSets] = useState(base.sets)
  const [repMin, setRepMin] = useState(base.repMin)
  const [repMax, setRepMax] = useState(base.repMax)
  const [weightStep, setWeightStep] = useState(weightStepOf(base))

  const save = async () => {
    const trimmed = name.trim()
    if (!trimmed) return ui.toast('Bitte einen Namen eingeben')
    const next = { ...base, name: trimmed, unilateral, sets, repMin: Math.min(repMin, repMax), repMax: Math.max(repMin, repMax), weightStep }
    const id = await saveExercise(next)
    if (editing.mode === 'new') await addToTemplate(templateId, id)
    onClose()
  }

  return (
    <Sheet title={editing.mode === 'new' ? `Neue Übung für ${templateName}` : 'Übung bearbeiten'} onClose={onClose}>
      <div className="form">
        <label className="field">
          <span className="muted small">Name</span>
          <input className="text-input" value={name} onChange={e => setName(e.target.value)} placeholder="z. B. Schrägbankdrücken" autoFocus={editing.mode === 'new'} />
        </label>
        <Switch checked={unilateral} onChange={setUnilateral} label="Einarmig (links/rechts getrennt tracken)" />
        <div className="field">
          <span className="muted small">Arbeitssätze{unilateral ? ' (pro Seite)' : ''}</span>
          <Stepper label="Sätze" value={sets} step={1} min={1} max={10} snap={Math.round} onChange={setSets} />
        </div>
        <div className="two">
          <div className="field">
            <span className="muted small">Wdh. von</span>
            <Stepper label="Wiederholungen von" value={repMin} step={1} min={1} max={50} snap={Math.round} onChange={setRepMin} />
          </div>
          <div className="field">
            <span className="muted small">Wdh. bis</span>
            <Stepper label="Wiederholungen bis" value={repMax} step={1} min={1} max={50} snap={Math.round} onChange={setRepMax} />
          </div>
        </div>
        <div className="field">
          <span className="muted small">Gewichtsschritt (für +/− und „Gewicht erhöhen“)</span>
          <Stepper label="Gewichtsschritt" value={weightStep} step={0.5} min={0.5} max={20} unit="kg" format={fmtKg} snap={snapKg} onChange={setWeightStep} />
        </div>
        <button className="btn primary block" onClick={save}>
          Speichern
        </button>

        {editing.mode === 'new' && available.length > 0 && (
          <>
            <h4 className="section-title">Oder vorhandene Übung hinzufügen</h4>
            <div className="stack-sm">
              {available.map(e => (
                <button
                  key={e.id}
                  className="card pick"
                  onClick={async () => {
                    await addToTemplate(templateId, e.id!)
                    onClose()
                  }}
                >
                  <span>{e.name}</span>
                  <Icon name="plus" size={20} />
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </Sheet>
  )
}
