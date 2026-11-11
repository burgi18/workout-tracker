# Workout Tracker (PWA)

Torso/Limbs-Split (Tag A / Tag B) tracken. Vite + React + TypeScript, Daten lokal in IndexedDB (Dexie), kein Backend, offline nutzbar, installierbar auf Android und iPad.

## Lokal starten

```bash
npm install
npm run dev        # http://localhost:5173 (im WLAN auch vom Handy erreichbar, Adresse steht im Terminal)
npm run build      # Produktions-Build nach dist/
npm run preview    # Build lokal ansehen (hier ist auch der Service Worker aktiv)
npm run typecheck  # TypeScript prüfen
```

Der Service Worker wird nur im Produktions-Build registriert (`npm run build` + `npm run preview`), nicht im Dev-Server.

## Projektstruktur

```
src/
  db/
    schema.ts      Dexie-Datenbank und Typen: Exercise, WorkoutTemplate, WorkoutSession, SetEntry
    repo.ts        Alle Lese-/Schreibfunktionen, Seed (Plan + Beispieldaten), Export/Import
    useDb.ts       Hook: lädt aus IndexedDB und aktualisiert sich nach jeder Änderung
  lib/
    date.ts        Datums-/Zahlenformate (de-AT), Kalender-Raster, ISO-Woche
    stats.ts       Verlauf pro Übung, geschätztes 1RM (Epley)
    device.ts      Pausentimer, Ton/Vibration, Bildschirm-Wachhalten
    pwa.ts         Service-Worker-Registrierung, Installieren-Button
  components/      Stepper (+/- mit 0,5 kg), LineChart (SVG), Dialoge, Icons
  screens/         Start, Workout, Kalender, Verlauf, Plan, Einstellungen
public/
  manifest.webmanifest, sw.js, Icons
```

### Datenmodell

| Tabelle | Felder |
| --- | --- |
| `exercises` | `id`, `name`, `unilateral` (einarmig), `sets`, `repMin`, `repMax` |
| `templates` | `id` ('A'/'B'), `name`, `subtitle`, `color`, `exerciseIds` (Reihenfolge) |
| `sessions` | `id`, `templateId`, `startedAt`, `endedAt`, `durationSec`, `status` ('active'/'done'), `exerciseIds` (Momentaufnahme), `demo` |
| `sets` | `id`, `sessionId`, `exerciseId`, `setIndex`, `side` ('both'/'L'/'R'), `weight`, `reps`, `done`, `doneAt` |
| `settings` | `key`, `value` (z. B. `restSeconds`) |

Ein laufendes Training ist eine Session mit `status: 'active'`. Jede Eingabe wird sofort in IndexedDB geschrieben, deshalb geht nichts verloren, wenn die App geschlossen wird.

## Auf GitHub Pages deployen

1. Neues Repository auf GitHub anlegen (z. B. `workout-tracker`) und den Projektordner hochladen:
   ```bash
   git init
   git add .
   git commit -m "Workout Tracker"
   git branch -M main
   git remote add origin https://github.com/<dein-name>/workout-tracker.git
   git push -u origin main
   ```
2. Auf GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Der Workflow `.github/workflows/deploy.yml` baut und veröffentlicht automatisch bei jedem Push auf `main`. Fortschritt unter dem Tab **Actions**.
4. Die App ist danach erreichbar unter `https://<dein-name>.github.io/workout-tracker/`.

Die App nutzt relative Pfade (`base: './'`), funktioniert also unter jedem Repository-Namen ohne Anpassung.

## Auf dem Handy / iPad installieren

**Android (Chrome):**
1. Die GitHub-Pages-Adresse in Chrome öffnen und einmal komplett laden lassen (mit Internet).
2. Menü (⋮) → **App installieren** (oder **Zum Startbildschirm hinzufügen**). Alternativ in der App: *Mehr → App installieren*.
3. Die App startet danach wie eine normale App und funktioniert auch ohne Internet.

**iPad (Safari):**
1. Adresse in **Safari** öffnen.
2. **Teilen** → **Zum Home-Bildschirm** → Hinzufügen.

**Wichtig zu den Daten:** Handy und iPad haben getrennte Datenbanken (es gibt keine Synchronisation). Zum Übertragen: *Mehr → Daten exportieren* auf dem einen Gerät, *Backup importieren* auf dem anderen. Mach regelmäßig ein Backup. Das Löschen der Browser-Daten oder Deinstallieren löscht auch die Trainings. Die App bittet den Browser um dauerhaften Speicher; der Status steht unter *Mehr → Backup*.

## Updates

Neue Version pushen → GitHub baut und veröffentlicht. Beim nächsten Öffnen der App (mit Internet) lädt der Service Worker die neue Version im Hintergrund, sie ist beim übernächsten Start aktiv (einmal App komplett schließen und neu öffnen). Die Daten bleiben dabei erhalten.

## Hinweise

- **Pausentimer:** Ton und Vibration am Ende funktionieren, solange die App geöffnet ist. Android vibriert; iOS/iPadOS erlaubt Webseiten keine Vibration (dort gibt es nur den Ton). Der Bildschirm bleibt während des Trainings an, wenn der Browser es unterstützt.
- **Beispieldaten:** Beim ersten Start werden ca. 8 Wochen Beispiel-Trainings angelegt. Entfernen unter *Mehr → Beispieldaten entfernen*.
- **Icons neu erzeugen:** `tools/make-icons.mjs` (braucht `sharp`).
