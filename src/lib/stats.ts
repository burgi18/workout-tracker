import type { SetEntry, WorkoutSession } from '../db/schema'

/** Geschätztes 1RM nach Epley */
export const epley = (weight: number, reps: number) => (reps <= 1 ? weight : weight * (1 + reps / 30))

export interface HistPoint {
  sessionId: number
  t: number
  /** schwerstes Gewicht des Trainings */
  weight: number
  /** bestes geschätztes 1RM des Trainings */
  e1rm: number
}

/** Verlauf einer Übung: ein Punkt pro Training (nur abgehakte Sätze) */
export function exerciseHistory(exerciseId: number, sessions: WorkoutSession[], sets: SetEntry[]): HistPoint[] {
  const bySession = new Map<number, SetEntry[]>()
  for (const s of sets) {
    if (s.exerciseId !== exerciseId || !s.done || s.reps <= 0 || s.weight <= 0) continue
    const arr = bySession.get(s.sessionId) ?? []
    arr.push(s)
    bySession.set(s.sessionId, arr)
  }
  const out: HistPoint[] = []
  for (const ses of sessions) {
    const rows = bySession.get(ses.id!)
    if (!rows) continue
    out.push({
      sessionId: ses.id!,
      t: ses.startedAt,
      weight: Math.max(...rows.map(r => r.weight)),
      e1rm: Math.round(Math.max(...rows.map(r => epley(r.weight, r.reps))) * 10) / 10,
    })
  }
  return out.sort((a, b) => a.t - b.t)
}
