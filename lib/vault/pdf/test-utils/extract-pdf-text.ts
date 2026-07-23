// ─── extractPdfText — test-only Unicode PDF text extraction ───────────
// TEST-ONLY HELPER. Never imported by production code — exists solely to
// prove, byte-for-byte, that a party's legal name and the brand string
// survive rendering (ESIGN-15 / P17-08 regression guard). Do NOT add a
// PDF-parsing dependency to satisfy this: a new package here would trip
// the package-legitimacy gate for what is fundamentally a test utility,
// and the structure @react-pdf/renderer actually emits is narrow enough
// to decode precisely with Node's built-in zlib.
//
// What @react-pdf/renderer 4.x emits (verified against a real rendered
// buffer, not assumed):
//   - Every embedded font is a composite Type0 font with /Encoding
//     /Identity-H — text-showing operators carry 2-byte character codes
//     (CIDs), never raw character bytes.
//   - Every Type0 font carries a /ToUnicode entry pointing at a
//     FlateDecode CMap stream built from `beginbfchar`/`endbfchar`
//     entries (`<code><dst>`, where dst is one or more UTF-16BE code
//     units — e.g. ligatures like "fi" map a single code to two units).
//   - The page content stream is itself FlateDecode-compressed and uses
//     the standard content-stream grammar: `/FN <size> Tf` selects the
//     active font resource, and `<hex> Tj` / `[<hex> adj <hex> adj ...]
//     TJ` show text as hex-encoded CID sequences.
//   - A resource-name -> font-object binding lives in a `/Font << /FN N
//     0 R ... >>` dictionary reachable from the page's /Resources.
//
// Falls back to decoding plain parenthesised literal strings (a
// simple-font `(...) Tj` show) verbatim, and to keeping a stream's raw
// bytes when it is not Flate-compressed, so neither path is silently
// invisible to callers even though @react-pdf's composite-font path is
// the one this suite actually exercises.

import zlib from 'zlib'

// ─── Low-level object/stream extraction ───────────────────────────────

type PdfObject = {
  num: number
  dict: string
  streamBytes: Buffer | null
}

/**
 * Splits a raw PDF buffer into its "N 0 obj ... endobj" objects, pairing
 * each with its decompressed stream body (if any). Operates on a latin1
 * string view of the buffer so byte offsets line up 1:1 with the
 * original bytes — every codepoint in a PDF file's structural syntax
 * (numbers, keywords, delimiters) is single-byte, so this never
 * misaligns even though the extracted stream content can itself be
 * arbitrary binary data (font programs) or UTF-16BE text.
 */
function extractObjects(buffer: Buffer): PdfObject[] {
  const text = buffer.toString('latin1')
  const objects: PdfObject[] = []
  const objHeaderPattern = /(\d+)\s+0\s+obj/g
  let match: RegExpExecArray | null

  while ((match = objHeaderPattern.exec(text))) {
    const num = Number(match[1])
    const bodyStart = match.index + match[0].length
    const endObjIdx = text.indexOf('endobj', bodyStart)
    if (endObjIdx === -1) continue
    const body = text.slice(bodyStart, endObjIdx)

    const streamIdx = body.indexOf('stream')
    if (streamIdx === -1) {
      objects.push({ num, dict: body, streamBytes: null })
      continue
    }

    const dict = body.slice(0, streamIdx)
    // "stream" is immediately followed by CRLF or LF before the binary
    // payload begins — skip exactly that per the PDF spec, not any
    // amount of whitespace (stream bytes can legitimately start with
    // whitespace-looking bytes).
    let dataStart = bodyStart + streamIdx + 'stream'.length
    if (text[dataStart] === '\r') dataStart += 1
    if (text[dataStart] === '\n') dataStart += 1
    const streamEndIdx = body.indexOf('endstream', streamIdx)
    if (streamEndIdx === -1) {
      objects.push({ num, dict, streamBytes: null })
      continue
    }
    const dataEnd = bodyStart + streamEndIdx
    // Trailing EOL before "endstream" is part of the stream delimiter,
    // not payload, per spec — but @react-pdf's raw byte length (via
    // /Length) is what matters for FlateDecode; inflateSync tolerates a
    // trailing byte or two of slop, so slicing up to "endstream" and
    // letting inflate stop at the zlib footer is sufficient here.
    const rawStreamBytes = buffer.subarray(dataStart, dataEnd)

    objects.push({ num, dict, streamBytes: rawStreamBytes })
  }

  return objects
}

/** Best-effort inflate: returns the inflated buffer, or the raw bytes verbatim if inflation fails (not Flate-compressed). */
function tryInflate(raw: Buffer): Buffer {
  try {
    return zlib.inflateSync(raw)
  } catch {
    return raw
  }
}

// ─── ToUnicode CMap parsing ─────────────────────────────────────────────

type CMap = Map<number, string>

/**
 * Parses a ToUnicode CMap stream's `beginbfchar`/`endbfchar` section into
 * a code -> Unicode string map. Each entry is `<code><dst>` where dst is
 * one or more UTF-16BE code units (multi-unit entries encode ligatures,
 * e.g. code 0x39 -> "fi").
 */
function parseCMap(cmapText: string): CMap {
  const map: CMap = new Map()
  const bfcharSectionPattern = /beginbfchar([\s\S]*?)endbfchar/g
  let section: RegExpExecArray | null
  // The destination side of a bfchar entry can carry MULTIPLE UTF-16BE
  // code units separated by whitespace (a ligature — e.g. `<0039>
  // <0066 0069>` maps one CID to "fi"). The dst group must therefore
  // allow embedded whitespace, or multi-unit entries silently fail to
  // match and their codepoint drops out of the map entirely.
  const entryPattern = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F\s]+)>/g

  while ((section = bfcharSectionPattern.exec(cmapText))) {
    let entry: RegExpExecArray | null
    entryPattern.lastIndex = 0
    const body = section[1]
    while ((entry = entryPattern.exec(body))) {
      const code = parseInt(entry[1], 16)
      const dstHex = entry[2].replace(/\s+/g, '')
      let decoded = ''
      for (let i = 0; i < dstHex.length; i += 4) {
        decoded += String.fromCharCode(parseInt(dstHex.slice(i, i + 4), 16))
      }
      map.set(code, decoded)
    }
  }

  return map
}

// ─── Font resource name -> CMap resolution ─────────────────────────────

/**
 * Builds a map from font resource name (e.g. "F2") to its ToUnicode
 * CMap, by (1) collecting every `/Font << /FN N 0 R ... >>` resource
 * dictionary in the document, (2) resolving each referenced font
 * object's `/ToUnicode M 0 R` entry, and (3) parsing object M's stream.
 * Assumes resource names are unique across the document — true for the
 * single-page documents these three renderers produce.
 */
function buildFontCMaps(objects: PdfObject[]): Map<string, CMap> {
  const objectsByNum = new Map(objects.map((o) => [o.num, o]))
  const fontNameToObjNum = new Map<string, number>()

  const fontDictPattern = /\/Font\s*<<([\s\S]*?)>>/g
  const fontRefPattern = /\/(\w+)\s+(\d+)\s+0\s+R/g

  for (const obj of objects) {
    let dictMatch: RegExpExecArray | null
    fontDictPattern.lastIndex = 0
    while ((dictMatch = fontDictPattern.exec(obj.dict))) {
      let refMatch: RegExpExecArray | null
      fontRefPattern.lastIndex = 0
      const body = dictMatch[1]
      while ((refMatch = fontRefPattern.exec(body))) {
        fontNameToObjNum.set(refMatch[1], Number(refMatch[2]))
      }
    }
  }

  const result = new Map<string, CMap>()
  for (const [fontName, fontObjNum] of fontNameToObjNum) {
    const fontObj = objectsByNum.get(fontObjNum)
    if (!fontObj) continue
    const toUnicodeMatch = /\/ToUnicode\s+(\d+)\s+0\s+R/.exec(fontObj.dict)
    if (!toUnicodeMatch) continue
    const cmapObj = objectsByNum.get(Number(toUnicodeMatch[1]))
    if (!cmapObj || !cmapObj.streamBytes) continue
    const cmapText = tryInflate(cmapObj.streamBytes).toString('latin1')
    if (!cmapText.includes('begincmap')) continue
    result.set(fontName, parseCMap(cmapText))
  }

  return result
}

// ─── Content-stream text extraction ────────────────────────────────────

/**
 * Decodes a single PDF string literal's escape sequences (`\(`, `\)`,
 * `\\`, `\n`, octal `\ddd`) into raw bytes, for the simple-font `(...)
 * Tj` fallback path. Treated as Latin-1/PDFDocEncoding-ish — a best
 * effort, since this path is not exercised by any of the three
 * Identity-H renderers this suite proves, but must not be invisible to
 * a future caller whose renderer falls back to a standard-14 font.
 */
function decodeLiteralString(raw: string): string {
  let out = ''
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i]
    if (ch !== '\\') {
      out += ch
      continue
    }
    const next = raw[i + 1]
    if (next === 'n') {
      out += '\n'
      i += 1
    } else if (next === 'r') {
      out += '\r'
      i += 1
    } else if (next === 't') {
      out += '\t'
      i += 1
    } else if (next >= '0' && next <= '7') {
      const octal = raw.slice(i + 1, i + 4).match(/^[0-7]{1,3}/)?.[0] ?? ''
      out += String.fromCharCode(parseInt(octal, 8))
      i += octal.length
    } else {
      out += next
      i += 1
    }
  }
  return out
}

/**
 * Decodes one content stream's visible text, tracking the active font
 * resource (set by `/FN size Tf`) so each hex-encoded text-showing
 * operator is mapped through the correct font's CMap.
 */
function extractTextFromContentStream(content: string, fontCMaps: Map<string, CMap>): string {
  let out = ''
  let currentCMap: CMap | undefined

  // Matches, in document order: a font selector, an array text-show
  // (TJ), or a single hex/literal text-show (Tj). Only one of the three
  // alternatives matches per iteration.
  const opPattern = /\/(\w+)\s+[\d.]+\s+Tf|\[((?:<[0-9a-fA-F]*>|\([^)]*\)|[^[\]])*)\]\s*TJ|<([0-9a-fA-F]+)>\s*Tj|\(([^)]*)\)\s*Tj/g
  let match: RegExpExecArray | null

  const decodeHex = (hex: string): string => {
    let decoded = ''
    for (let i = 0; i < hex.length; i += 4) {
      const code = parseInt(hex.slice(i, i + 4), 16)
      decoded += currentCMap?.get(code) ?? ''
    }
    return decoded
  }

  while ((match = opPattern.exec(content))) {
    const [, fontName, tjArray, hexTj, literalTj] = match
    if (fontName !== undefined) {
      currentCMap = fontCMaps.get(fontName)
      continue
    }
    if (tjArray !== undefined) {
      const tokenPattern = /<([0-9a-fA-F]*)>|\(([^)]*)\)/g
      let token: RegExpExecArray | null
      while ((token = tokenPattern.exec(tjArray))) {
        if (token[1] !== undefined) out += decodeHex(token[1])
        else if (token[2] !== undefined) out += decodeLiteralString(token[2])
      }
      continue
    }
    if (hexTj !== undefined) {
      out += decodeHex(hexTj)
      continue
    }
    if (literalTj !== undefined) {
      out += decodeLiteralString(literalTj)
    }
  }

  return out
}

// ─── Public API ─────────────────────────────────────────────────────────

/**
 * Extracts the concatenated visible text of a rendered PDF buffer as a
 * Unicode string. Decodes @react-pdf/renderer's composite Type0 /
 * Identity-H / ToUnicode structure directly from the PDF bytes using
 * only Node's built-in zlib — see module header for the exact structure
 * this handles.
 */
export function extractPdfText(buffer: Buffer): string {
  const objects = extractObjects(buffer)
  const fontCMaps = buildFontCMaps(objects)

  let text = ''
  for (const obj of objects) {
    if (!obj.streamBytes) continue
    const inflated = tryInflate(obj.streamBytes)
    const asLatin1 = inflated.toString('latin1')
    // A content stream contains real text-showing operators; a
    // ToUnicode CMap stream (already consumed above) contains
    // "begincmap" instead; font-program and image streams contain
    // neither and are binary noise here.
    if (!asLatin1.includes('begincmap') && /\bBT\b[\s\S]*\bET\b/.test(asLatin1)) {
      text += extractTextFromContentStream(asLatin1, fontCMaps)
    }
  }

  return text
}
