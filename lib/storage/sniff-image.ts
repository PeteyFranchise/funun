// ─── Image magic-byte sniffing (WR-03 hardening) ───────────────────────────
// A client-supplied `Content-Type` header is not trustworthy — a spoofed
// header could smuggle arbitrary bytes into a public storage bucket under an
// image extension. This inspects the file's actual leading bytes and
// resolves them to a real image type, independent of whatever the browser
// claimed. Pure, no I/O — callers read the file into bytes and pass them in.

export type SniffedImageType = 'image/png' | 'image/jpeg' | 'image/webp'

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const JPEG_MAGIC = [0xff, 0xd8, 0xff]
const RIFF_MAGIC = [0x52, 0x49, 0x46, 0x46] // "RIFF"
const WEBP_MAGIC = [0x57, 0x45, 0x42, 0x50] // "WEBP", at byte offset 8

function matchesAt(bytes: Uint8Array, offset: number, magic: number[]): boolean {
  if (bytes.length < offset + magic.length) return false
  for (let i = 0; i < magic.length; i++) {
    if (bytes[offset + i] !== magic[i]) return false
  }
  return true
}

/**
 * Inspects the leading bytes of a file and returns the image type its magic
 * bytes actually match, or null if none of the allowed types match.
 */
export function sniffImageType(bytes: Uint8Array): SniffedImageType | null {
  if (matchesAt(bytes, 0, PNG_MAGIC)) return 'image/png'
  if (matchesAt(bytes, 0, JPEG_MAGIC)) return 'image/jpeg'
  if (matchesAt(bytes, 0, RIFF_MAGIC) && matchesAt(bytes, 8, WEBP_MAGIC)) return 'image/webp'
  return null
}

/**
 * True only when the file's actual bytes sniff to a real image type AND
 * that sniffed type matches the claimed `Content-Type`. Rejects both
 * unrecognized content and a mismatched claim (e.g. a JPEG's bytes served
 * under an `image/png` header).
 */
export function bytesMatchClaimedImageType(bytes: Uint8Array, claimedType: string): boolean {
  const sniffed = sniffImageType(bytes)
  return sniffed !== null && sniffed === claimedType
}
