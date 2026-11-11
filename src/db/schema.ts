import Dexie, { type Table } from 'dexie'

/** 'both' = normale Übung, 'L'/'R' = einarmige Übung pro Seite */
export type Side = 'both' | 'L' | 'R'

export interface Exercise {
  id?: number
  name: string
  /** einarmig: Sätze werden pro Seite (links/rechts) getrackt */
  unilateral: boolean
  /** Anzahl Arbeitssätze (pro Seite) */
  sets: number
  repMin: number
  repMax: number
}

export interface WorkoutTemplate {
  /** 'A' | 'B' */
  id: string
  name: string
  subtitle: string
  color: string
  /** Reihenfolge der Übungen */
  exerciseIds: number[]
}

export interface WorkoutSession {
  id?: number
  templateId: string
  startedAt: number
  endedAt?: number
  durationSec?: number
  status: 'active' | 'done'
  /** Momentaufnahme der Übungsreihenfolge beim Start (Planänderungen wirken erst auf das nächste Training) */
  exerciseIds: number[]
  /** Beispieldaten, lassen sich in den Einstellungen entfernen */
  demo?: boolean
}

export interface SetEntry {
  id?: number
  sessionId: number
  exerciseId: number
  /** 1-basiert */
  setIndex: number
  side: Side
  weight: number
  reps: number
  done: boolean
  doneAt?: number
}

export interface Setting {
  key: string
  value: unknown
}

export const db = new Dexie('workout-tracker') as Dexie & {
  exercises: Table<Exercise, number>
  templates: Table<WorkoutTemplate, string>
  sessions: Table<WorkoutSession, number>
  sets: Table<SetEntry, number>
  settings: Table<Setting, string>
}

db.version(1).stores({
  exercises: '++id',
  templates: 'id',
  sessions: '++id, startedAt, status, templateId',
  sets: '++id, sessionId, exerciseId',
  settings: 'key',
})
