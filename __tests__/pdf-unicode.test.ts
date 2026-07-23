// ─── Unicode PDF regression suite — ESIGN-15 / P17-08 ──────────────────
// The durable guard against the shipped WinAnsi corruption bug
// regressing: @react-pdf/renderer's standard-14 fonts silently DROP `ć`
// (Nikola Jokić -> Nikola Joki) and mangle `ū` (Funūn -> Funkn). This
// suite renders real PDF buffers through all three renderers and proves,
// via exact-string extraction against the actual PDF bytes, that a
// collaborator's legal name and the brand string survive.
//
// If a future contributor reverts the font registration (back to
// Helvetica/Helvetica-Bold), this suite fails loudly: extractPdfText
// decodes whatever font is actually embedded, so a WinAnsi standard-14
// render either drops/mangles these characters at the content-stream
// level (extraction reflects the corruption) or never embeds a subset
// base-font name at all (the structural assertion below fails).

import { renderSplitSheet } from '@/lib/vault/pdf/split-sheet'
import { renderCreditsSheet } from '@/lib/vault/pdf/credits-sheet'
import { renderMetadataSheet } from '@/lib/vault/pdf/metadata-sheet'
import { extractPdfText } from '@/lib/vault/pdf/test-utils/extract-pdf-text'
import type { ExportTrack } from '@/lib/vault/export-pack'

const NIKOLA_JOKIC = 'Nikola Jokić' // c-acute (U+0107)
const JOSE_MUNOZ = 'José Muñoz' // e-acute + n-tilde
const FUNUN = 'Funūn' // u-macron (U+016B) — the brand string

/**
 * A rendered split sheet, credits sheet, or metadata sheet must embed
 * the Noto Sans subset (base-font name like "ABCDEF+NotoSans-Regular"),
 * never a standard-14 base font (e.g. "Helvetica"). This is the
 * structural proof that the WinAnsi standard-14 path is no longer in
 * use — a font-registration revert fails here even if a test fixture
 * happened to contain no non-ASCII characters.
 */
function assertEmbedsNotoSansSubset(buffer: Buffer): void {
  const raw = buffer.toString('latin1')
  expect(raw).toMatch(/\/BaseFont\s*\/[A-Z0-9]{6}\+NotoSans-(Regular|Bold)/)
  expect(raw).not.toMatch(/\/BaseFont\s*\/Helvetica/)
}

const composerFixture: ExportTrack['composers'][number] = {
  name: NIKOLA_JOKIC,
  role: 'composer_lyricist',
  pro: 'ASCAP',
  ipi: '00123456789',
  split: 100,
}

const trackFixture: ExportTrack = {
  id: 'track-1',
  title: 'Test Track',
  track_number: 1,
  isrc: 'US-S1Z-99-00001',
  iswc: 'T-034.524.680-1',
  duration_seconds: 210,
  bpm: 120,
  key_signature: 'C#m',
  language: 'en',
  composers: [composerFixture],
}

describe('split sheet — Unicode regression', () => {
  it('renders Nikola Jokić and José Muñoz intact, footer reads Funūn, embeds Noto Sans subset', async () => {
    const buffer = await renderSplitSheet({
      songName: 'Test Song',
      projectTitle: null,
      initiatorName: JOSE_MUNOZ,
      parties: [
        {
          name: NIKOLA_JOKIC,
          email: 'nikola@example.com',
          pro: 'ASCAP',
          ipi: '00123456789',
          role: 'composer_lyricist',
          split_percentage: 100,
        },
      ],
    })

    const text = extractPdfText(buffer)
    expect(text).toContain(NIKOLA_JOKIC)
    expect(text).toContain(JOSE_MUNOZ)
    expect(text).toContain(FUNUN)
    assertEmbedsNotoSansSubset(buffer)
  })
})

describe('credits sheet — Unicode regression', () => {
  it('renders a writer named Nikola Jokić intact, footer reads Funūn, embeds Noto Sans subset', async () => {
    const buffer = await renderCreditsSheet({
      releaseTitle: 'Test Release',
      artistName: JOSE_MUNOZ,
      tracks: [trackFixture],
    })

    const text = extractPdfText(buffer)
    expect(text).toContain(NIKOLA_JOKIC)
    expect(text).toContain(FUNUN)
    assertEmbedsNotoSansSubset(buffer)
  })
})

describe('metadata sheet — Unicode regression', () => {
  it('footer reads Funūn, embeds Noto Sans subset', async () => {
    const buffer = await renderMetadataSheet({
      releaseTitle: 'Test Release',
      artistName: JOSE_MUNOZ,
      tracks: [trackFixture],
    })

    const text = extractPdfText(buffer)
    // Metadata sheet carries no writer names — its only non-ASCII
    // surface is the artist name (header) and the brand footer.
    expect(text).toContain(JOSE_MUNOZ)
    expect(text).toContain(FUNUN)
    assertEmbedsNotoSansSubset(buffer)
  })
})
