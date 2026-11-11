import { useMemo, useState } from 'react'
import { loadHistory } from '../db/repo'
import { useDbQuery } from '../db/useDb'
import { exerciseHistory } from '../lib/stats'
import { fmtKg } from '../lib/date'
import { LineChart } from '../components/LineChart'

type Range = 'w8' | 'm6' | 'all'
const RANGES: { id: Range; label: string; days: number }[] = [
  { id: 'w8', label: '8 Wochen', days: 56 },
  { id: 'm6', label: '6 Monate', days: 183 },
  { id: 'all', label: 'Alle', days: 0 },
]

export function ProgressScreen() {
  const data = useDbQuery(loadHistory, [])
  const [exId, setExId] = useState<number | null>(null)
  const [range, setRange] = useState<Range>('all')

  const options = useMemo(() => {
    if (!data) return []
    const used = new Set(data.sets.map(s => s.exerciseId))
    // Reihenfolge wie im Plan (A, dann B), danach alles andere
    const order = [...data.templates].sort((a, b) => a.id.localeCompare(b.id)).flatMap(t => t.exerciseIds)
    const rest = data.exercises.map(e => e.id!).filter(id => !order.includes(id))
    return [...order, ...rest].filter(id => used.has(id))
  }, [data])

  if (!data) return null
  if (options.length === 0) {
    return (
      <div className="stack">
        <header className="page-head">
          <h1>Verlauf</h1>
        </header>
        <p className="muted card">Sobald du ein Training abgeschlossen hast, erscheint hier der Verlauf pro Übung.</p>
      </div>
    )
  }

  const currentId = exId !== null && options.includes(exId) ? exId : options[0]
  const names = new Map(data.exercises.map(e => [e.id!, e.name]))
  const all = exerciseHistory(currentId, data.sessions, data.sets)
  const days = RANGES.find(r => r.id === range)!.days
  const cutoff = days ? Date.now() - days * 86400000 : 0
  const points = all.filter(p => p.t >= cutoff)

  const bestW = points.length ? Math.max(...points.map(p => p.weight)) : 0
  const bestR = points.length ? Math.max(...points.map(p => p.e1rm)) : 0
  const delta = points.length > 1 ? points[points.length - 1].e1rm - points[0].e1rm : 0

  return (
    <div className="stack">
      <header className="page-head">
        <h1>Verlauf</h1>
      </header>

      <label className="field">
        <span className="muted small">Übung</span>
        <select className="select" value={currentId} onChange={e => setExId(Number(e.target.value))}>
          {options.map(id => (
            <option key={id} value={id}>
              {names.get(id) ?? `Übung ${id}`}
            </option>
          ))}
        </select>
      </label>

      <div className="seg" role="tablist" aria-label="Zeitraum">
        {RANGES.map(r => (
          <button key={r.id} role="tab" aria-selected={range === r.id} className={range === r.id ? 'on' : ''} onClick={() => setRange(r.id)}>
            {r.label}
          </button>
        ))}
      </div>

      <section className="card">
        <LineChart key={`${currentId}-${range}`} points={points} />
      </section>

      <section className="stats">
        <div className="card stat">
          <span className="muted small">Bestes Gewicht</span>
          <strong>{points.length ? `${fmtKg(bestW)} kg` : '–'}</strong>
        </div>
        <div className="card stat">
          <span className="muted small">Bestes 1RM (geschätzt)</span>
          <strong>{points.length ? `${fmtKg(Math.round(bestR * 2) / 2)} kg` : '–'}</strong>
        </div>
        <div className="card stat">
          <span className="muted small">Trainings</span>
          <strong>{points.length}</strong>
        </div>
        <div className="card stat">
          <span className="muted small">Entwicklung 1RM</span>
          <strong className={delta > 0 ? 'up' : ''}>
            {points.length > 1 ? `${delta > 0 ? '+' : ''}${fmtKg(Math.round(delta * 2) / 2)} kg` : '–'}
          </strong>
        </div>
      </section>
      <p className="muted small">
        Gewicht = schwerster abgehakter Satz je Training. 1RM geschätzt nach Epley: Gewicht × (1 + Wdh ÷ 30).
      </p>
    </div>
  )
}
