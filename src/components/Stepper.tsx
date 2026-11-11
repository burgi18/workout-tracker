import { useState } from 'react'
import { Icon } from './icons'

interface Props {
  value: number
  onChange: (v: number) => void
  step: number
  min?: number
  max?: number
  unit?: string
  label: string
  /** Anzeige, z. B. Komma statt Punkt */
  format?: (v: number) => string
  /** Eingaben auf erlaubte Werte runden (z. B. 0,5-kg-Schritte) */
  snap?: (v: number) => number
}

/** [−] Wert [+] mit großen Tasten. Der Wert lässt sich auch direkt antippen und eintippen. */
export function Stepper({ value, onChange, step, min = 0, max = 999, unit, label, format = String, snap = v => v }: Props) {
  const [text, setText] = useState<string | null>(null)
  const clamp = (v: number) => Math.min(max, Math.max(min, snap(v)))

  const commit = () => {
    if (text === null) return
    const n = parseFloat(text.replace(',', '.'))
    setText(null)
    if (Number.isFinite(n)) onChange(clamp(n))
  }

  return (
    <div className="stepper">
      <button type="button" className="step-btn" aria-label={`${label} verringern`} onClick={() => onChange(clamp(value - step))}>
        <Icon name="minus" size={20} />
      </button>
      <label className="step-val">
        <input
          inputMode="decimal"
          aria-label={label}
          value={text ?? format(value)}
          onFocus={e => e.currentTarget.select()}
          onChange={e => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
        />
        {unit && <span className="unit">{unit}</span>}
      </label>
      <button type="button" className="step-btn" aria-label={`${label} erhöhen`} onClick={() => onChange(clamp(value + step))}>
        <Icon name="plus" size={20} />
      </button>
    </div>
  )
}
