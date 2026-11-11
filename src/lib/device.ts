import { useEffect, useRef, useState } from 'react'
import { getSetting, setSetting } from '../db/repo'

/* ---------- Signal (Ton + Vibration) ---------- */

let audio: AudioContext | null = null

/** Muss nach einer Nutzer-Aktion (Tippen) aufgerufen werden, damit der Ton später spielen darf (iOS/Safari) */
export function primeAudio() {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    audio ??= new Ctor()
    if (audio.state === 'suspended') void audio.resume()
  } catch {
    /* Ton ist optional */
  }
}

export function signalRestOver() {
  navigator.vibrate?.([300, 120, 300, 120, 500])
  const ctx = audio
  if (!ctx) return
  try {
    ;[0, 0.28].forEach(delay => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = 880
      gain.gain.value = 0.15
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(ctx.currentTime + delay)
      osc.stop(ctx.currentTime + delay + 0.18)
    })
  } catch {
    /* Ton ist optional */
  }
}

/* ---------- Bildschirm anlassen ---------- */

interface WakeLockLike {
  release: () => Promise<void>
}

/** Verhindert, dass sich der Bildschirm während des Trainings abschaltet (wenn der Browser es kann) */
export function useWakeLock() {
  useEffect(() => {
    let lock: WakeLockLike | null = null
    let stopped = false
    const request = async () => {
      try {
        const nav = navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<WakeLockLike> } }
        lock = (await nav.wakeLock?.request('screen')) ?? null
      } catch {
        /* nicht unterstützt oder abgelehnt */
      }
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !stopped) void request()
    }
    void request()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stopped = true
      document.removeEventListener('visibilitychange', onVisible)
      try {
        void lock?.release()
      } catch {
        /* egal */
      }
    }
  }, [])
}

/* ---------- Pausentimer ---------- */

interface TimerState {
  endsAt: number
  total: number
}

/**
 * Pausentimer auf Basis einer Endzeit (stimmt also auch, wenn die Seite kurz im Hintergrund war).
 * Die Endzeit wird gespeichert, damit der Timer ein Neuladen der App übersteht.
 */
export function useRestTimer() {
  const [state, setState] = useState<TimerState | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const stateRef = useRef<TimerState | null>(null)
  stateRef.current = state

  const persist = (s: TimerState | null) => void setSetting('restTimer', s, true)

  useEffect(() => {
    void getSetting<TimerState | null>('restTimer', null).then(s => {
      if (s && s.endsAt > Date.now()) setState(s)
    })
  }, [])

  const running = state !== null
  useEffect(() => {
    if (!running) return
    const tick = () => {
      const n = Date.now()
      setNow(n)
      const s = stateRef.current
      if (s && n >= s.endsAt) {
        if (n - s.endsAt < 30000) signalRestOver()
        setState(null)
        persist(null)
      }
    }
    tick()
    const id = window.setInterval(tick, 250)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [running])

  const start = (seconds: number) => {
    const s = { endsAt: Date.now() + seconds * 1000, total: seconds }
    setNow(Date.now())
    setState(s)
    persist(s)
  }
  const adjust = (deltaSec: number) => {
    if (!state) return
    const s = { endsAt: Math.max(Date.now() + 1000, state.endsAt + deltaSec * 1000), total: Math.max(10, state.total + deltaSec) }
    setState(s)
    persist(s)
  }
  const stop = () => {
    setState(null)
    persist(null)
  }

  return {
    active: state !== null,
    remaining: state ? Math.max(0, Math.ceil((state.endsAt - now) / 1000)) : 0,
    total: state?.total ?? 0,
    start,
    adjust,
    stop,
  }
}
