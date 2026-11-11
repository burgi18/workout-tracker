import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Trägt bei jedem Build eine neue ID in den Service Worker ein.
// Dadurch bekommt jedes Deployment einen frischen Cache und alte Dateien werden entfernt.
function swBuildId() {
  return {
    name: 'sw-build-id',
    apply: 'build' as const,
    closeBundle() {
      const file = resolve('dist/sw.js')
      if (existsSync(file)) {
        writeFileSync(file, readFileSync(file, 'utf8').replace('__BUILD_ID__', String(Date.now())))
      }
    },
  }
}

export default defineConfig({
  // './' = relative Pfade, damit die App unter jedem Unterpfad läuft (z. B. GitHub Pages: /repo-name/)
  base: './',
  plugins: [react(), swBuildId()],
})
