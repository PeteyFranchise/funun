// Generates test media on demand so we don't commit large binaries. Everything
// lands in tests/fixtures/.gen (gitignored).
import AdmZip from 'adm-zip'
import { mkdirSync, existsSync, writeFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const GEN_DIR = resolve(__dirname, '..', 'fixtures', '.gen')

function ensureGenDir() {
  mkdirSync(GEN_DIR, { recursive: true })
}

// Build a valid ZIP archive of roughly `sizeMB`. Content is random bytes in a
// single entry - the stems upload (checkpoint 1) only cares about size and that
// the archive is a real ZIP, not its contents.
export function ensureStemsZip(sizeMB: number): string {
  ensureGenDir()
  const out = resolve(GEN_DIR, `stems-${sizeMB}mb.zip`)
  if (existsSync(out) && statSync(out).size > 0) return out

  const zip = new AdmZip()
  // Random, incompressible payload so the stored archive stays near sizeMB even
  // though ZIP will try to deflate. Chunk to keep memory reasonable.
  const target = sizeMB * 1024 * 1024
  const chunk = 4 * 1024 * 1024
  const buffers: Buffer[] = []
  let written = 0
  while (written < target) {
    const n = Math.min(chunk, target - written)
    const b = Buffer.allocUnsafe(n)
    for (let i = 0; i < n; i += 65536) require('node:crypto').randomFillSync(b, i, Math.min(65536, n - i))
    buffers.push(b)
    written += n
  }
  zip.addFile('vocals.wav', Buffer.concat(buffers))
  zip.writeZip(out)
  return out
}

// Minimal valid PCM WAV (mono, 16-bit, 44.1k) holding a short sine tone. Used
// as the instrumental upload fixture (audio/wav is an allowed type).
export function ensureWav(seconds = 2, name = 'instrumental'): string {
  ensureGenDir()
  const out = resolve(GEN_DIR, `${name}.wav`)
  if (existsSync(out) && statSync(out).size > 0) return out

  const sampleRate = 44100
  const numSamples = Math.floor(sampleRate * seconds)
  const dataSize = numSamples * 2
  const buf = Buffer.alloc(44 + dataSize)

  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + dataSize, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16) // PCM chunk size
  buf.writeUInt16LE(1, 20) // audio format = PCM
  buf.writeUInt16LE(1, 22) // channels = mono
  buf.writeUInt32LE(sampleRate, 24)
  buf.writeUInt32LE(sampleRate * 2, 28) // byte rate
  buf.writeUInt16LE(2, 32) // block align
  buf.writeUInt16LE(16, 34) // bits per sample
  buf.write('data', 36)
  buf.writeUInt32LE(dataSize, 40)

  for (let i = 0; i < numSamples; i++) {
    const sample = Math.round(Math.sin((2 * Math.PI * 220 * i) / sampleRate) * 12000)
    buf.writeInt16LE(sample, 44 + i * 2)
  }
  writeFileSync(out, buf)
  return out
}
