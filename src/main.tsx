import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import App from './App'
import { ensureSeeded } from './db/repo'
import { registerSW } from './lib/pwa'

async function boot() {
  const root = createRoot(document.getElementById('root')!)
  try {
    await ensureSeeded()
  } catch (err) {
    console.error(err)
    root.render(
      <main className="screen">
        <h1>Datenbank nicht verfügbar</h1>
        <p className="muted">
          Der Browser erlaubt keinen lokalen Speicher (IndexedDB). Im privaten Modus ist das manchmal der Fall. Öffne die App im normalen Modus.
        </p>
      </main>,
    )
    return
  }
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
  registerSW()
  // Bitte den Browser, die Daten nicht automatisch zu löschen
  void navigator.storage?.persist?.()
}

void boot()
