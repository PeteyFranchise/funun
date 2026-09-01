// Tests for the pure parts of lib/catalogue/audio.ts — the MIME allow-list
// lookup, the work-scoped path builder and the size ceiling. No Supabase
// client, no database; `signVersionUrls()` is the one thin I/O function in
// the module and is exercised by the versions route's own integration
// path, not here.

import {
  AUDIO_FILE_ACCEPT,
  EXT_BY_MIME,
  MAX_BYTES,
  buildVersionPath,
  extensionForMime,
  resolveAudioType,
  storageContentType,
} from './audio'

describe('extensionForMime', () => {
  it('maps every bare allow-listed type to its extension', () => {
    expect(extensionForMime('audio/webm')).toBe('webm')
    expect(extensionForMime('audio/mp4')).toBe('m4a')
    expect(extensionForMime('audio/aac')).toBe('aac')
    expect(extensionForMime('audio/mpeg')).toBe('mp3')
    expect(extensionForMime('audio/mp3')).toBe('mp3')
    expect(extensionForMime('audio/wav')).toBe('wav')
    expect(extensionForMime('audio/x-wav')).toBe('wav')
    expect(extensionForMime('audio/flac')).toBe('flac')
    expect(extensionForMime('audio/ogg')).toBe('ogg')
    expect(extensionForMime('audio/x-m4a')).toBe('m4a')
    expect(extensionForMime('audio/x-flac')).toBe('flac')
  })

  it('normalizes a codec-qualified MediaRecorder MIME type before lookup', () => {
    // Chrome/Firefox/Edge's MediaRecorder default.
    expect(extensionForMime('audio/webm;codecs=opus')).toBe('webm')
    // Safari's default, and its explicit AAC variant.
    expect(extensionForMime('audio/mp4;codecs=mp4a.40.2')).toBe('m4a')
    expect(extensionForMime('audio/mp4')).toBe('m4a')
  })

  it('is case-insensitive and tolerates surrounding whitespace in the codec parameter', () => {
    expect(extensionForMime('AUDIO/WEBM')).toBe('webm')
    expect(extensionForMime('audio/webm; codecs=opus')).toBe('webm')
  })

  it('returns null for an unmapped type, including a plausible-looking one', () => {
    expect(extensionForMime('audio/opus')).toBeNull()
    expect(extensionForMime('video/webm')).toBeNull()
    expect(extensionForMime('application/octet-stream')).toBeNull()
    expect(extensionForMime('')).toBeNull()
  })

  // Mirrors 37-RESEARCH.md's CANDIDATE_MIME_TYPES (the codec preference
  // order lib/catalogue/hum-capture.ts's pickSupportedMimeType() will pick
  // from in plan 09) so EXT_BY_MIME is proven to cover every MIME string a
  // MediaRecorder can actually hand this route — not just the bare types.
  // Duplicated here rather than imported because hum-capture.ts does not
  // exist yet at this plan's wave (plan 09 depends on this plan, not the
  // reverse); if plan 09 ever adds a candidate this list doesn't have, this
  // test is the trip-wire.
  const HUM_CAPTURE_CANDIDATE_MIME_TYPES = [
    'audio/webm;codecs=opus',
    'audio/mp4',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/aac',
  ]

  it('accepts every MediaRecorder codec candidate from 37-RESEARCH.md', () => {
    for (const candidate of HUM_CAPTURE_CANDIDATE_MIME_TYPES) {
      expect(extensionForMime(candidate)).not.toBeNull()
    }
  })
})

describe('storageContentType', () => {
  it('returns the bucket-allowed bare type even for a codec-qualified MIME', () => {
    expect(storageContentType('audio/webm;codecs=opus')).toBe('audio/webm')
    expect(storageContentType('audio/mp4;codecs=mp4a.40.2')).toBe('audio/mp4')
  })

  it('returns the type unchanged when it is already bare', () => {
    expect(storageContentType('audio/wav')).toBe('audio/wav')
  })

  it('normalizes browser aliases to a bucket-approved canonical type', () => {
    expect(storageContentType('audio/x-m4a')).toBe('audio/mp4')
    expect(storageContentType('audio/wave')).toBe('audio/wav')
    expect(storageContentType('application/ogg')).toBe('audio/ogg')
  })

  it('returns null for an unmapped type — never forwards an unvetted Content-Type to storage', () => {
    expect(storageContentType('audio/opus')).toBeNull()
  })

  it('every value this function can return is one of the bucket canonical types', () => {
    const canonical = new Set([
      'audio/webm',
      'audio/mp4',
      'audio/aac',
      'audio/mpeg',
      'audio/wav',
      'audio/flac',
      'audio/ogg',
    ])
    for (const mime of Object.keys(EXT_BY_MIME)) {
      expect(canonical.has(storageContentType(mime)!)).toBe(true)
    }
  })
})

describe('resolveAudioType', () => {
  it('uses a recognized MIME type and returns its canonical storage type', () => {
    expect(resolveAudioType('audio/x-m4a', 'voice memo.m4a')).toEqual({
      ext: 'm4a',
      contentType: 'audio/mp4',
    })
  })

  it('falls back to a safe allow-listed extension for blank/generic mobile MIME values', () => {
    expect(resolveAudioType('', 'take.MP3')).toEqual({ ext: 'mp3', contentType: 'audio/mpeg' })
    expect(resolveAudioType('application/octet-stream', 'take.m4a')).toEqual({
      ext: 'm4a',
      contentType: 'audio/mp4',
    })
  })

  it('does not let an unrelated explicit MIME type borrow an audio extension', () => {
    expect(resolveAudioType('application/pdf', 'not-really-audio.mp3')).toBeNull()
  })

  it('advertises the extensions commonly exposed by desktop and iOS file pickers', () => {
    expect(AUDIO_FILE_ACCEPT).toContain('.mp3')
    expect(AUDIO_FILE_ACCEPT).toContain('.wav')
    expect(AUDIO_FILE_ACCEPT).toContain('.m4a')
    expect(AUDIO_FILE_ACCEPT).toContain('.aac')
  })
})

describe('buildVersionPath', () => {
  const WORK_ID = '11111111-1111-1111-1111-111111111111'
  const VERSION_ID = '22222222-2222-2222-2222-222222222222'
  const USER_ID = '99999999-9999-9999-9999-999999999999'

  it('is {workId}/{versionId}.{ext} — work-scoped, never user-scoped', () => {
    expect(buildVersionPath(WORK_ID, VERSION_ID, 'webm')).toBe(`${WORK_ID}/${VERSION_ID}.webm`)
  })

  it('never contains any user id, regardless of extension', () => {
    for (const ext of Object.values(EXT_BY_MIME)) {
      const path = buildVersionPath(WORK_ID, VERSION_ID, ext)
      expect(path).not.toContain(USER_ID)
      expect(path.startsWith(`${WORK_ID}/`)).toBe(true)
      expect(path.endsWith(`.${ext}`)).toBe(true)
    }
  })
})

describe('MAX_BYTES', () => {
  it('keeps each Writer\'s Room take at the product\'s 50MB ceiling', () => {
    expect(MAX_BYTES).toBe(50 * 1024 * 1024)
    expect(MAX_BYTES).toBe(52428800)
  })
})
