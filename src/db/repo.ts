import { db, type Exercise, type SetEntry, type Side, type WorkoutSession, type WorkoutTemplate } from './schema'
import { addDays, mondayOf, startOfDay } from '../lib/date'
import { NOTES_FLAG, importNotesOnce } from './importNotes'

/* ---------- Änderungs-Benachrichtigung (ersetzt Live-Queries) ---------- */

const listeners = new Set<() => void>()
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('workout-db') : null
if (channel) channel.onmessage = () => listeners.forEach(l => l())

export function notify() {
  listeners.forEach(l => l())
  channel?.postMessage(1)
}

export function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/* ---------- Einstellungen ---------- */

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key)
  return row ? (row.value as T) : fallback
}

export async function setSetting(key: string, value: unknown, silent = false) {
  await db.settings.put({ key, value })
  if (!silent) notify()
}

/* ---------- Sätze: Hilfen ---------- */

const SIDE_ORDER: Record<Side, number> = { both: 0, L: 0, R: 1 }
export const sortSets = (a: SetEntry, b: SetEntry) => a.setIndex - b.setIndex || SIDE_ORDER[a.side] - SIDE_ORDER[b.side]
const sidesFor = (e: Exercise): Side[] => (e.unilateral ? ['L', 'R'] : ['both'])

export interface LastPerformance {
  session: WorkoutSession
  sets: SetEntry[]
}

/** Letztes abgeschlossenes Training, in dem die Übung gemacht wurde */
export async function lastPerformance(exerciseId: number): Promise<LastPerformance | null> {
  const rows = (await db.sets.where('exerciseId').equals(exerciseId).toArray()).filter(s => s.done)
  if (!rows.length) return null
  const ids = [...new Set(rows.map(r => r.sessionId))]
  const sessions = (await Promise.all(ids.map(id => db.sessions.get(id)))).filter(
    (s): s is WorkoutSession => !!s && s.status === 'done',
  )
  if (!sessions.length) return null
  const session = sessions.reduce((a, b) => (b.startedAt > a.startedAt ? b : a))
  return { session, sets: rows.filter(r => r.sessionId === session.id).sort(sortSets) }
}

function pickPrefill(prev: SetEntry[], setIndex: number, side: Side): SetEntry | undefined {
  return (
    prev.find(s => s.setIndex === setIndex && s.side === side) ??
    [...prev].reverse().find(s => s.side === side) ??
    prev[prev.length - 1]
  )
}

/* ---------- Training ---------- */

export async function getActiveSession(): Promise<WorkoutSession | null> {
  const rows = await db.sessions.where('status').equals('active').toArray()
  return rows.sort((a, b) => b.startedAt - a.startedAt)[0] ?? null
}

/** Welcher Tag ist als Nächstes dran? Abwechselnd A/B nach dem letzten abgeschlossenen Training. */
export async function suggestedTemplate(): Promise<string> {
  const done = await db.sessions.where('status').equals('done').toArray()
  if (!done.length) return 'A'
  const last = done.sort((a, b) => b.startedAt - a.startedAt)[0]
  return last.templateId === 'A' ? 'B' : 'A'
}

/** Startet ein Training. Sätze werden mit den Werten vom letzten Mal vorausgefüllt. */
export async function startSession(templateId: string): Promise<number> {
  const running = await getActiveSession()
  if (running) return running.id!
  const tpl = await db.templates.get(templateId)
  if (!tpl) throw new Error('Trainingstag nicht gefunden')
  const list = (await Promise.all(tpl.exerciseIds.map(id => db.exercises.get(id)))).filter(
    (e): e is Exercise => !!e,
  )
  const prefills = await Promise.all(list.map(e => lastPerformance(e.id!)))
  let sessionId = 0
  await db.transaction('rw', db.sessions, db.sets, async () => {
    sessionId = (await db.sessions.add({
      templateId,
      startedAt: Date.now(),
      status: 'active',
      exerciseIds: list.map(e => e.id!),
    })) as number
    const rows: SetEntry[] = []
    list.forEach((e, i) => {
      const prev = prefills[i]?.sets ?? []
      for (let n = 1; n <= e.sets; n++) {
        for (const side of sidesFor(e)) {
          const p = pickPrefill(prev, n, side)
          rows.push({
            sessionId,
            exerciseId: e.id!,
            setIndex: n,
            side,
            weight: p?.weight ?? 0,
            reps: p?.reps ?? Math.round((e.repMin + e.repMax) / 2),
            done: false,
          })
        }
      }
    })
    await db.sets.bulkAdd(rows)
  })
  notify()
  return sessionId
}

export async function updateSet(id: number, patch: Partial<Pick<SetEntry, 'weight' | 'reps'>>) {
  await db.sets.update(id, patch)
  notify()
}

export async function setDone(id: number, done: boolean) {
  await db.sets.update(id, { done, doneAt: done ? Date.now() : undefined })
  notify()
}

/** Zusätzlichen Satz (bei einarmigen Übungen für beide Seiten) anhängen, Werte vom letzten Satz übernehmen */
export async function addSet(sessionId: number, exerciseId: number) {
  const mine = (await db.sets.where('sessionId').equals(sessionId).toArray()).filter(r => r.exerciseId === exerciseId)
  const maxIdx = Math.max(0, ...mine.map(r => r.setIndex))
  const lastRows = mine.filter(r => r.setIndex === maxIdx)
  await db.sets.bulkAdd(
    lastRows.map(r => ({
      sessionId,
      exerciseId,
      setIndex: maxIdx + 1,
      side: r.side,
      weight: r.weight,
      reps: r.reps,
      done: false,
    })),
  )
  notify()
}

export async function removeLastSet(sessionId: number, exerciseId: number) {
  const mine = (await db.sets.where('sessionId').equals(sessionId).toArray()).filter(r => r.exerciseId === exerciseId)
  const maxIdx = Math.max(0, ...mine.map(r => r.setIndex))
  if (maxIdx <= 1) return
  await db.sets.bulkDelete(mine.filter(r => r.setIndex === maxIdx).map(r => r.id!))
  notify()
}

/**
 * Beendet das Training. Nur abgehakte Sätze werden gespeichert.
 * Dauer = Start bis zum zuletzt abgehakten Satz (so stimmt sie auch, wenn man das Beenden vergisst).
 */
export async function finishSession(id: number): Promise<'saved' | 'discarded'> {
  const rows = await db.sets.where('sessionId').equals(id).toArray()
  const done = rows.filter(r => r.done)
  const session = await db.sessions.get(id)
  if (!session || !done.length) {
    await discardSession(id)
    return 'discarded'
  }
  const end = Math.max(...done.map(r => r.doneAt ?? 0)) || Date.now()
  await db.transaction('rw', db.sessions, db.sets, async () => {
    await db.sets.bulkDelete(rows.filter(r => !r.done).map(r => r.id!))
    await db.sessions.update(id, {
      status: 'done',
      endedAt: end,
      durationSec: Math.max(60, Math.round((end - session.startedAt) / 1000)),
    })
  })
  notify()
  return 'saved'
}

export async function discardSession(id: number) {
  await db.transaction('rw', db.sessions, db.sets, async () => {
    const rows = await db.sets.where('sessionId').equals(id).toArray()
    await db.sets.bulkDelete(rows.map(r => r.id!))
    await db.sessions.delete(id)
  })
  notify()
}

/* ---------- Verlauf ---------- */

export async function loadHistory() {
  const [sessions, sets, exercises, templates] = await Promise.all([
    db.sessions.where('status').equals('done').toArray(),
    db.sets.toArray(),
    db.exercises.toArray(),
    db.templates.toArray(),
  ])
  const ids = new Set(sessions.map(s => s.id))
  return {
    sessions: sessions.sort((a, b) => a.startedAt - b.startedAt),
    sets: sets.filter(s => s.done && ids.has(s.sessionId)),
    exercises,
    templates,
  }
}

/* ---------- Plan bearbeiten ---------- */

export async function saveExercise(e: Omit<Exercise, 'id'> & { id?: number }): Promise<number> {
  const id = (await db.exercises.put(e)) as number
  notify()
  return id
}

async function changeTemplate(templateId: string, fn: (ids: number[]) => number[]) {
  const tpl = await db.templates.get(templateId)
  if (!tpl) return
  await db.templates.update(templateId, { exerciseIds: fn([...tpl.exerciseIds]) })
  notify()
}

export const addToTemplate = (templateId: string, exerciseId: number) =>
  changeTemplate(templateId, ids => (ids.includes(exerciseId) ? ids : [...ids, exerciseId]))

export const removeFromTemplate = (templateId: string, exerciseId: number) =>
  changeTemplate(templateId, ids => ids.filter(i => i !== exerciseId))

export const moveInTemplate = (templateId: string, index: number, dir: -1 | 1) =>
  changeTemplate(templateId, ids => {
    const j = index + dir
    if (j < 0 || j >= ids.length) return ids
    ;[ids[index], ids[j]] = [ids[j], ids[index]]
    return ids
  })

/* ---------- Seed: Trainingsplan + Beispieldaten ---------- */

const PLAN: { exercises: [string, boolean][]; templates: Omit<WorkoutTemplate, 'exerciseIds'>[]; split: number } = {
  exercises: [
    ['Butterfly', false],
    ['Kurzhantel-Bankdrücken', false],
    ['Latzug (Maschine)', false],
    ['Rudern eng', false],
    ['T-Bar-Rudern', false],
    ['Schulterheben am Kabel', true],
    ['Reverse Flys am Kabel', true],
    ['Beinbeuger', false],
    ['Beinstrecker', false],
    ['Wadenheben', false],
    ['Trizeps-Pushdowns am Kabelzug', false],
    ['Katanas', true],
    ['Dip-Maschine', false],
    ['Lateral Raises', false],
  ],
  templates: [
    { id: 'A', name: 'Tag A', subtitle: 'Torso', color: '#38bdf8' },
    { id: 'B', name: 'Tag B', subtitle: 'Limbs', color: '#fb923c' },
  ],
  split: 7,
}

export async function seedPlan() {
  await db.transaction('rw', db.exercises, db.templates, async () => {
    const ids: number[] = []
    for (const [name, unilateral] of PLAN.exercises) {
      ids.push((await db.exercises.add({ name, unilateral, sets: 2, repMin: 8, repMax: 12 })) as number)
    }
    await db.templates.bulkPut([
      { ...PLAN.templates[0], exerciseIds: ids.slice(0, PLAN.split) },
      { ...PLAN.templates[1], exerciseIds: ids.slice(PLAN.split) },
    ])
  })
}

/** Deterministischer Zufall, damit die Beispieldaten reproduzierbar sind */
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const DEMO_BASE: Record<string, [number, number]> = {
  // Name → [Startgewicht, Steigerung pro Stufe]
  Butterfly: [45, 2.5],
  'Kurzhantel-Bankdrücken': [24, 2],
  'Latzug (Maschine)': [55, 2.5],
  'Rudern eng': [50, 2.5],
  'T-Bar-Rudern': [40, 2.5],
  'Schulterheben am Kabel': [10, 1],
  'Reverse Flys am Kabel': [7.5, 0.5],
  Beinbeuger: [45, 2.5],
  Beinstrecker: [55, 2.5],
  Wadenheben: [70, 2.5],
  'Trizeps-Pushdowns am Kabelzug': [30, 2.5],
  Katanas: [12.5, 1],
  'Dip-Maschine': [50, 2.5],
  'Lateral Raises': [8, 1],
}

/** Legt ca. 8 Wochen Trainingshistorie an (Mo/Mi/Fr, abwechselnd A/B, ein paar ausgefallene Tage) */
export async function seedDemo(weeks = 8) {
  const [templates, exercises] = await Promise.all([db.templates.toArray(), db.exercises.toArray()])
  const exMap = new Map(exercises.map(e => [e.id!, e]))
  const rnd = mulberry32(42)
  const today = startOfDay(new Date())
  let next = 'A'
  const counter: Record<string, number> = { A: 0, B: 0 }

  for (let d = addDays(mondayOf(today), -7 * weeks); d < today; d = addDays(d, 1)) {
    const weekday = (d.getDay() + 6) % 7
    if (![0, 2, 4].includes(weekday) || rnd() < 0.15) continue
    const tpl = templates.find(t => t.id === next)
    next = next === 'A' ? 'B' : 'A'
    if (!tpl) continue
    const k = counter[tpl.id]++
    const startedAt = d.getTime() + (17 * 60 + Math.floor(rnd() * 60)) * 60000
    let t = startedAt
    const sets: Omit<SetEntry, 'sessionId'>[] = []

    for (const exId of tpl.exerciseIds) {
      const ex = exMap.get(exId)
      if (!ex) continue
      const [base, inc] = DEMO_BASE[ex.name] ?? [20, 2.5]
      const cycle = k + (exId % 5)
      const weight = base + inc * Math.floor(cycle / 5)
      const reps1 = 8 + (cycle % 5)
      for (let n = 1; n <= ex.sets; n++) {
        for (const side of sidesFor(ex)) {
          t += (rnd() * 40 + 110) * 1000
          const reps = n === 1 ? reps1 : Math.max(8, reps1 - (rnd() < 0.4 ? 1 : 0))
          sets.push({ exerciseId: exId, setIndex: n, side, weight, reps, done: true, doneAt: t })
        }
      }
    }
    await db.transaction('rw', db.sessions, db.sets, async () => {
      const sessionId = (await db.sessions.add({
        templateId: tpl.id,
        startedAt,
        endedAt: t,
        durationSec: Math.round((t - startedAt) / 1000),
        status: 'done',
        exerciseIds: [...tpl.exerciseIds],
        demo: true,
      })) as number
      await db.sets.bulkAdd(sets.map(s => ({ ...s, sessionId })))
    })
  }
  notify()
}

export async function removeDemo() {
  const demo = (await db.sessions.toArray()).filter(s => s.demo)
  const ids = new Set(demo.map(s => s.id))
  await db.transaction('rw', db.sessions, db.sets, async () => {
    const sets = (await db.sets.toArray()).filter(s => ids.has(s.sessionId))
    await db.sets.bulkDelete(sets.map(s => s.id!))
    await db.sessions.bulkDelete([...ids] as number[])
  })
  notify()
}

export async function countDemo() {
  return (await db.sessions.toArray()).filter(s => s.demo).length
}

/** Beim allerersten Start: Plan anlegen. Danach (einmalig) die Trainings aus den Notizen übernehmen. */
export async function ensureSeeded() {
  if (!(await getSetting('seeded', false))) {
    if ((await db.templates.count()) === 0) await seedPlan()
    await db.settings.put({ key: 'seeded', value: true })
  }
  await importNotesOnce()
}

/** Alles löschen, Plan auf Standard zurücksetzen (ohne Beispieldaten) */
export async function resetAll() {
  await db.transaction('rw', [db.exercises, db.templates, db.sessions, db.sets, db.settings], async () => {
    await Promise.all([db.exercises.clear(), db.templates.clear(), db.sessions.clear(), db.sets.clear(), db.settings.clear()])
  })
  await seedPlan()
  await db.settings.bulkPut([
    { key: 'seeded', value: true },
    { key: NOTES_FLAG, value: true },
  ])
  notify()
}

/* ---------- Export / Import ---------- */

const TRANSIENT_SETTINGS = new Set(['restTimer'])

export async function exportAll() {
  const [exercises, templates, sessions, sets, settings] = await Promise.all([
    db.exercises.toArray(),
    db.templates.toArray(),
    db.sessions.toArray(),
    db.sets.toArray(),
    db.settings.toArray(),
  ])
  return {
    app: 'workout-tracker',
    version: 1,
    exportedAt: new Date().toISOString(),
    data: { exercises, templates, sessions, sets, settings: settings.filter(s => !TRANSIENT_SETTINGS.has(s.key)) },
  }
}

type Backup = Awaited<ReturnType<typeof exportAll>>

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const isNum = (v: unknown) => typeof v === 'number' && Number.isFinite(v)

/** Prüft eine Backup-Datei. Wirft einen verständlichen Fehler, wenn sie nicht passt. */
export function parseBackup(raw: unknown): Backup {
  if (!isObj(raw) || raw.app !== 'workout-tracker' || raw.version !== 1 || !isObj(raw.data)) {
    throw new Error('Das ist keine gültige Backup-Datei dieser App.')
  }
  const d = raw.data
  for (const key of ['exercises', 'templates', 'sessions', 'sets', 'settings']) {
    if (!Array.isArray(d[key])) throw new Error(`Backup unvollständig (${key} fehlt).`)
  }
  const exercises = (d.exercises as unknown[]).filter(
    e => isObj(e) && isNum(e.id) && typeof e.name === 'string' && typeof e.unilateral === 'boolean',
  ) as unknown as Exercise[]
  const templates = (d.templates as unknown[]).filter(
    t => isObj(t) && typeof t.id === 'string' && Array.isArray(t.exerciseIds),
  ) as unknown as WorkoutTemplate[]
  const sessions = (d.sessions as unknown[]).filter(
    s => isObj(s) && isNum(s.id) && isNum(s.startedAt) && typeof s.templateId === 'string' && Array.isArray(s.exerciseIds),
  ) as unknown as WorkoutSession[]
  const sessionIds = new Set(sessions.map(s => s.id))
  const sets = (d.sets as unknown[]).filter(
    s =>
      isObj(s) &&
      isNum(s.id) &&
      isNum(s.sessionId) &&
      sessionIds.has(s.sessionId as number) &&
      isNum(s.exerciseId) &&
      isNum(s.weight) &&
      isNum(s.reps) &&
      isNum(s.setIndex),
  ) as unknown as SetEntry[]
  const settings = (d.settings as unknown[]).filter(
    s => isObj(s) && typeof s.key === 'string' && !TRANSIENT_SETTINGS.has(s.key),
  ) as unknown as Backup['data']['settings']
  if (!templates.length) throw new Error('Backup enthält keinen Trainingsplan.')
  return { app: 'workout-tracker', version: 1, exportedAt: String(raw.exportedAt ?? ''), data: { exercises, templates, sessions, sets, settings } }
}

export async function importAll(backup: Backup) {
  const { exercises, templates, sessions, sets, settings } = backup.data
  await db.transaction('rw', [db.exercises, db.templates, db.sessions, db.sets, db.settings], async () => {
    await Promise.all([db.exercises.clear(), db.templates.clear(), db.sessions.clear(), db.sets.clear(), db.settings.clear()])
    await db.exercises.bulkPut(exercises)
    await db.templates.bulkPut(templates)
    await db.sessions.bulkPut(sessions)
    await db.sets.bulkPut(sets)
    await db.settings.bulkPut(settings)
    await db.settings.put({ key: 'seeded', value: true })
    await db.settings.put({ key: NOTES_FLAG, value: true })
  })
  notify()
}
