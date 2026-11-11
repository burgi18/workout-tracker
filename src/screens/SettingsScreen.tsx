import { useEffect, useRef, useState } from 'react'
import { countDemo, exportAll, getSetting, importAll, parseBackup, removeDemo, resetAll, seedDemo, setSetting } from '../db/repo'
import { useDbQuery } from '../db/useDb'
import { dayKey, fmtClock } from '../lib/date'
import { isIOS, isStandalone, promptInstall, useCanInstall } from '../lib/pwa'
import { Stepper } from '../components/Stepper'
import { useUi } from '../components/ui'

export function SettingsScreen() {
  const ui = useUi()
  const rest = useDbQuery(() => getSetting<number>('restSeconds', 90), []) ?? 90
  const demo = useDbQuery(countDemo, []) ?? 0
  const canInstall = useCanInstall()
  const fileRef = useRef<HTMLInputElement>(null)
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void navigator.storage?.persisted?.().then(setPersisted)
  }, [])

  const backupFile = async () => {
    const json = JSON.stringify(await exportAll(), null, 2)
    return new File([json], `workout-backup-${dayKey(Date.now())}.json`, { type: 'application/json' })
  }

  const download = async () => {
    const file = await backupFile()
    const url = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10000)
    ui.toast('Backup exportiert')
  }

  const share = async () => {
    const file = await backupFile()
    try {
      await navigator.share({ files: [file], title: 'Workout-Backup' })
    } catch {
      /* abgebrochen */
    }
  }
  const canShare = typeof navigator.canShare === 'function' && typeof File !== 'undefined' && navigator.canShare({ files: [new File(['{}'], 'x.json', { type: 'application/json' })] })

  const onFile = async (file: File | undefined) => {
    if (!file) return
    try {
      const backup = parseBackup(JSON.parse(await file.text()))
      const ok = await ui.confirm({
        title: 'Backup einspielen?',
        text: `${backup.data.sessions.filter(s => s.status === 'done').length} Trainings und ${backup.data.exercises.length} Übungen aus der Datei. Alle aktuellen Daten auf diesem Gerät werden ersetzt.`,
        ok: 'Ersetzen',
        danger: true,
      })
      if (!ok) return
      setBusy(true)
      await importAll(backup)
      ui.toast('Backup importiert')
    } catch (err) {
      ui.confirm({ title: 'Import nicht möglich', text: err instanceof Error ? err.message : 'Die Datei konnte nicht gelesen werden.', ok: 'OK', cancel: ' ' })
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const dropDemo = async () => {
    if (await ui.confirm({ title: 'Beispieldaten entfernen?', text: `${demo} Beispiel-Trainings werden gelöscht. Eigene Trainings bleiben.`, ok: 'Entfernen', danger: true })) {
      await removeDemo()
      ui.toast('Beispieldaten entfernt')
    }
  }

  const reset = async () => {
    if (
      await ui.confirm({
        title: 'Alles zurücksetzen?',
        text: 'Alle Trainings, dein Plan und alle Einstellungen werden gelöscht. Der Standardplan (Tag A/B) wird neu angelegt. Das lässt sich nicht rückgängig machen – exportiere vorher ein Backup.',
        ok: 'Alles löschen',
        danger: true,
      })
    ) {
      await resetAll()
      ui.toast('Zurückgesetzt')
    }
  }

  return (
    <div className="stack">
      <header className="page-head">
        <h1>Einstellungen</h1>
      </header>

      <section className="card stack-sm">
        <h2 className="section-title">Pausentimer</h2>
        <p className="muted small">Startet automatisch nach jedem abgehakten Satz und vibriert am Ende.</p>
        <Stepper label="Pause" value={rest} step={15} min={15} max={600} snap={v => Math.round(v / 5) * 5} format={v => fmtClock(v)} onChange={v => setSetting('restSeconds', v)} />
      </section>

      <section className="card stack-sm">
        <h2 className="section-title">Backup</h2>
        <p className="muted small">Alle Daten liegen nur auf diesem Gerät. Exportiere regelmäßig eine JSON-Datei, besonders vor einem Gerätewechsel.</p>
        <button className="btn primary block" onClick={download}>
          Daten exportieren (JSON)
        </button>
        {canShare && (
          <button className="btn ghost block" onClick={share}>
            Backup teilen / in Cloud speichern
          </button>
        )}
        <button className="btn ghost block" disabled={busy} onClick={() => fileRef.current?.click()}>
          Backup importieren
        </button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={e => onFile(e.target.files?.[0])} />
        <p className="muted small">
          Speicher-Schutz:{' '}
          {persisted === null ? 'unbekannt' : persisted ? 'aktiv (Browser löscht die Daten nicht von selbst)' : 'nicht garantiert – Backup empfohlen'}
        </p>
      </section>

      <section className="card stack-sm">
        <h2 className="section-title">App installieren</h2>
        {isStandalone() ? (
          <p className="muted small">✓ Die App läuft bereits als installierte App.</p>
        ) : canInstall ? (
          <button className="btn primary block" onClick={promptInstall}>
            Auf dem Startbildschirm installieren
          </button>
        ) : isIOS() ? (
          <p className="muted small">
            iPad/iPhone: In Safari auf <b>Teilen</b> tippen, dann <b>Zum Home-Bildschirm</b>.
          </p>
        ) : (
          <p className="muted small">Android/Chrome: Menü (⋮) → <b>App installieren</b> bzw. <b>Zum Startbildschirm hinzufügen</b>.</p>
        )}
      </section>

      <section className="card stack-sm">
        <h2 className="section-title">Daten</h2>
        {demo > 0 ? (
          <button className="btn ghost block" onClick={dropDemo}>
            Beispieldaten entfernen ({demo})
          </button>
        ) : (
          <button className="btn ghost block" onClick={() => seedDemo().then(() => ui.toast('Beispieldaten geladen'))}>
            Beispieldaten laden
          </button>
        )}
        <button className="btn danger-outline block" onClick={reset}>
          Alles zurücksetzen
        </button>
      </section>

      <p className="muted small center-text">Workout Tracker · Daten nur lokal (IndexedDB) · funktioniert offline</p>
    </div>
  )
}
