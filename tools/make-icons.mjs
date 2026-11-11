// Erzeugt die PNG-Icons aus dem SVG-Entwurf. Einmalig ausführen: node tools/make-icons.mjs
// (benötigt "sharp": npm i -D sharp). Die fertigen PNGs liegen bereits in public/.
import sharp from 'sharp'
import { writeFileSync } from 'node:fs'

const glyph = `
  <rect x="150" y="240" width="212" height="32" rx="16" fill="#eceff4"/>
  <rect x="112" y="170" width="44" height="172" rx="14" fill="url(#l)"/>
  <rect x="356" y="170" width="44" height="172" rx="14" fill="url(#r)"/>
  <rect x="66" y="204" width="38" height="104" rx="12" fill="url(#l)"/>
  <rect x="408" y="204" width="38" height="104" rx="12" fill="url(#r)"/>`

const svg = (scale, radius) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="l" x1="0" x2="1"><stop offset="0" stop-color="#38bdf8"/><stop offset="1" stop-color="#8ea2ff"/></linearGradient>
    <linearGradient id="r" x1="0" x2="1"><stop offset="0" stop-color="#8ea2ff"/><stop offset="1" stop-color="#fb923c"/></linearGradient>
  </defs>
  <rect width="512" height="512" rx="${radius}" fill="#0e1014"/>
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">${glyph}</g>
</svg>`

const out = async (name, size, scale, radius) => {
  const buf = await sharp(Buffer.from(svg(scale, radius))).resize(size, size).png().toBuffer()
  writeFileSync(`public/${name}`, buf)
}

await out('icon-192.png', 192, 1.05, 96)
await out('icon-512.png', 512, 1.05, 112)
await out('icon-maskable-512.png', 512, 0.78, 0) // volle Fläche, Motiv in der Safe-Zone
await out('apple-touch-icon.png', 180, 1.0, 0) // iOS rundet selbst ab
