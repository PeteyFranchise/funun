import { readFileSync, readdirSync, statSync } from 'fs'
import path from 'path'

// ─────────────────────────────────────────────────────────────────────────
// The CI boundary for the split-sheet identity fix (quick task 260926-v1w).
//
// WHY THIS EXISTS. Three surfaces (the owner page, the /approve token page,
// the mint route) each resolved a split-sheet party's identity
// independently before this fix, and a fourth (the DocuSeal completion
// webhook, Finding A) built the Certificate of Signature the same way.
// Convention — "just call resolvePartyIdentitiesForSheet()" — is exactly
// what already failed once (the old live-identity.ts resolver existed and
// two of three surfaces ignored it). This test makes the boundary a build
// failure instead of a review comment.
//
// SCOPE, STATED PRECISELY. "None of the four readers reads identity
// columns independently" is enforced as: none of their own .select() call
// bodies (the actual database query sent to Supabase) names an identity
// column. This is deliberately NARROWER than "the file's source text never
// contains the string 'pro'" — every one of the four files legitimately
// destructures the RESOLVED identity object by field name
// (`resolved.publishing_designee`, `identity.pro`, ...) to build its own
// output shape, and there is no way to consume that object without
// spelling its field names. That is the intended way to consume the
// resolver's contract, not a boundary violation; the security-relevant
// question is whether the file queries Supabase for those columns itself,
// which the .select()-body scan answers precisely. Per the plan's own
// <gate_hygiene> section: the per-task `sed | grep` gates are cruder than
// this and are not authoritative where they disagree with this file.
//
// codeOnly() is copied verbatim from
// __tests__/placements-client-server-boundary.test.ts:32-38 — its own
// header explains why a raw-text scan reads a comment as code.
//
// DRY-RUN RESULTS AGAINST THE PRE-FIX TREE (3499f7f2), recorded before
// this file's assertions were written, per the plan's mandate that an
// assertion never observed failing is not a check:
//   - "each of the four readers imports resolve-party-identities.server"
//     FAILED on all four pre-fix files (none of them imported it — the
//     module did not exist). Confirmed via
//     `git show 3499f7f2:<path> | grep resolve-party-identities` for each
//     of the four paths, which returned no matches.
//   - "the owner page's and mint route's own .select() bodies name no
//     identity column" FAILED pre-fix: both selected
//     `pro, ipi, legal_name, publishing_designee, administrator` directly
//     on `split_sheet_parties`.
//   - "lib/split-sheets/live-identity.ts does not exist" FAILED pre-fix:
//     `git show 3499f7f2:lib/split-sheets/live-identity.ts` printed the
//     file.
//   - The approve page and docuseal webhook selected `*` / raw identity
//     columns pre-fix rather than naming them in the select string, so the
//     .select()-body scan does not independently catch those two — the
//     import-check above is what fails for them, which is sufficient: at
//     least one assertion in this suite fails for every pre-fix file.
// ─────────────────────────────────────────────────────────────────────────

const ROOT = process.cwd()
const RESOLVER_IMPORT = '@/lib/split-sheets/resolve-party-identities.server'

const IDENTITY_COLUMNS = ['legal_name', 'pro', 'ipi', 'publishing_designee', 'administrator'] as const

const READER_FILES = [
  'app/(artist)/split-sheets/[id]/page.tsx',
  'app/approve/[token]/page.tsx',
  'app/api/split-sheets/[id]/mint-envelope/route.ts',
  'app/api/webhooks/docuseal/route.ts',
]

// Files legitimately allowed to contain the identity-column NAMES in code,
// for a reason other than "this file independently queries them from
// Supabase" — each entry states which reason applies. This is the seed
// list the plan's brief already audited (2026-09-26), plus the four
// converted readers themselves, which — after conversion — legitimately
// destructure the RESOLVED identity object by field name (see this file's
// header for why that is not a boundary violation).
const IDENTITY_NAME_ALLOWLIST: Record<string, string> = {
  'lib/split-sheets/identity-policy.ts': 'the pure policy module — owns the field names by definition',
  'lib/split-sheets/resolve-party-identities.server.ts': 'the one resolver — the only legitimate DB reader',
  'lib/split-sheets/resolve-party-identities.server.test.ts': 'tests the resolver directly',
  'lib/split-sheets/identity-policy.test.ts': 'tests the policy module directly',
  'app/api/split-sheets/route.ts': 'legitimate writer — sheet creation (plan claim 11)',
  'app/api/split-sheets/[id]/route.ts': 'legitimate writer — builder PATCH save (plan claim 11)',
  'app/api/approve/[token]/route.ts': 'legitimate writer — guest approval action (plan claim 11)',
  'app/api/vault/[projectId]/tracks/[trackId]/route.ts': 'legitimate writer — track/composer sync (plan claim 11; normalizeName() join is a recorded HAZARD, not fixed here)',
  'lib/split-sheets/list.ts': 'wide projection, nothing renders it — verified 2026-09-26 (SplitSheetList.tsx has no identity reference)',
  'lib/split-sheets/change-summary.ts': 'type declaration / comment only, no query',
  'lib/split-sheets/identity-flags.ts': 'type declarations only, no query — publisher/publishing_designee is a display-mapping constant',
  'lib/vault/pdf/split-sheet.tsx': 'the PDF sink — receives resolved values as props, does not read them from Supabase',
  'lib/vault/pdf/split-sheet.test.ts': 'tests the PDF sink directly with fixture data, no query',
  'lib/split-sheets/approval.ts': 'SplitSheetParty type declaration only, no query',
  'lib/split-sheets/change-summary.test.ts': 'tests change-summary.ts fixtures, no query',
  'components/split-sheets/SplitSheetBuilder.tsx': 'props from a server component (the owner page), not a query',
  'components/split-sheets/StagedFlagPanel.tsx': 'props from a server component (the owner page), not a query',
  'components/split-sheets/SplitApprovalView.tsx': 'props from a server component (the approve page), not a query',
  // The four converted readers — after 260926-v1w, each destructures the
  // RESOLVED identity object by field name to build its own output shape
  // (ExistingSheetParty / SplitSheetParty / the certificate input /
  // partyIdentity prop). Their .select() call bodies are checked
  // separately below and MUST be clean — that is the actual boundary.
  'app/(artist)/split-sheets/[id]/page.tsx': 'consumes resolvePartyIdentitiesForSheet()’s return by field name — its OWN .select() is checked separately below',
  'app/approve/[token]/page.tsx': 'consumes resolvePartyIdentitiesForSheet()’s return by field name — its OWN .select() is checked separately below',
  'app/api/split-sheets/[id]/mint-envelope/route.ts': 'consumes resolvePartyIdentitiesForSheet()’s return by field name — its OWN .select() is checked separately below',
  'app/api/webhooks/docuseal/route.ts': 'consumes resolvePartyIdentitiesForSheet()’s return by field name — its OWN .select() is checked separately below',
}

// Strip comments before matching — copied verbatim from
// __tests__/placements-client-server-boundary.test.ts:32-38.
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map(line => line.replace(/^\s*\/\/.*$/, ''))
    .join('\n')
}

/** The paren-balanced substring starting right after the opening paren at
 * `openParenIdx`, handling nested parens (a `split_sheet_parties(...)`
 * embed can itself nest a further `split_sheets(...)` embed). */
function balancedSubstring(src: string, openParenIdx: number): string {
  let depth = 1
  let i = openParenIdx + 1
  const bodyStart = i
  while (i < src.length && depth > 0) {
    if (src[i] === '(') depth++
    else if (src[i] === ')') depth--
    i++
  }
  return src.slice(bodyStart, i - 1)
}

/**
 * Every projection string that actually touches split_sheet_parties:
 *   - a nested embed, `split_sheet_parties(...)` or `split_sheet_parties
 *     !inner(...)` (the PostgREST modifier syntax) — its own inner column
 *     list only, not the outer select it's embedded in
 *   - a `.from('split_sheet_parties')` chain's own `.select(...)` body
 *
 * Scoping to these two shapes — rather than every `.select()` call in the
 * file — avoids false-flagging an UNRELATED table's legitimate select
 * that happens to also request a same-named column (e.g. the owner page's
 * own `user_profiles` form-prefill read also selects `pro`/`ipi`/
 * `administrator` — those are Settings columns, not split_sheet_parties
 * columns, and reading them for a form prefill is explicitly allowed by
 * the plan; `collaborators.pro`/`collaborators.ipi` are a second real
 * example found while writing this test, see
 * app/(artist)/collaborators/page.tsx).
 */
function splitSheetPartiesProjections(src: string): string[] {
  const projections: string[] = []

  const embedPattern = /split_sheet_parties(?:![a-zA-Z]+)?\s*\(/g
  let match: RegExpExecArray | null
  while ((match = embedPattern.exec(src)) !== null) {
    const openParenIdx = match.index + match[0].length - 1
    projections.push(balancedSubstring(src, openParenIdx))
  }

  const fromPattern = /\.from\(\s*['"]split_sheet_parties['"]\s*\)/g
  while ((match = fromPattern.exec(src)) !== null) {
    const selectIdx = src.indexOf('.select(', match.index)
    // A ~400-char window covers every real call site in this codebase,
    // which chains .select() immediately after .from() (a much larger gap
    // would mean an unrelated .select() for a different table).
    if (selectIdx !== -1 && selectIdx - match.index < 400) {
      const openParenIdx = selectIdx + '.select('.length - 1
      projections.push(balancedSubstring(src, openParenIdx))
    }
  }

  return projections
}

function containsIdentityColumn(text: string): string | null {
  for (const col of IDENTITY_COLUMNS) {
    const re = new RegExp(`\\b${col}\\b`)
    if (re.test(text)) return col
  }
  return null
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full)
  }
  return out
}

describe('split-sheet identity boundary (260926-v1w)', () => {
  it.each(READER_FILES)('%s imports the one resolver', file => {
    const src = codeOnly(readFileSync(path.join(ROOT, file), 'utf8'))
    expect(src).toContain(RESOLVER_IMPORT)
  })

  it.each(READER_FILES)('%s’s own split_sheet_parties projection names no identity column', file => {
    const src = codeOnly(readFileSync(path.join(ROOT, file), 'utf8'))
    const offendingColumns = splitSheetPartiesProjections(src)
      .map(containsIdentityColumn)
      .filter((col): col is string => col !== null)
    expect(offendingColumns).toEqual([])
  })

  it('lib/split-sheets/identity-policy.ts is never imported by a ’use client’ component', () => {
    // Same walk as placements-client-server-boundary.test.ts:72-84.
    const offenders: string[] = []
    for (const file of [...walk(path.join(ROOT, 'components')), ...walk(path.join(ROOT, 'app'))]) {
      const raw = readFileSync(file, 'utf8')
      if (!/^\s*['"]use client['"]/m.test(raw)) continue
      if (codeOnly(raw).includes('@/lib/split-sheets/identity-policy')) {
        offenders.push(path.relative(ROOT, file))
      }
    }
    expect(offenders).toEqual([])
  })

  it('lib/split-sheets/live-identity.ts does not exist', () => {
    expect(() => readFileSync(path.join(ROOT, 'lib/split-sheets/live-identity.ts'), 'utf8')).toThrow()
    expect(() => readFileSync(path.join(ROOT, 'lib/split-sheets/live-identity.test.ts'), 'utf8')).toThrow()
  })

  it('migration 228 carries the GRANT SELECT for all three new columns (Finding B)', () => {
    const files = readdirSync(path.join(ROOT, 'supabase/migrations'))
    const match = files.find(f => f.startsWith('228_'))
    expect(match).toBeDefined()
    const src = readFileSync(path.join(ROOT, 'supabase/migrations', match!), 'utf8')
    expect(src).toMatch(/GRANT SELECT/)
    for (const col of ['identity_source', 'identity_submitted_at', 'identity_digest_at_approval']) {
      expect(src).toContain(col)
    }
  })

  it('walks app/, components/, lib/ for any un-allowlisted identity-column reference', () => {
    const offenders: { file: string; reason: string }[] = []

    for (const dir of ['app', 'components', 'lib']) {
      for (const file of walk(path.join(ROOT, dir))) {
        const rel = path.relative(ROOT, file)
        if (rel in IDENTITY_NAME_ALLOWLIST) continue

        const raw = readFileSync(file, 'utf8')
        const src = codeOnly(raw)

        // (1) publishing_designee is linguistically unique enough to grep
        // for project-wide with no false-positive risk.
        if (src.includes('publishing_designee')) {
          offenders.push({ file: rel, reason: 'references publishing_designee' })
          continue
        }

        // (2) The other four column names are common English/business
        // words (pro, ipi, administrator, legal_name-ish), so they are
        // only checked WITHIN an actual split_sheet_parties projection —
        // the real security-relevant surface (see
        // splitSheetPartiesProjections' header for why this is scoped
        // rather than a blanket "file contains .select()" scan).
        if (!src.includes('split_sheet_parties')) continue
        const offendingColumn = splitSheetPartiesProjections(src)
          .map(containsIdentityColumn)
          .find(col => col !== null)
        if (offendingColumn) {
          offenders.push({ file: rel, reason: `selects ${offendingColumn} on split_sheet_parties` })
        }
      }
    }

    expect(offenders).toEqual([])
  })
})
