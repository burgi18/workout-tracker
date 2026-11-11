export const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

const pad = (n: number) => String(n).padStart(2, '0')
const LOCALE = 'de-AT'

/** Lokaler Tagesschlüssel 'YYYY-MM-DD' */
export function dayKey(d: Date | number): string {
  const x = typeof d === 'number' ? new Date(d) : d
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`
}

export function parseKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function startOfDay(d: Date | number): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

export function mondayOf(d: Date | number): Date {
  const x = startOfDay(d)
  return addDays(x, -((x.getDay() + 6) % 7))
}

/** ISO-Kalenderwoche */
export function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7))
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return Math.ceil(((t.getTime() - y0.getTime()) / 86400000 + 1) / 7)
}

/** Alle Tage der Kalenderansicht eines Monats (Wochen Mo–So, komplett aufgefüllt) */
export function monthGrid(year: number, month: number): Date[] {
  const start = mondayOf(new Date(year, month, 1))
  const end = addDays(mondayOf(new Date(year, month + 1, 0)), 6)
  const out: Date[] = []
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d)
  return out
}

export const fmtMonth = (y: number, m: number) =>
  new Date(y, m, 1).toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' })

export const fmtDayLong = (d: Date) =>
  d.toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' })

/** z. B. 11.11. */
export const fmtShort = (ts: number) => new Date(ts).toLocaleDateString(LOCALE, { day: 'numeric', month: 'numeric' })

export const fmtFull = (ts: number) =>
  new Date(ts).toLocaleDateString(LOCALE, { day: 'numeric', month: 'numeric', year: 'numeric' })

export const fmtTime = (ts: number) =>
  new Date(ts).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })

export function fmtDuration(sec: number): string {
  const m = Math.max(1, Math.round(sec / 60))
  if (m < 60) return `${m} Min`
  return `${Math.floor(m / 60)} Std ${pad(m % 60)} Min`
}

/** m:ss bzw. h:mm:ss */
export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`
}

/** 40 → "40", 42.5 → "42,5" */
export const fmtKg = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','))

export const snapKg = (n: number) => Math.round(n * 2) / 2
