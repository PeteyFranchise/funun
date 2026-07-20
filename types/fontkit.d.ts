// fontkit ships no TypeScript declarations of its own (its package.json
// has no "types"/"typings" field, and dist/ contains no .d.ts files).
// @react-pdf/types re-exports fontkit's types from a pre-built .d.ts,
// which skipLibCheck lets pass silently — but any source file in THIS
// project that imports fontkit directly (lib/vault/pdf/fonts.test.ts,
// the ESIGN-15 / P17-08 glyph-coverage regression suite) needs an
// ambient declaration or `tsc --noEmit` fails with TS7016. This covers
// only the surface this codebase actually calls.
declare module 'fontkit' {
  export interface Font {
    familyName: string
    subfamilyName: string
    tables?: Record<string, unknown>
    hasGlyphForCodePoint(codePoint: number): boolean
  }

  export function openSync(filePath: string): Font

  const fontkit: {
    openSync: typeof openSync
  }
  export default fontkit
}
