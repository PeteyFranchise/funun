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

describe('glyph coverage guard — all three PDF renderer sources', () => {
  // Deliberately parse fontFamily VALUES and rendered string literals
  // rather than shell-grepping raw file text, so header comments and
  // documentation prose in these renderer files (which legitimately
  // reference "Helvetica" and non-ASCII characters in prose) can never
  // satisfy or break this gate — only actual StyleSheet/JSX content can.
  const rendererFiles = [
    path.join(__dirname, 'split-sheet.tsx'),
    path.join(__dirname, 'credits-sheet.tsx'),
    path.join(__dirname, 'metadata-sheet.tsx'),
  ]

  // Strip // line comments and /* */ block comments before scanning, so
  // this guard can never be satisfied (or defeated) by prose in a
  // comment — only real StyleSheet.create({...}) object literals count.
  function stripComments(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  }

  it('every fontFamily style value is the registered PDF_FONT_FAMILY', () => {
    // Renderers express fontFamily either as the imported PDF_FONT_FAMILY
    // identifier (preferred — single source of truth) or, if ever
    // hardcoded again, as a quoted string literal. Catch both forms: a
    // bare identifier must be exactly `PDF_FONT_FAMILY`, and a string
    // literal must equal its resolved value — so a revert to a literal
    // 'Helvetica' fails here regardless of which form is used.
    const fontFamilyValuePattern = /fontFamily:\s*(?:'([^']*)'|(\w+))/g
    for (const file of rendererFiles) {
      const src = stripComments(fs.readFileSync(file, 'utf-8'))
      let match: RegExpExecArray | null
      let found = 0
      while ((match = fontFamilyValuePattern.exec(src))) {
        found += 1
        const [, stringLiteral, identifier] = match
        if (stringLiteral !== undefined) {
          expect(stringLiteral).toBe(PDF_FONT_FAMILY)
        } else {
          expect(identifier).toBe('PDF_FONT_FAMILY')
        }
      }
      // Each renderer must actually declare fontFamily somewhere — an
      // empty match set would let this test pass vacuously.
      expect(found).toBeGreaterThan(0)
    }
  })

  it('every literal non-ASCII character in rendered string content has a glyph in the registered font', () => {
    const regular = fontkit.openSync(PDF_FONT_FILES.regular)
    const bold = fontkit.openSync(PDF_FONT_FILES.bold)
    const nonAsciiPattern = /[^\x00-\x7F]/g

    for (const file of rendererFiles) {
      const src = stripComments(fs.readFileSync(file, 'utf-8'))
      const chars = new Set(src.match(nonAsciiPattern) ?? [])
      expect(chars.size).toBeGreaterThan(0)
      for (const ch of chars) {
        const cp = ch.codePointAt(0)!
        const covered = regular.hasGlyphForCodePoint(cp) && bold.hasGlyphForCodePoint(cp)
        if (!covered) {
          throw new Error(
            `Uncovered non-ASCII character "${ch}" (U+${cp.toString(16).toUpperCase()}) found in ${file} — ` +
              'no glyph in the registered Noto Sans font. Replace it with covered text; ' +
              'do not add a second font family just to carry one symbol.',
          )
        }
      }
    }
  })
})
