import { readFileSync, readdirSync, statSync } from 'fs'
import path from 'path'
import { STRUCTURALLY_EXCLUDED_CAPABILITY_VALUES } from '@/lib/workspaces/permissions'

// ─── Repository-level negative suite (38-RESEARCH.md Pitfall 2) ──────────
// Deliberately separate from __tests__/migration-186.test.ts because it
// asserts about APPLICATION CODE, not SQL. Migration 186's RLS branch is
// only half of the structural story — this suite proves the workspace
// branch cannot be reached through application code either: no signed-URL
// accessor may import a workspace module, the use-time authority resolver
// cannot itself sign anything, payout/tax data and impersonation primitives
// are unreachable from any workspace surface, `project_members` is never
// written by workspace code, and none of the legacy account fields are
// referenced. Every assertion below reports the offending file path on
// failure so a regression is actionable rather than a bare boolean.

const ROOT = process.cwd()

/** Recursively collect .ts/.tsx source files under a directory, excluding
 * test files, node_modules, and .next build output. Walking the tree (not a
 * hardcoded file list) means a newly added accessor or route is covered
 * automatically. */
function collectSourceFiles(dir: string): string[] {
  const absDir = path.join(ROOT, dir)
  let entries: string[]
  try {
    entries = readdirSync(absDir)
  } catch {
    return []
  }

  const files: string[] = []
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === '.next' || entry.startsWith('.')) continue
    const absPath = path.join(absDir, entry)
    const relPath = path.join(dir, entry)
    const stat = statSync(absPath)
    if (stat.isDirectory()) {
      files.push(...collectSourceFiles(relPath))
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      files.push(relPath)
    }
  }
  return files
}

function readSource(relPath: string): string {
  return readFileSync(path.join(ROOT, relPath), 'utf8')
}

/** Strips block comments (/* ... *\/) and single-line // comments (naive:
 * truncates a line at the first `//` not part of `://`) so a defensive
 * comment describing what a module does NOT do (e.g. "never calls
 * supabase.auth.setSession") cannot trip an executable-code assertion. */
function stripTsComments(source: string): string {
  const noBlockComments = source.replace(/\/\*[\s\S]*?\*\//g, '')
  return noBlockComments
    .split('\n')
    .map((line) => {
      const match = line.match(/(^|[^:])\/\//)
      if (!match || match.index === undefined) return line
      const cutAt = match.index + match[0].length - 2
      return line.slice(0, cutAt)
    })
    .join('\n')
}

const LIB_ALL_FILES = collectSourceFiles('lib')
const APP_API_ALL_FILES = collectSourceFiles('app/api')
const WORKSPACES_LIB_FILES = LIB_ALL_FILES.filter((f) => f.startsWith(`lib${path.sep}workspaces${path.sep}`))
const WORKSPACES_API_FILES = APP_API_ALL_FILES.filter((f) =>
  f.startsWith(`app${path.sep}api${path.sep}workspaces${path.sep}`)
)
const WORKSPACES_ALL_FILES = [...WORKSPACES_LIB_FILES, ...WORKSPACES_API_FILES]

describe('workspace structural exclusions (repository-level, application code)', () => {
  it('sanity: the walk actually discovers workspace source files', () => {
    expect(WORKSPACES_LIB_FILES.length).toBeGreaterThan(5)
    expect(WORKSPACES_API_FILES.length).toBeGreaterThan(3)
  })

  // ══ Clean-master isolation (D-08, D-40, custody D-01/D-09) ══════════════
  describe('clean-master isolation: no signed-URL module imports a workspace module', () => {
    const signedUrlModules = [...LIB_ALL_FILES, ...APP_API_ALL_FILES].filter((f) => {
      const source = readSource(f)
      return /createSignedUrl(s)?\s*\(/.test(source)
    })

    it('discovers at least one signed-URL accessor by walking the tree (the sample is not empty)', () => {
      expect(signedUrlModules.length).toBeGreaterThan(0)
    })

    it.each(signedUrlModules)('%s does not import a workspace module', (file) => {
      const source = readSource(file)
      const offendingImports = [
        '@/lib/workspaces/grant-service',
        '@/lib/workspaces/access',
        '@/lib/workspaces/permissions',
      ].filter((moduleSpecifier) => source.includes(moduleSpecifier))
      expect({ file, offendingImports }).toEqual({ file, offendingImports: [] })
    })
  })

  // ══ The resolver cannot sign ═══════════════════════════════════════════
  describe('the use-time authority resolver imports no storage/signing module', () => {
    it('lib/workspaces/grant-service.ts imports nothing from @/lib/storage, @/lib/catalogue/audio or @/lib/watermark/signed-url', () => {
      const source = readSource('lib/workspaces/grant-service.ts')
      const offendingImports = [
        '@/lib/storage',
        '@/lib/catalogue/audio',
        '@/lib/watermark/signed-url',
      ].filter((moduleSpecifier) => source.includes(moduleSpecifier))
      expect(offendingImports).toEqual([])
    })
  })

  // ══ Payout and tax unreachability (WS-20, D-42) ═════════════════════════
  describe('payout and tax capabilities are unreachable from any workspace surface', () => {
    it('imports the forbidden-name list from permissions.ts rather than restating literals', () => {
      expect(STRUCTURALLY_EXCLUDED_CAPABILITY_VALUES).toEqual(
        expect.arrayContaining(['manage_payouts', 'view_tax_information'])
      )
      expect(STRUCTURALLY_EXCLUDED_CAPABILITY_VALUES.length).toBeGreaterThan(0)
    })

    const filesExcludingPermissionsModule = WORKSPACES_ALL_FILES.filter(
      (f) => f !== 'lib/workspaces/permissions.ts'
    )

    it.each(filesExcludingPermissionsModule)(
      '%s references no structurally excluded capability name in executable source, and no subscriptions/Stripe surface',
      (file) => {
        // Comment-stripped: a defensive JSDoc/comment explaining WHY a name
        // is rejected (e.g. lib/workspaces/grants.ts's isSubsetGrant comment
        // naming `manage_payouts` as an example of a string that always
        // fails closed) is documentation, not a code path that reaches the
        // capability. Only an EXECUTABLE reference is a structural leak.
        const executable = stripTsComments(readSource(file))
        const offendingCapabilities = STRUCTURALLY_EXCLUDED_CAPABILITY_VALUES.filter((name) =>
          executable.includes(name)
        )
        expect({ file, offendingCapabilities }).toEqual({ file, offendingCapabilities: [] })

        const referencesSubscriptions = /\bsubscriptions\b/.test(executable)
        const referencesStripe = /['"]stripe['"]|from ['"]stripe/i.test(executable)
        expect({ file, referencesSubscriptions, referencesStripe }).toEqual({
          file,
          referencesSubscriptions: false,
          referencesStripe: false,
        })
      }
    )
  })

  // ══ No impersonation primitive (D-22) ═══════════════════════════════════
  describe('no impersonation primitive anywhere in workspace code', () => {
    it.each(WORKSPACES_ALL_FILES)('%s calls no impersonation primitive in executable source', (file) => {
      const executable = stripTsComments(readSource(file))
      const offendingCalls = [
        /auth\.admin\b/,
        /\.setSession\s*\(/,
        /\.signInWithPassword\s*\(/,
        /\.signOut\s*\(/,
      ]
        .filter((pattern) => pattern.test(executable))
        .map((pattern) => pattern.source)
      expect({ file, offendingCalls }).toEqual({ file, offendingCalls: [] })
    })
  })

  // ══ project_members semantics untouched (D-52) ══════════════════════════
  describe('no workspace file writes to project_members (reads for display are permitted)', () => {
    it.each(WORKSPACES_ALL_FILES)('%s performs no insert/update/delete against project_members', (file) => {
      const executable = stripTsComments(readSource(file))
      const offendingWrites = [
        /from\(['"]project_members['"]\)[\s\S]{0,80}\.insert\s*\(/,
        /from\(['"]project_members['"]\)[\s\S]{0,80}\.update\s*\(/,
        /from\(['"]project_members['"]\)[\s\S]{0,80}\.delete\s*\(/,
        /from\(['"]project_members['"]\)[\s\S]{0,80}\.upsert\s*\(/,
      ]
        .filter((pattern) => pattern.test(executable))
        .map((pattern) => pattern.source)
      expect({ file, offendingWrites }).toEqual({ file, offendingWrites: [] })
    })

    it('sanity: no workspace file references project_members at all today', () => {
      const referencing = WORKSPACES_ALL_FILES.filter((f) => readSource(f).includes('project_members'))
      expect(referencing).toEqual([])
    })
  })

  // ══ Legacy fields untouched (D-54) ═══════════════════════════════════════
  describe('no workspace file references the legacy account fields', () => {
    it.each(WORKSPACES_ALL_FILES)('%s references none of member_type / industry_roles / capability_grants', (file) => {
      const source = readSource(file)
      const offendingFields = ['member_type', 'industry_roles', 'capability_grants'].filter((name) =>
        source.includes(name)
      )
      expect({ file, offendingFields }).toEqual({ file, offendingFields: [] })
    })
  })
})
