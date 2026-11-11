import { db, type Exercise, type SetEntry } from './schema'
import { dayKey } from '../lib/date'

/**
 * Einmaliger Import der Handy-Notizen (nur die Einträge mit Datum).
 * Format der Notizen war „Wdh × kg“. Sätze ohne Wiederholungszahl („x65“, „?“) sind weggelassen.
 * Läuft beim App-Start genau einmal (Flag in settings). Tage, an denen schon ein echtes Training
 * desselben Trainingstags gespeichert ist, werden übersprungen.
 */
export const NOTES_FLAG = 'importedNotes2026'

type Key = keyof typeof EXERCISES

/** Übungen der Notizen → Namen im Plan (erster Treffer gilt; sonst wird die Übung mit dem ersten Namen angelegt) */
const EXERCISES = {
  lat: { names: ['Latzug (Maschine)', 'Latzug'], unilateral: false },
  fly: { names: ['Butterfly', 'Flys'], unilateral: false },
  tbar: { names: ['T-Bar-Rudern', 'T-Bar'], unilateral: false },
  khBank: { names: ['Kurzhantel-Bankdrücken', 'KH-Bankdrücken'], unilateral: false },
  rudern: { names: ['Rudern eng'], unilateral: false },
  seitheben: { names: ['Schulterheben am Kabel', 'Seitheben am Kabel', 'Seitheben'], unilateral: true },
  revFly: { names: ['Reverse Flys am Kabel', 'Reverse Flys'], unilateral: true },
  beuger: { names: ['Beinbeuger'], unilateral: false },
  strecker: { names: ['Beinstrecker'], unilateral: false },
  waden: { names: ['Wadenheben', 'Waden'], unilateral: false },
  pushKabel: { names: ['Trizeps-Pushdowns am Kabelzug', 'Pushdowns'], unilateral: false },
  katanas: { names: ['Katanas'], unilateral: true },
  dip: { names: ['Dip-Maschine', 'Dip machine'], unilateral: false },
  preacher: { names: ['Preacher Curls'], unilateral: false },
  hammer: { names: ['Hammer Curls'], unilateral: false },
} satisfies Record<string, { names: string[]; unilateral: boolean }>

/** [Wdh, kg]; Wdh als [links, rechts], wenn die Seiten verschieden waren */
type NoteSet = [number | [number, number], number]

const NOTES: { date: [number, number, number]; templateId: 'A' | 'B'; ex: [Key, NoteSet[]][] }[] = [
  {
    date: [2026, 9, 22],
    templateId: 'A',
    ex: [
      ['lat', [[8, 70], [6, 70]]],
      ['fly', [[9.5, 30]]],
      ['tbar', [[7.5, 25], [6, 25]]],
      ['khBank', [[13, 8], [10, 8]]],
      ['rudern', [[7, 40], [6, 35]]],
      ['seitheben', [[8, 10]]],
      ['revFly', [[7, 10], [5, 10]]],
    ],
  },
  {
    date: [2026, 9, 29],
    templateId: 'B',
    ex: [
      ['beuger', [[9, 65], [7.5, 65]]],
      ['strecker', [[8, 65], [7, 65]]],
      ['waden', [[8, 69]]],
      ['pushKabel', [[8, 30], [7, 30]]],
      ['katanas', [[7, 10], [5, 10]]],
      ['dip', [[7, 65]]],
      ['preacher', [[7, 25]]],
    ],
  },
  {
    date: [2026, 10, 4],
    templateId: 'A',
    ex: [
      ['lat', [[8, 75], [8, 65]]],
      ['fly', [[4, 45], [5, 35]]],
      ['tbar', [[8, 27.5], [8, 25]]],
      ['khBank', [[10, 10], [8, 8]]],
      ['rudern', [[7, 35], [7.5, 30]]],
      ['seitheben', [[11, 10], [9, 10]]],
      ['revFly', [[6.5, 10], [4.5, 10]]],
    ],
  },
  {
    date: [2026, 10, 5],
    templateId: 'B',
    ex: [
      ['beuger', [[8, 70], [8, 65]]],
      ['strecker', [[8, 65], [8, 60]]],
      ['waden', [[8, 69], [9, 69]]],
      ['pushKabel', [[9, 30], [7, 30]]],
      ['katanas', [[7, 10], [[5, 6], 10]]],
      ['dip', [[10, 60]]],
      ['preacher', [[8, 25], [5, 22.5]]],
      ['hammer', [[6, 8], [7, 6]]],
    ],
  },
  {
    // in den Notizen „7.6.“, steht aber zwischen 5.10. und 8.10. → 7.10.
    date: [2026, 10, 7],
    templateId: 'A',
    ex: [
      ['lat', [[8.5, 75]]],
      ['fly', [[8.5, 35], [8, 30]]],
      ['tbar', [[7, 30], [7, 25]]],
      ['khBank', [[8, 10], [9, 8]]],
      ['rudern', [[8, 35]]],
      ['seitheben', [[10, 10], [8, 10]]],
      ['revFly', [[7, 10], [5.5, 10]]],
    ],
  },
  {
    date: [2026, 10, 8],
    templateId: 'B',
    ex: [
      ['beuger', [[7, 70], [8, 70]]],
      ['strecker', [[7, 65], [8, 60]]],
      ['waden', [[10, 69], [8, 69]]],
      ['pushKabel', [[8, 35], [6, 30]]],
      ['katanas', [[6, 10], [5, 10]]],
      ['dip', [[8, 65]]],
      ['preacher', [[8, 25], [7, 20]]],
      ['hammer', [[6, 8]]],
    ],
  },
  {
    date: [2026, 11, 9],
    templateId: 'B',
    ex: [
      ['pushKabel', [[12, 30], [8, 30]]],
      ['katanas', [[5, 10], [5, 10]]],
      ['dip', [[11, 65], [5, 65]]],
      ['preacher', [[9, 25], [7, 20]]],
      ['hammer', [[6, 8], [8, 6]]],
      ['beuger', [[8, 70], [9, 60]]],
      ['strecker', [[7, 65], [7, 55]]],
    ],
  },
]

const norm = (s: string) => s.trim().toLowerCase()

export async function importNotesOnce(): Promise<boolean> {
  if (await db.settings.get(NOTES_FLAG)) return false

  await db.transaction('rw', [db.exercises, db.sessions, db.sets, db.settings], async () => {
    // Beispieldaten würden sonst als „letztes Training“ die Vorbelegung verfälschen
    const demo = (await db.sessions.toArray()).filter(s => s.demo)
    if (demo.length) {
      const demoIds = new Set(demo.map(s => s.id))
      const demoSets = (await db.sets.toArray()).filter(s => demoIds.has(s.sessionId))
      await db.sets.bulkDelete(demoSets.map(s => s.id!))
      await db.sessions.bulkDelete(demo.map(s => s.id!))
    }

    const all = await db.exercises.toArray()
    const resolved = new Map<Key, Exercise>()
    const resolve = async (key: Key): Promise<Exercise> => {
      const hit = resolved.get(key)
      if (hit) return hit
      const def = EXERCISES[key]
      const wanted = def.names.map(norm)
      let ex = wanted.map(w => all.find(e => norm(e.name) === w)).find(Boolean)
      if (!ex) {
        ex = { name: def.names[0], unilateral: def.unilateral, sets: 2, repMin: 8, repMax: 12 }
        ex.id = (await db.exercises.add(ex)) as number
        all.push(ex)
      }
      resolved.set(key, ex)
      return ex
    }

    const existing = (await db.sessions.where('status').equals('done').toArray()).map(s => `${dayKey(s.startedAt)}|${s.templateId}`)

    for (const note of NOTES) {
      const [y, m, d] = note.date
      const startedAt = new Date(y, m - 1, d, 18, 0).getTime()
      if (existing.includes(`${dayKey(startedAt)}|${note.templateId}`)) continue

      const exercises = await Promise.all(note.ex.map(([k]) => resolve(k)))
      const sessionId = (await db.sessions.add({
        templateId: note.templateId,
        startedAt,
        status: 'done',
        exerciseIds: exercises.map(e => e.id!),
      })) as number

      const rows: SetEntry[] = []
      note.ex.forEach(([, sets], i) => {
        const ex = exercises[i]
        sets.forEach(([reps, weight], n) => {
          const base = { sessionId, exerciseId: ex.id!, setIndex: n + 1, weight, done: true, doneAt: startedAt }
          const [l, r] = Array.isArray(reps) ? reps : [reps, reps]
          if (ex.unilateral) {
            rows.push({ ...base, side: 'L', reps: l }, { ...base, side: 'R', reps: r })
          } else {
            rows.push({ ...base, side: 'both', reps: Math.min(l, r) })
          }
        })
      })
      await db.sets.bulkAdd(rows)
    }

    await db.settings.put({ key: NOTES_FLAG, value: true })
  })
  return true
}
