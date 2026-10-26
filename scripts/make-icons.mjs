// Renders the app icon (two stacked blue chevrons on dark grey) to PNG without any
// dependencies, plus the matching SVG. Run: node scripts/make-icons.mjs
import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const BG = [24, 25, 27], FG = [59, 130, 246]
// Chevrons in a 0..1 unit square: each is two segments meeting at the apex.
const CHEVRONS = [[0.27, 0.50, 0.50, 0.30, 0.73, 0.50], [0.27, 0.72, 0.50, 0.52, 0.73, 0.72]]
const STROKE = 0.085

function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - ax - t * dx, py - ay - t * dy)
}

function render(size, { rounded }) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  const r = rounded ? 0.22 : 0
  const SS = 4                                   // supersampling per axis
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    for (let x = 0; x < size; x++) {
      let fg = 0, inside = 0
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const u = (x + (sx + 0.5) / SS) / size, v = (y + (sy + 0.5) / SS) / size
        const cx = Math.min(Math.max(u, r), 1 - r), cy = Math.min(Math.max(v, r), 1 - r)
        if (r && Math.hypot(u - cx, v - cy) > r) continue
        inside++
        if (CHEVRONS.some(([ax, ay, mx, my, bx, by]) => distSeg(u, v, ax, ay, mx, my) < STROKE / 2 || distSeg(u, v, mx, my, bx, by) < STROKE / 2)) fg++
      }
      const n = SS * SS, o = y * (size * 4 + 1) + 1 + x * 4
      const f = inside ? fg / inside : 0
      for (let c = 0; c < 3; c++) raw[o + c] = Math.round(BG[c] * (1 - f) + FG[c] * f)
      raw[o + 3] = Math.round(255 * inside / n)
    }
  }
  return png(size, raw)
}

function png(size, raw) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
  const crc = buf => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type), data])
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td))
    return Buffer.concat([len, td, c])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

const out = new URL('../public/', import.meta.url)
writeFileSync(new URL('icon-192.png', out), render(192, { rounded: false }))
writeFileSync(new URL('icon-512.png', out), render(512, { rounded: false }))
writeFileSync(new URL('icon-180.png', out), render(180, { rounded: false }))   // iOS rounds it itself

const pts = ([ax, ay, mx, my, bx, by]) => [ax, ay, mx, my, bx, by].map(n => +(n * 100).toFixed(1)).join(' ')
writeFileSync(new URL('icon.svg', out), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="rgb(${BG})"/>` +
  CHEVRONS.map(c => `<polyline points="${pts(c)}" fill="none" stroke="rgb(${FG})" stroke-width="${STROKE * 100}" stroke-linecap="round" stroke-linejoin="round"/>`).join('') + '</svg>\n')
console.log('icons written')
