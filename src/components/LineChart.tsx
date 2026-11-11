import { useState } from 'react'
import type { HistPoint } from '../lib/stats'
import { fmtFull, fmtKg, fmtShort } from '../lib/date'

const W = 360
const H = 230
const PAD = { l: 40, r: 16, t: 14, b: 28 }

function niceStep(range: number, target = 4): number {
  const raw = range / target
  const steps = [0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100]
  return steps.find(s => s >= raw) ?? 100
}

export const COLOR_WEIGHT = '#a78bfa'
export const COLOR_E1RM = '#34d399'

/** Liniendiagramm (Gewicht + geschätztes 1RM) als reines SVG, per Tippen/Ziehen lässt sich ein Punkt wählen */
export function LineChart({ points }: { points: HistPoint[] }) {
  const [selIdx, setSelIdx] = useState<number | null>(null)
  if (points.length === 0) return <p className="muted">Keine Daten im gewählten Zeitraum.</p>

  const values = points.flatMap(p => [p.weight, p.e1rm])
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const pad = Math.max(1, (hi - lo) * 0.12)
  const step = niceStep(hi - lo + 2 * pad)
  const yMin = Math.floor((lo - pad) / step) * step
  const yMax = Math.ceil((hi + pad) / step) * step
  const ticks: number[] = []
  for (let v = yMin; v <= yMax + 1e-9; v += step) ticks.push(v)

  const tMin = points[0].t
  const tMax = points[points.length - 1].t
  const x = (t: number) => (tMax === tMin ? (PAD.l + W - PAD.r) / 2 : PAD.l + ((t - tMin) / (tMax - tMin)) * (W - PAD.l - PAD.r))
  const y = (v: number) => PAD.t + (1 - (v - yMin) / (yMax - yMin)) * (H - PAD.t - PAD.b)

  const path = (key: 'weight' | 'e1rm') => points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ')

  const idx = selIdx !== null && selIdx < points.length ? selIdx : points.length - 1
  const sel = points[idx]

  const pick = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const vx = ((e.clientX - rect.left) / rect.width) * W
    let best = 0
    points.forEach((p, i) => {
      if (Math.abs(x(p.t) - vx) < Math.abs(x(points[best].t) - vx)) best = i
    })
    setSelIdx(best)
  }

  const labelIdx = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])]

  return (
    <div>
      <div className="chart-legend">
        <span>
          <i style={{ background: COLOR_WEIGHT }} /> Gewicht
        </span>
        <span>
          <i className="dash" style={{ borderColor: COLOR_E1RM }} /> Geschätztes 1RM
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="chart"
        role="img"
        aria-label="Verlauf von Gewicht und geschätztem 1RM"
        onPointerDown={pick}
        onPointerMove={e => e.buttons === 1 && pick(e)}
      >
        {ticks.map(v => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="grid" />
            <text x={PAD.l - 6} y={y(v) + 4} textAnchor="end" className="axis">
              {fmtKg(v)}
            </text>
          </g>
        ))}
        {labelIdx.map(i => (
          <text key={i} x={x(points[i].t)} y={H - 8} textAnchor={i === 0 && points.length > 1 ? 'start' : i === points.length - 1 && points.length > 1 ? 'end' : 'middle'} className="axis">
            {fmtShort(points[i].t)}
          </text>
        ))}
        <line x1={x(sel.t)} x2={x(sel.t)} y1={PAD.t} y2={H - PAD.b} className="cursor" />
        <path d={path('e1rm')} fill="none" stroke={COLOR_E1RM} strokeWidth="2.5" strokeDasharray="6 4" strokeLinejoin="round" strokeLinecap="round" />
        <path d={path('weight')} fill="none" stroke={COLOR_WEIGHT} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <g key={p.sessionId}>
            <circle cx={x(p.t)} cy={y(p.e1rm)} r={i === idx ? 5 : 3} fill={COLOR_E1RM} />
            <circle cx={x(p.t)} cy={y(p.weight)} r={i === idx ? 5 : 3} fill={COLOR_WEIGHT} />
          </g>
        ))}
      </svg>
      <div className="chart-readout" aria-live="polite">
        <strong>{fmtFull(sel.t)}</strong>
        <span>
          <i style={{ background: COLOR_WEIGHT }} /> {fmtKg(sel.weight)} kg
        </span>
        <span>
          <i className="dash" style={{ borderColor: COLOR_E1RM }} /> 1RM ≈ {fmtKg(Math.round(sel.e1rm * 2) / 2)} kg
        </span>
      </div>
    </div>
  )
}
