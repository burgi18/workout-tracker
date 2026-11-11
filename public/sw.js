/* Service Worker: macht die App offline nutzbar.
 * - Beim Installieren wird index.html samt aller darin verlinkten Dateien (JS/CSS) in den Cache gelegt.
 * - Danach: Cache zuerst, sonst Netz. Navigationen liefern immer die gecachte index.html.
 * - __BUILD_ID__ wird beim Build ersetzt (vite.config.ts). Neue Version = neuer Cache, alte werden gelöscht.
 */
const BUILD = '__BUILD_ID__'
const CACHE = 'workout-' + BUILD
const BASE = self.registration.scope // endet auf "/"
const EXTRA = ['manifest.webmanifest', 'favicon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png']

self.addEventListener('install', event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      const res = await fetch(new Request(BASE, { cache: 'reload' }))
      if (!res.ok) throw new Error('index.html nicht ladbar')
      const html = await res.clone().text()
      await cache.put(BASE, res)

      const urls = new Set(EXTRA.map(p => new URL(p, BASE).href))
      for (const m of html.matchAll(/(?:src|href)="([^"#?]+)"/g)) {
        const u = new URL(m[1], BASE)
        if (u.origin === self.location.origin) urls.add(u.href)
      }
      await Promise.all(
        [...urls].map(async u => {
          try {
            await cache.add(new Request(u, { cache: 'reload' }))
          } catch {
            /* einzelne fehlende Datei darf die Installation nicht verhindern */
          }
        }),
      )
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter(k => k.startsWith('workout-') && k !== CACHE).map(k => caches.delete(k)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', event => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cached = await caches.match(BASE, { ignoreSearch: true })
        if (cached) return cached
        try {
          return await fetch(req)
        } catch {
          return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
        }
      })(),
    )
    return
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(req)
      if (cached) return cached
      try {
        const res = await fetch(req)
        if (res.ok) {
          const cache = await caches.open(CACHE)
          cache.put(req, res.clone())
        }
        return res
      } catch {
        return Response.error()
      }
    })(),
  )
})
