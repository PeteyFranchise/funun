#!/usr/bin/env node
// ─── Marketing artifact verifier ────────────────────────────────────────
// Quick task 260930-ibp, Task 2. Asserts the generated artifact
// (assets/marketing/landing.html) never shipped bench chrome, placeholder
// labels or internal decision commentary (T-ibp-01, high severity — this
// repo is public), and that the mechanical contracts the route handler
// depends on (nonce placeholder count, asset paths) hold.
//
// Every prohibited literal is checked independently and ALL violations are
// collected before reporting, so a failure names every offender at once
// rather than stopping at the first.
//
// CLI:
//   npx tsx scripts/verify-marketing-artifact.ts
//     Reads assets/marketing/landing.html + assets/marketing/manifest.json,
//     runs every check, prints one line per violation and exits 1 if any
//     were found, or prints a single "verify ok" line and exits 0.

import { readFileSync } from 'node:fs'
import { NONCE_PLACEHOLDER, ARTIFACT_OUTPUT_PATH, countOccurrences } from './build-marketing-artifact'
import { MANIFEST_PATH, type MarketingManifest } from './marketing-assets'

// F6: a bare "bench" match is unusable -- "the AI tool bench" is legitimate
// visible marketing copy. Every literal below is precise enough that it
// only matches actual bench-chrome / internal-decision residue.
export const PROHIBITED_LITERALS: readonly string[] = [
  'data-ship',
  'class="flag"',
  'ph-art',
  'phnote',
  'data-authopen',
  'Bench 02',
  'shipexit',
  'shipOn',
  'shipOff',
  'Bench mock',
  'authdlg',
  '127.0.0.1:4321',
  '.planning/',
  'OWNER DECISION',
  'owner-approved',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
]

// class="flag" alone (exact-match, from PROHIBITED_LITERALS) would miss the
// footer note's `class="flag reveal"` -- five distinct .flag paragraphs
// exist in the source and only four use the bare form. This prefix check
// closes that gap.
const FLAG_CLASS_PREFIX_RE = /class="flag(?:"|\s)/g

const MAIN_PADDING_RULE = 'main{padding-top:44px}'
const BODY_DATA_ATTRS = '<body data-bg="black" data-hero="stream">'

const ASSET_REFERENCE_RE = /\/marketing\/(?:img|fonts)\/[A-Za-z0-9_./-]+/g

export function verifyArtifact(html: string, manifest: MarketingManifest): string[] {
  const violations: string[] = []

  for (const literal of PROHIBITED_LITERALS) {
    const count = countOccurrences(html, literal)
    if (count > 0) {
      violations.push(`prohibited literal "${literal}" occurs ${count} time(s)`)
    }
  }

  const flagPrefixMatches = html.match(FLAG_CLASS_PREFIX_RE) ?? []
  if (flagPrefixMatches.length > 0) {
    violations.push(
      `${flagPrefixMatches.length} occurrence(s) of class="flag..." remain (checked as a ` +
        'prefix, not an exact match, so "class=\\"flag reveal\\"" cannot slip through)',
    )
  }

  if (countOccurrences(html, MAIN_PADDING_RULE) !== 1) {
    violations.push(
      `${MAIN_PADDING_RULE} must survive toolbar removal exactly once (it affects visible ` +
        'geometry) -- found ' + countOccurrences(html, MAIN_PADDING_RULE),
    )
  }

  if (countOccurrences(html, BODY_DATA_ATTRS) !== 1) {
    violations.push(
      `<body data-bg="black" data-hero="stream"> must survive exactly once -- found ` +
        countOccurrences(html, BODY_DATA_ATTRS),
    )
  }

  const scriptTagCount = countOccurrences(html, '<script')
  const noncedScriptTagCount = countOccurrences(html, `<script nonce="${NONCE_PLACEHOLDER}"`)
  if (scriptTagCount === 0) {
    violations.push('no <script> tag survived sanitization -- expected exactly 1')
  } else if (scriptTagCount !== noncedScriptTagCount) {
    violations.push(
      `${scriptTagCount} <script> tag(s) present but only ${noncedScriptTagCount} carry the ` +
        'nonce placeholder -- every surviving script must be nonced or the CSP blocks it',
    )
  }
  if (manifest.nonceScriptCount !== undefined && scriptTagCount !== manifest.nonceScriptCount) {
    violations.push(
      `manifest records nonceScriptCount=${manifest.nonceScriptCount} but the artifact has ` +
        `${scriptTagCount} <script> tag(s)`,
    )
  }

  // Excludes bare directory prefixes like /marketing/img/art/ -- the
  // Selects track list builds that path by JS concatenation
  // ('/marketing/img/art/' + slug + '.jpg'), so the prefix alone is not a
  // requestable asset and was never meant to appear in the manifest by
  // itself; only complete, extensioned paths are validated here.
  const referencedAssets = new Set(
    (html.match(ASSET_REFERENCE_RE) ?? []).filter((p) => /\.[A-Za-z0-9]+$/.test(p)),
  )
  const manifestAssets = new Set(manifest.assets)
  for (const asset of referencedAssets) {
    if (!manifestAssets.has(asset)) {
      violations.push(`artifact references ${asset}, which is not in ${MANIFEST_PATH}`)
    }
  }

  return violations
}

function main(): void {
  const html = readFileSync(ARTIFACT_OUTPUT_PATH, 'utf8')
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as MarketingManifest
  const violations = verifyArtifact(html, manifest)
  if (violations.length > 0) {
    // eslint-disable-next-line no-console
    console.error(`FAIL: ${violations.length} violation(s):`)
    for (const v of violations) {
      // eslint-disable-next-line no-console
      console.error(`  - ${v}`)
    }
    process.exit(1)
  }
  // eslint-disable-next-line no-console
  console.log(`verify ok — ${ARTIFACT_OUTPUT_PATH} passes all checks`)
}

if (require.main === module) {
  main()
}
