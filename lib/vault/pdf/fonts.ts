// ─── Shared PDF font registration ──────────────────────────────────────
// THIS IS THE ONLY PLACE FONTS ARE REGISTERED FOR FUNŪN'S PDF LAYER.
// split-sheet.tsx, credits-sheet.tsx, and metadata-sheet.tsx all import
// registerFunuunPdfFonts() from here rather than calling Font.register()
// themselves — a second registration site would defeat the point of this
// fix (ESIGN-15 / P17-08 fontFamily-value scan in fonts.test.ts asserts
// every renderer's StyleSheet points at PDF_FONT_FAMILY).
//
// Why this module exists: @react-pdf/renderer's built-in standard-14
// fonts (Helvetica/Helvetica-Bold) use WinAnsi encoding, which silently
// corrupts any character outside Latin-1. `ć` (U+0107) is DROPPED
// entirely — "Nikola Jokić" renders as "Nikola Joki" — and `ū` (U+016B)
// mangles, which is why the brand string "Funūn" rendered as "Funkn" in
// the footer of every credits sheet, metadata sheet, and split sheet
// Funūn has ever generated. A collaborator's legal name is corrupted on
// the document that governs their royalty share — see
// .planning/phases/17-split-sheet-esign/17-PROVIDER-VERIFICATION.md.
//
// Fix: bundle Noto Sans (SIL Open Font License — see assets/fonts/OFL.txt
// and assets/fonts/PROVENANCE.md for source/SHA256/license provenance)
// and register it as a single family in two weights (400/700). Bold is
// then selected via fontWeight, never a separate family name.
//
// Font.register() needs a filesystem path resolvable at runtime — these
// renderers execute in the Node runtime (never Edge). process.cwd() at
// runtime is the deployment root, so assets/fonts/*.ttf must also be
// present in the deployed serverless bundle: next.config.mjs declares
// outputFileTracingIncludes for the routes that render a PDF. Without
// that, this resolves fine in local dev and fails (or silently falls
// back to a broken glyph set) in production — the classic failure mode
// for this pattern, which is why registration fails LOUDLY here instead.

import fs from 'fs'
import path from 'path'
import { Font } from '@react-pdf/renderer'

export const PDF_FONT_FAMILY = 'Noto Sans'

export const PDF_FONT_FILES = {
  regular: path.join(process.cwd(), 'assets', 'fonts', 'NotoSans-Regular.ttf'),
  bold: path.join(process.cwd(), 'assets', 'fonts', 'NotoSans-Bold.ttf'),
}

/**
 * Fail-fast guard: throws a descriptive Error naming the missing
 * absolute path if a required font file is not present. Exported (not
 * just used internally) so the test suite can exercise the exact
 * failure message without needing to actually delete a vendored font
 * file from disk.
 */
export function assertFontFileExists(absolutePath: string): void {
  if (!fs.existsSync(absolutePath)) {
    throw new Error(
      `registerFunuunPdfFonts(): required font file not found at "${absolutePath}". ` +
        'This is a fail-fast guard — Funūn never falls back to a standard-14 WinAnsi ' +
        'font, because that silently corrupts non-Latin-1 names (ESIGN-15 / P17-08). ' +
        'If this is a production deploy, confirm outputFileTracingIncludes in ' +
        'next.config.mjs actually shipped assets/fonts/ into the serverless bundle.',
    )
  }
}

let registered = false

/**
 * Registers the Noto Sans family (regular 400 + bold 700) with
 * @react-pdf/renderer's global font store. Idempotent — safe to call
 * from every renderer module's top level; only the first call performs
 * the actual registration and filesystem checks.
 */
export function registerFunuunPdfFonts(): void {
  if (registered) return

  assertFontFileExists(PDF_FONT_FILES.regular)
  assertFontFileExists(PDF_FONT_FILES.bold)

  Font.register({
    family: PDF_FONT_FAMILY,
    fonts: [
      { src: PDF_FONT_FILES.regular, fontWeight: 400 },
      { src: PDF_FONT_FILES.bold, fontWeight: 700 },
    ],
  })

  registered = true
}
