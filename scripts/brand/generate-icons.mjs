#!/usr/bin/env node
// ─── Funūn icon generator ─────────────────────────────────────────────────
// Emits the favicon set from the brand mark: the same six bars the site paints
// (WAVE = [9,16,24,13,20,8], lib: marketing.html's footer/header glyph) on a
// black tile with the signature indigo→fuchsia gradient.
//
// Why a generator and not committed blobs: the mark is geometry, so it is
// reproducible, reviewable in a diff, and regenerable at new sizes. No image
// library is used -- PNG is just zlib over raw scanlines, and ICO is a thin
// container around PNGs.
//
// OWNER DECISION 2026-10-01: all six bars at every size, including 16px.
// The hard part is that six bars plus five gaps have to share ~14px there, so
// a fractional bar width puts every edge mid-pixel and the mark antialiases
// into a smear. Every coordinate below is therefore an integer, and the tile's
// corner rounding is dropped under 48px where a radius costs a whole pixel.
//
//   node scripts/brand/generate-icons.mjs

import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const WAVE = [9, 16, 24, 13, 20, 8]
const MAX_H = Math.max(...WAVE)
const A = [0x81, 0x8c, 0xf8]   // #818CF8
const B = [0xd9, 0x46, 0xef]   // #D946EF

const lerp = (a, b, t) => Math.round(a + (b - a) * t)

/** Diagonal gradient, matching the canvas createLinearGradient(0,0,S,S). */
function gradientAt(x, y, S) {
  const t = Math.min(1, Math.max(0, (x + y) / (2 * (S - 1))))
  return [lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)]
}

function renderIcon(S) {
  const px = Buffer.alloc(S * S * 4)             // RGBA, transparent
  const radius = S >= 48 ? Math.round(S * 0.22) : 0
  const inCorner = (x, y) => {
    if (radius === 0) return true
    const cx = x < radius ? radius : x >= S - radius ? S - radius - 1 : x
    const cy = y < radius ? radius : y >= S - radius ? S - radius - 1 : y
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius * radius
  }
  const set = (x, y, r, g, b) => {
    const i = (y * S + x) * 4
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255
  }
  // black tile
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (inCorner(x, y)) set(x, y, 0, 0, 0)

  // six bars, every coordinate an integer
  const bw = Math.max(1, Math.floor((S * 0.86) / 11))
  const gap = bw
  const span = bw * 6 + gap * 5
  const x0 = Math.round((S - span) / 2)
  const maxBar = Math.round(S * 0.8)
  let bx = x0
  for (const h of WAVE) {
    const bh = Math.max(1, Math.round(maxBar * (h / MAX_H)))
    const by = Math.round((S - bh) / 2)
    for (let y = by; y < by + bh; y++) {
      for (let x = bx; x < bx + bw; x++) {
        if (x < 0 || y < 0 || x >= S || y >= S) continue
        const [r, g, b] = gradientAt(x, y, S)
        set(x, y, r, g, b)
      }
    }
    bx += bw + gap
  }
  return px
}

// ─── minimal PNG writer ───────────────────────────────────────────────────
function crc32(buf) {
  let c, crc = 0xffffffff
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crc = c ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function png(px, S) {
  const raw = Buffer.alloc(S * (S * 4 + 1))
  for (let y = 0; y < S; y++) {
    raw[y * (S * 4 + 1)] = 0                                  // filter: none
    px.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4)
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0  // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** ICO is a 6-byte header, one 16-byte directory entry per image, then the PNGs. */
function ico(entries) {
  const head = Buffer.alloc(6)
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(entries.length, 4)
  let offset = 6 + entries.length * 16
  const dir = [], blobs = []
  for (const { size, data } of entries) {
    const e = Buffer.alloc(16)
    e[0] = size >= 256 ? 0 : size
    e[1] = size >= 256 ? 0 : size
    e[2] = 0; e[3] = 0
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6)
    e.writeUInt32LE(data.length, 8); e.writeUInt32LE(offset, 12)
    dir.push(e); blobs.push(data); offset += data.length
  }
  return Buffer.concat([head, ...dir, ...blobs])
}

const out = (p, buf) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, buf)
  console.log(`  ${p.padEnd(42)} ${String(buf.length).padStart(7)} bytes`) }

console.log('Funūn icons — six bars, pixel-snapped:')
const icoSizes = [16, 32, 48]
out('public/favicon.ico', ico(icoSizes.map(s => ({ size: s, data: png(renderIcon(s), s) }))))
for (const s of [180, 192, 512]) out(`public/marketing/icon-${s}.png`, png(renderIcon(s), s))
