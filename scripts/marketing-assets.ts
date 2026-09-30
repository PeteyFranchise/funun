#!/usr/bin/env node
// ─── Marketing asset manifest — browser-verified, never grepped ───────────
// Quick task 260930-ibp, Task 1. The frozen bench page
// (private/bench/marketing.html) builds some image paths in JS (the `SEL`
// carousel array) rather than writing them as string literals, and its
// carousel panels only fetch an image once their tab is selected. A literal
// grep therefore undercounts what a real page load requests: grep finds 40,
// this file's static union finds 43 (grep + the SEL expansion), and the
// rendered page in a browser with every tab/popover exercised loads ~45.
//
// This module is split so the gap is provable, not asserted:
//   - extractLiteralImagePaths / extractLiteralFontPaths / extractSelSlugs /
//     expandSelArtPaths / getStaticImageCandidateSet are the STATIC side —
//     pure string functions over the frozen HTML, fully unit-testable.
//   - parseHarAssetPaths reads what a real browser actually requested,
//     because that is the only thing that can catch a construction site in
//     the JS this module's static analysis does not know to look for.
//   - reconcileAssetSets is the check that ties them together: every
//     observed (browser) path MUST be explainable by the static candidate
//     set. An observed path that isn't is a hard finding, not a fixture to
//     quietly widen the regex for.
//
// CLI:
//   npx tsx scripts/marketing-assets.ts           — build: requires
//     private/bench/baseline/manifest.har to exist (produced in a real
//     browser, never headless-installed for this task — see
//     <package_legitimacy> in the plan). Reconciles, copies the
//     manifest-listed files into public/marketing/, and writes
//     assets/marketing/manifest.json.
//   npx tsx scripts/marketing-assets.ts --check   — validate only, no
//     writes: re-verifies the frozen source, re-parses the HAR, and asserts
//     assets/marketing/manifest.json is consistent with both. This is the
//     command the plan's automated verification block runs.

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

// ─── frozen baseline ────────────────────────────────────────────────────

export const FROZEN_SHA256 =
  '1995cbe96a0638fcddf8759e836adbbcc6ab1cda43be0fe35e6e62765c973cb5'
export const FROZEN_LINE_COUNT = 2145

export const BENCH_SOURCE_PATH = 'private/bench/marketing.html'
export const BENCH_IMG_DIR = 'private/bench/img'
export const BENCH_FONT_DIR = 'private/bench/fonts'
export const HAR_PATH = 'private/bench/baseline/manifest.har'
export const MANIFEST_PATH = 'assets/marketing/manifest.json'
export const PUBLIC_ASSET_ROOT = 'public/marketing'

// Only these 7 back live text on the frozen render (unit 1 verification).
// Lobster, Monoton and Yellowtail back the bench-only type switcher and
// must never be copied or referenced in the shipped artifact.
export const PRODUCTION_FONT_FILES = [
  'fonts/grand-hotel-400.woff2',
  'fonts/inter-400.woff2',
  'fonts/inter-500.woff2',
  'fonts/inter-600.woff2',
  'fonts/inter-700.woff2',
  'fonts/inter-800.woff2',
  'fonts/inter-900.woff2',
] as const

export type FrozenSourceCheck = {
  matches: boolean
  sha256: string
  lineCount: number
}

export function computeSha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

export function verifyFrozenSource(content: string): FrozenSourceCheck {
  const sha256 = computeSha256(content)
  // Match `wc -l` semantics (count of newline characters), not
  // String.split('\n').length, which is always one higher — that off-by-one
  // is exactly what made this check disagree with the plan's own `wc -l`
  // verification the first time this ran.
  const lineCount = (content.match(/\n/g) ?? []).length
  return {
    matches: sha256 === FROZEN_SHA256 && lineCount === FROZEN_LINE_COUNT,
    sha256,
    lineCount,
  }
}

// ─── static candidate set ──────────────────────────────────────────────

const LITERAL_IMAGE_RE = /img\/[A-Za-z0-9_./-]+\.(?:jpe?g|png|svg|webp)/g
const LITERAL_FONT_RE = /fonts\/[A-Za-z0-9_.-]+\.woff2?/g

export function extractLiteralImagePaths(html: string): string[] {
  const matches = html.match(LITERAL_IMAGE_RE) ?? []
  return Array.from(new Set(matches)).sort()
}

export function extractLiteralFontPaths(html: string): string[] {
  const matches = html.match(LITERAL_FONT_RE) ?? []
  return Array.from(new Set(matches)).sort()
}

// Parses `const SEL=[ ['Title','slug','3:24'], ... ]` and returns the slug
// (second tuple element) from each row. Anchored on the declaration so a
// change to an unrelated array never leaks into this result.
const SEL_BLOCK_RE = /const SEL\s*=\s*\[([\s\S]*?)\];/
const SEL_ROW_RE = /\[\s*'(?:[^'\\]|\\.)*'\s*,\s*'((?:[^'\\]|\\.)*)'\s*,\s*'(?:[^'\\]|\\.)*'\s*\]/g

export function extractSelSlugs(html: string): string[] {
  const block = html.match(SEL_BLOCK_RE)
  if (!block) return []
  const slugs: string[] = []
  let m: RegExpExecArray | null
  SEL_ROW_RE.lastIndex = 0
  while ((m = SEL_ROW_RE.exec(block[1])) !== null) {
    slugs.push(m[1])
  }
  return slugs
}

export function expandSelArtPaths(slugs: string[]): string[] {
  return slugs.map((slug) => `img/art/${slug}.jpg`)
}

export function getStaticImageCandidateSet(html: string): string[] {
  const literal = extractLiteralImagePaths(html)
  const fromSel = expandSelArtPaths(extractSelSlugs(html))
  return Array.from(new Set([...literal, ...fromSel])).sort()
}

export function getStaticFontCandidateSet(html: string): string[] {
  return extractLiteralFontPaths(html)
}

// ─── browser-observed set (HAR) ─────────────────────────────────────────

type HarEntry = {
  request?: { url?: string }
  response?: { content?: { mimeType?: string } }
}

type HarLike = {
  log?: { entries?: HarEntry[] }
}

const ASSET_CONTENT_TYPE_RE = /^(image\/|font\/|application\/font|application\/x-font)/

export function parseHarAssetPaths(har: HarLike): string[] {
  const entries = har.log?.entries ?? []
  const found = new Set<string>()
  for (const entry of entries) {
    const url = entry.request?.url
    const mimeType = entry.response?.content?.mimeType ?? ''
    if (!url) continue
    const isAssetType =
      ASSET_CONTENT_TYPE_RE.test(mimeType) || /\.(jpe?g|png|svg|webp|woff2?)(\?|$)/i.test(url)
    if (!isAssetType) continue
    let pathname: string
    try {
      pathname = new URL(url).pathname
    } catch {
      continue
    }
    // Strip the served-page prefix down to the `img/...` / `fonts/...`
    // relative form the static analysis produces, and drop the `?v=`
    // cache-buster the document appends from its ASSET_V constant.
    const relative = pathname.replace(/^\/+/, '').replace(/^marketing\//, '')
    const match = relative.match(/^(img\/.+\.(?:jpe?g|png|svg|webp)|fonts\/.+\.woff2?)$/i)
    if (match) found.add(match[1])
  }
  return Array.from(found).sort()
}

// ─── reconcile ──────────────────────────────────────────────────────────

export type ReconcileResult = {
  ok: boolean
  observedCount: number
  unaccounted: string[]
}

export function reconcileAssetSets(
  observed: string[],
  staticImages: string[],
  staticFonts: string[],
): ReconcileResult {
  const allowed = new Set([...staticImages, ...staticFonts])
  const unaccounted = observed.filter((path) => !allowed.has(path))
  return { ok: unaccounted.length === 0, observedCount: observed.length, unaccounted }
}

// ─── manifest shape ─────────────────────────────────────────────────────

export type MarketingManifest = {
  sourceSha256: string
  harCapturedAt: string
  assets: string[]
  fonts: string[]
  nonceScriptCount?: number
}

// ─── CLI ────────────────────────────────────────────────────────────────

function readSourceHtml(): string {
  return readFileSync(BENCH_SOURCE_PATH, 'utf8')
}

function fail(message: string): never {
  // eslint-disable-next-line no-console
  console.error(`FAIL: ${message}`)
  process.exit(1)
}

function runCheck(): void {
  const html = readSourceHtml()
  const check = verifyFrozenSource(html)
  if (!check.matches) {
    fail(
      `frozen source mismatch — sha256=${check.sha256} lines=${check.lineCount}, ` +
        `expected sha256=${FROZEN_SHA256} lines=${FROZEN_LINE_COUNT}`,
    )
  }

  if (!existsSync(HAR_PATH)) {
    fail(
      `${HAR_PATH} does not exist. This file must be produced by opening ` +
        'private/bench/ in a real browser and exporting the Network panel HAR — ' +
        'see Task 1 Step 2. Nothing here substitutes a grep or a headless browser for it.',
    )
  }
  const har = JSON.parse(readFileSync(HAR_PATH, 'utf8')) as HarLike
  const observed = parseHarAssetPaths(har)
  const staticImages = getStaticImageCandidateSet(html)
  const staticFonts = getStaticFontCandidateSet(html)
  const reconciled = reconcileAssetSets(observed, staticImages, staticFonts)
  if (!reconciled.ok) {
    fail(
      `browser observed asset(s) not derivable from static analysis: ` +
        reconciled.unaccounted.join(', '),
    )
  }

  if (!existsSync(MANIFEST_PATH)) {
    fail(`${MANIFEST_PATH} does not exist — run the build step first (no --check flag).`)
  }
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as MarketingManifest
  if (manifest.sourceSha256 !== FROZEN_SHA256) {
    fail(`manifest sourceSha256 does not match the frozen hash`)
  }
  for (const asset of manifest.assets) {
    const onDisk = join('public', asset)
    if (!existsSync(onDisk)) {
      fail(`manifest lists ${asset} but ${onDisk} does not exist on disk`)
    }
  }
  if (manifest.fonts.length !== PRODUCTION_FONT_FILES.length) {
    fail(
      `manifest lists ${manifest.fonts.length} font(s), expected exactly ` +
        `${PRODUCTION_FONT_FILES.length}`,
    )
  }
  // eslint-disable-next-line no-console
  console.log(
    `assets ok — ${manifest.assets.length} asset(s), ${manifest.fonts.length} font(s), ` +
      `observed ${reconciled.observedCount} via HAR`,
  )
}

function runBuild(): void {
  const html = readSourceHtml()
  const check = verifyFrozenSource(html)
  if (!check.matches) {
    fail(
      `frozen source mismatch — sha256=${check.sha256} lines=${check.lineCount}, ` +
        `expected sha256=${FROZEN_SHA256} lines=${FROZEN_LINE_COUNT}`,
    )
  }

  if (!existsSync(HAR_PATH)) {
    fail(
      `${HAR_PATH} does not exist yet.\n\n` +
        'ONE INSTRUCTION: serve private/bench/ over plain HTTP with a tool already ' +
        'on this machine — from the repo root, run `python3 -m http.server 4321 ' +
        '--directory private/bench` (no install needed; the bench page will not ' +
        'work from a file:// or data: URL) — then open ' +
        'http://127.0.0.1:4321/marketing.html in a real browser with the Network ' +
        'panel recording, click every carousel tab, open every popover, flip the ' +
        'pricing toggle, and scroll the full page so lazy images fetch. Then export ' +
        `the Network panel as a HAR and save it to ${HAR_PATH}.\n\n` +
        'This step cannot be automated in this session (no Chrome MCP / browser ' +
        'automation tool is available), and the plan explicitly forbids ' +
        'substituting a grep or installing a headless browser for it.',
    )
  }

  const har = JSON.parse(readFileSync(HAR_PATH, 'utf8')) as HarLike
  const observed = parseHarAssetPaths(har)
  const staticImages = getStaticImageCandidateSet(html)
  const staticFonts = getStaticFontCandidateSet(html)
  const reconciled = reconcileAssetSets(observed, staticImages, staticFonts)
  if (!reconciled.ok) {
    fail(
      `browser observed asset(s) not derivable from static analysis — a construction ` +
        `site in the JS this module does not account for: ${reconciled.unaccounted.join(', ')}`,
    )
  }

  const imagesToCopy = observed.filter((path) => path.startsWith('img/')).sort()
  const fontsToCopy = PRODUCTION_FONT_FILES.filter((path) => staticFonts.includes(path))
  if (fontsToCopy.length !== PRODUCTION_FONT_FILES.length) {
    fail('one or more production font files is missing from the frozen source')
  }

  for (const relative of imagesToCopy) {
    const src = join(BENCH_IMG_DIR, relative.replace(/^img\//, ''))
    const dest = join(PUBLIC_ASSET_ROOT, relative)
    if (!existsSync(src)) fail(`asset observed in browser but missing on disk: ${src}`)
    mkdirSync(dirname(dest), { recursive: true })
    copyFileSync(src, dest)
  }
  for (const relative of fontsToCopy) {
    const src = join(BENCH_FONT_DIR, relative.replace(/^fonts\//, ''))
    const dest = join(PUBLIC_ASSET_ROOT, relative)
    if (!existsSync(src)) fail(`font file missing on disk: ${src}`)
    mkdirSync(dirname(dest), { recursive: true })
    copyFileSync(src, dest)
  }

  const harStat = JSON.parse(readFileSync(HAR_PATH, 'utf8')) as { log?: { pages?: { startedDateTime?: string }[] } }
  const harCapturedAt = harStat.log?.pages?.[0]?.startedDateTime ?? new Date(0).toISOString()

  const manifest: MarketingManifest = {
    sourceSha256: FROZEN_SHA256,
    harCapturedAt,
    assets: [...imagesToCopy, ...fontsToCopy].map((p) => `/marketing/${p}`).sort(),
    fonts: fontsToCopy.map((p) => `/marketing/${p}`).sort(),
  }
  mkdirSync(dirname(MANIFEST_PATH), { recursive: true })
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`)
  // eslint-disable-next-line no-console
  console.log(
    `wrote ${MANIFEST_PATH}: ${manifest.assets.length} asset(s), ${manifest.fonts.length} font(s)`,
  )
}

function main(): void {
  const isCheck = process.argv.includes('--check')
  if (isCheck) {
    runCheck()
  } else {
    runBuild()
  }
}

if (require.main === module) {
  main()
}
