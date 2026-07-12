// Minimal typing for the pdf-parse subpath import (its @types package only
// declares the package root, which runs a debug harness on import).
declare module 'pdf-parse/lib/pdf-parse.js' {
  interface PdfParseResult {
    text: string
    numpages: number
    info: unknown
  }
  function pdf(data: Buffer | Uint8Array): Promise<PdfParseResult>
  export default pdf
}
