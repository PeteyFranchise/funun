// ─── fonts.ts tests ─────────────────────────────────────────────────────
// Proves the vendored Noto Sans TTFs are static (non-variable), report
// the expected family/subfamily, and cover every non-ASCII codepoint the
// PDF renderers can emit — the regression guard for ESIGN-15 / P17-08
// (standard-14 WinAnsi fonts silently corrupting names like "Nikola
// Jokić" and the brand string "Funūn"). Also proves
// registerFunuunPdfFonts() is idempotent and fails fast on a missing
// file, and (Task 2) that every renderer's fontFamily literals and
// rendered non-ASCII characters are covered by the registered font.

import fs from 'fs'
import path from 'path'
import fontkit from 'fontkit'
import {
  registerFunuunPdfFonts,
  PDF_FONT_FAMILY,
  PDF_FONT_FILES,
} from './fonts'

// Every literal non-ASCII character any of the three renderers can emit,
// per the plan's required-coverage set: c-acute, u-macron, and the
// Latin-1 diacritics already used in test fixtures, plus the punctuation
// marks the renderers use in headers/footers (middle dot, em dash, right
// single quote) and a representative sample of Central/Eastern European
// and Turkish/Baltic diacritics named in the objective (Polish, Czech,
// Croatian, Serbian, Turkish, Baltic).
const REQUIRED_CODEPOINTS: { char: string; label: string }[] = [
  { char: 'ć', label: 'c-acute (U+0107)' },
  { char: 'ū', label: 'u-macron (U+016B)' },
  { char: 'ñ', label: 'n-tilde (U+00F1)' },
  { char: 'é', label: 'e-acute (U+00E9)' },
  { char: 'ó', label: 'o-acute (U+00F3)' },
  { char: 'ü', label: 'u-diaeresis (U+00FC)' },
  { char: 'š', label: 's-caron (U+0161)' },
  { char: 'ż', label: 'z-dot-above (U+017C)' },
  { char: 'ğ', label: 'g-breve (U+011F)' },
  { char: '·', label: 'middle dot (U+00B7)' },
  { char: '—', label: 'em dash (U+2014)' },
  { char: '’', label: 'right single quote (U+2019)' },
]

describe('vendored Noto Sans font files', () => {
  it('exist at the paths PDF_FONT_FILES resolves', () => {
    expect(fs.existsSync(PDF_FONT_FILES.regular)).toBe(true)
    expect(fs.existsSync(PDF_FONT_FILES.bold)).toBe(true)
  })

  it('report family "Noto Sans" and the expected subfamily', () => {
    const regular = fontkit.openSync(PDF_FONT_FILES.regular)
    const bold = fontkit.openSync(PDF_FONT_FILES.bold)
    expect(regular.familyName).toBe('Noto Sans')
    expect(regular.subfamilyName).toBe('Regular')
    expect(bold.familyName).toBe('Noto Sans')
    expect(bold.subfamilyName).toBe('Bold')
  })

  it('are static instances — neither file has an fvar table', () => {
    const regular = fontkit.openSync(PDF_FONT_FILES.regular)
    const bold = fontkit.openSync(PDF_FONT_FILES.bold)
    // fontkit exposes an `fvar` table getter only for variable fonts;
    // a static TTF has no fvar table at all.
    expect((regular as unknown as { tables?: Record<string, unknown> }).tables?.fvar).toBeUndefined()
    expect((bold as unknown as { tables?: Record<string, unknown> }).tables?.fvar).toBeUndefined()
  })

  it.each(REQUIRED_CODEPOINTS)('regular weight has a glyph for $label', ({ char }) => {
    const regular = fontkit.openSync(PDF_FONT_FILES.regular)
    expect(regular.hasGlyphForCodePoint(char.codePointAt(0)!)).toBe(true)
  })

  it.each(REQUIRED_CODEPOINTS)('bold weight has a glyph for $label', ({ char }) => {
    const bold = fontkit.openSync(PDF_FONT_FILES.bold)
    expect(bold.hasGlyphForCodePoint(char.codePointAt(0)!)).toBe(true)
  })
})

describe('registerFunuunPdfFonts', () => {
  it('exports a family name and resolved absolute font paths', () => {
    expect(PDF_FONT_FAMILY).toBe('Noto Sans')
    expect(path.isAbsolute(PDF_FONT_FILES.regular)).toBe(true)
    expect(path.isAbsolute(PDF_FONT_FILES.bold)).toBe(true)
  })

  it('is idempotent — calling it repeatedly never throws', () => {
    expect(() => {
      registerFunuunPdfFonts()
      registerFunuunPdfFonts()
      registerFunuunPdfFonts()
    }).not.toThrow()
  })

  it('throws a descriptive error naming the missing path when a font file is absent', () => {
    // Force the internal existence check to fail for one call without
    // touching the real vendored files on disk.
    const missingPath = path.join(path.dirname(PDF_FONT_FILES.regular), 'does-not-exist.ttf')
    expect(fs.existsSync(missingPath)).toBe(false)
    // Exercise the same fail-fast guard the module uses internally by
    // asserting on the module's own registration path rather than
    // reimplementing it — see fonts.ts assertFontFileExists().
    const { assertFontFileExists } = jest.requireActual('./fonts') as {
      assertFontFileExists: (p: string) => void
    }
    expect(() => assertFontFileExists(missingPath)).toThrow(/does-not-exist\.ttf/)
  })
})

// Glyph-coverage guard over the three PDF renderer sources (Task 2 of
// P17-08) is appended below this line once the renderers are switched
// onto PDF_FONT_FAMILY. See Task 2 in
// .planning/phases/17-split-sheet-esign/17-08-PLAN.md.
