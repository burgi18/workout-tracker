import { useEffect, useState } from 'react'
import { subscribe } from './repo'

/**
 * Lädt Daten asynchron aus IndexedDB und lädt bei jeder Änderung (notify) neu.
 * live=false: nur beim Mounten bzw. wenn sich deps ändern.
 * Rückgabe ist undefined, solange noch nichts geladen wurde.
 */
export function useDbQuery<T>(fn: () => Promise<T>, deps: unknown[] = [], live = true): T | undefined {
  const [value, setValue] = useState<T>()
  const [tick, setTick] = useState(0)

  useEffect(() => (live ? subscribe(() => setTick(t => t + 1)) : undefined), [live])

  useEffect(() => {
    let alive = true
    fn()
      .then(v => {
        if (alive) setValue(v)
      })
      .catch(err => console.error(err))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps])

  return value
}

/** Aktuelle Zeit, aktualisiert im Intervall */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}
