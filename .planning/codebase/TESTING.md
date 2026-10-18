# Testing Patterns

**Analysis Date:** 2026-10-18

## Test Framework

**Runner:**
- Jest 30.5.1 (`devDependencies.jest` in `package.json`)
- TypeScript transform: `ts-jest` ^29.4.11 with preset `ts-jest`
- Config: `jest.config.js` (CommonJS). ESM transform helper: `jest.babel-plugins.js`
- Test environment: `node` (global). No jsdom.

**Assertion library:**
- Jest built-in `expect`. Types from `@types/jest` ^30.

**Key settings in `jest.config.js`:**
- `moduleNameMapper`: `'^@/(.*)$'` maps to `<rootDir>/$1`, matching the `@/` import alias.
- The `ts-jest` transform runs with an inline tsconfig: `target: ES2017`, `module: commonjs`, `strict: true`, `jsx: react-jsx`, and the same `@/*` path mapping. Test files are compiled with strict typing.
- `transformIgnorePatterns` allows a fixed list of ESM-only packages from the `@react-pdf/renderer` dependency tree (`@react-pdf`, `@noble`, `fontkit`, `yoga-layout`, and others). Those files go through `babel-jest` with `next/babel`. Add a package to that list only when a test fails with an "unexpected token: export" error from `node_modules`.
- `jest.babel-plugins.js` rewrites `import.meta.url` for the `yoga-layout` WASM loader. It must stay a file path string, not an inline function, or the babel-jest cache key breaks.
- `testPathIgnorePatterns` and `modulePathIgnorePatterns` exclude `/node_modules/`, `/.next/`, and sibling agent worktrees under `.claude/worktrees/`. Running from inside a worktree still discovers that worktree's own tests.

**Run commands:**
```bash
npm test                                   # Run all tests (runs `jest`)
npm test -- --runInBand                    # Same as CI; single worker
npx jest lib/accounts/account-context.test.ts   # One file
npx jest -t "resolveAccountContext"        # Tests whose name matches
npx jest --listTests                       # Show discovered test files
npx jest --coverage                        # Coverage (works, but not configured or enforced)
npx jest --watch                           # Watch mode (not scripted; available via Jest CLI)
```

**Other checks that cover test files:**
- `npm run typecheck:strict` runs `tsc --noEmit --noUnusedLocals --noUnusedParameters`. `tsconfig.json` includes `**/*.ts` and `**/*.tsx`, so test files must type-check under strict mode with no unused locals. Tests use `as never` for stub arguments to satisfy this.
- `npm run lint` runs ESLint over test files too, with `--max-warnings=0`.

## Test File Organization

**Location: two patterns coexist.**

1. **Colocated** next to the source they test: `lib/accounts/account-context.ts` with `lib/accounts/account-context.test.ts`. 365 tracked test files follow this pattern. Breakdown by top-level directory: `lib/` 236, `app/` 78, `components/` 46, `scripts/` 5.
2. **Central** in `__tests__/` at the repo root: 299 tracked files, for cross-cutting suites. These include API route tests, static-source gate tests, migration tests, and tests that span several `lib/` modules. `__tests__/rename/` holds one repo-wide guard.

Use colocation for unit tests of a single `lib/` module. Use `__tests__/` for route handler tests (`app/api/...`), tests that cover a feature across several modules, and tests that read files from disk.

**Naming:**
- `<subject>.test.ts` or `<subject>.test.tsx`. Kebab-case subject, matching the source filename where possible: `block-enforcement.test.ts`, `dm-send-gate.test.ts`, `artist-error-boundary.test.tsx`.
- Use `.test.`. The `.spec.` suffix is not used.
- No `__mocks__` directories, no snapshot files, and no `toMatchSnapshot` calls exist. Mocks are written inline in each test file.

**Structure:**
```
lib/<domain>/<module>.ts
lib/<domain>/<module>.test.ts        # colocated unit test
__tests__/<feature>.test.ts          # cross-cutting or route test
__tests__/rename/<guard>.test.ts     # repo-wide guard
```

**Fixtures:** Shared test data is placed next to production code as a non-test module:
- `lib/invites/invite-fixtures.ts`
- `lib/vault/coverage-fixtures.ts`
- `scripts/__fixtures__/marketing-sanitizer/*.html` (HTML inputs for the marketing sanitizer checks)

## Test Structure

**Suite organization:** A top-level `describe` names the function or module under test. Nested `describe` blocks group behavior when a file covers several concerns. A file has roughly 1,700 `describe` blocks and about 7,160 `it`/`test` declarations in total.

```typescript
// lib/accounts/account-context.test.ts (abridged)
import { resolveAccountContext } from './account-context'

describe('resolveAccountContext', () => {
  it('treats every profile-owning person as a Member without an artist/industry split', () => {
    expect(
      resolveAccountContext({
        hasMemberProfile: true,
        clientPartnerMembershipCount: 0,
        staffRoles: [],
      })
    ).toEqual({
      classes: ['member'],
      defaultClass: 'member',
      hasMemberWorkspace: true,
      hasClientPartnerWorkspace: false,
      isFununTeamMember: false,
    })
  })
})
```

**Naming inside a suite:** `it` titles are full sentences describing the behavior and, often, the condition: `'coerces an empty/whitespace note to null'`, `'keeps Funūn Team identities isolated even if legacy rows overlap'`. Write the title as the behavior you expect.

**Table-driven tests:** `it.each` is used for repeated rule checks (226 tables in the suite):
```typescript
// __tests__/ai-route-admission.test.ts
it.each(routes)('%s claims durable budget before invoking its model layer', route => { ... })
```

**Setup and teardown:**
- `beforeEach` is used in 181 places, typically to reset mocks.
- `jest.clearAllMocks()`, `jest.resetAllMocks()`, or `jest.restoreAllMocks()` appear in 151 places. Call one of these in `beforeEach` when mocks carry state between tests.
- `afterEach` is rare (12 uses). `jest.useFakeTimers()` appears only 3 times. Prefer real timers and explicit values.

**Header comment:** Many test files open with a comment block that states the scope, what the suite deliberately does not cover, and the plan or requirement it pins. Several files also carry RED/GREEN notes from test-first development (for example, "RED (Task 1): ... Task 3 makes it GREEN"). Remove a RED/GREEN note once the implementation exists, so the comment still describes the current code.

## Mocking

**Framework:** Jest's `jest.mock()` with a factory, and `jest.fn()`. `jest.spyOn` is almost never used (3 occurrences). Mocks are module-level and hoisted by Jest, so write them after the imports and before the code under test runs.

**Supabase mocks (most common):** Modules that create a Supabase client are mocked by factory. Tests then set return values per call with `mockResolvedValue`. Typical factory shape:
```typescript
jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: jest.fn(),
  createApiClient: jest.fn(),
}))
```
`jest.mock('@/lib/supabase/server'` is declared 129 times across the suite. `mockResolvedValue` appears 1,015 times.

**Chainable query builder:** For code that calls `.from().select().eq()...`, tests build a thenable spy so any chain terminates correctly. The pattern is `tableBuilder(rows)` in `__tests__/block-enforcement.test.ts`, and it is reused in 11 files:
```typescript
function tableBuilder(rows: unknown[]) {
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'or', 'order', 'limit', 'in']) {
    builder[m] = jest.fn(() => builder)
  }
  builder.maybeSingle = jest.fn(async () => ({ data: rows[0] ?? null, error: null }))
  builder.then = (resolve: (v: unknown) => void) => resolve({ data: rows, error: null })
  return builder
}
```
Add a method name to the array when the code under test uses a new chain step. Do not extend the helper to return fixed data for unlisted methods.

**Other frequently mocked modules** (count of `jest.mock` declarations across the suite):
- `@/lib/staff/audit` (29): audit logging
- `@/lib/admin/gate` (28): staff gate. Tests either stub `requireStaff` or reproduce `getStaffRole` behavior in the factory.
- `@/lib/security/rate-limit` (20): usually `checkRateLimit: jest.fn(async () => false)` to disable limiting
- `@/lib/email` (18), `@/lib/notifications` (17)
- `@/lib/playbook/rooms` (15), `@/lib/playbook/entries` (10)
- `next/navigation` (8)
- `@sentry/nextjs` (4): stub `captureException` to assert on error reporting

**Mock return values:**
```typescript
const service = { from: jest.fn() }
const result = await mustBlockActionBetween(service as never, 'me', 'me')
expect(result).toBe(false)
expect(service.from).not.toHaveBeenCalled()
```
Assert the absence of a call when the function should short-circuit. This checks that no query runs.

**What to mock:**
- Network-facing SDKs and clients (Supabase, Stripe, Resend, Anthropic, DocuSeal).
- Rate limiting, audit logging, and notification side effects, unless the test is about them.
- The `@/lib/admin/gate` and auth helpers, when the test is about business logic behind them.

**What NOT to mock:**
- Pure functions in `lib/`. Test them directly. Many suites have no mocks at all (for example, `lib/accounts/account-context.test.ts`).
- The function under test. Mock its collaborators only.
- Zod schemas and validators. Exercise them through real inputs.

## Route Handler Tests

**Pattern:** API route handlers are imported directly and called with a standard `Request`. 42 test files import from `@/app/api/...`. Next.js 15 route params are passed as a Promise:
```typescript
import { POST } from '@/app/api/launchpad/[projectId]/campaigns/route'

const res = await POST(
  new Request('http://localhost/api/launchpad/p1/campaigns', {
    method: 'POST',
    body: JSON.stringify({ platforms: ['instagram'] }),
  }),
  { params: Promise.resolve({ projectId: 'p1' }) }
)
expect(res.status).toBe(400)
```
`new Request(` appears 173 times in tests. Assert on `res.status` and the parsed JSON body (`{ error: string }`).

For each route, cover at minimum: no session (401), invalid input (400), a resource not owned by the caller (404), and the success path.

## Static-Source Gate Tests

**Pattern:** 234 test files call `readFileSync` to inspect source or SQL as text and assert on its contents. These tests enforce architectural rules that are hard to test by behavior:

- Paid AI routes must claim budget before calling a model. `__tests__/ai-route-admission.test.ts` reads each route file and asserts that it contains `claimAiUsage(`, `finishAiUsage(`, and `aiProviderSignal()`.
- Migrations must match a fixed harness. `__tests__/beta-security-migration-harness.test.ts` reads `supabase/migrations/*.sql` and checks stripped SQL and hashes.
- Block checks must exist on specific surfaces. `__tests__/block-enforcement.test.ts` reads migration SQL to confirm which database policies enforce `no_block()`.
- A rename must not reappear. `__tests__/rename/no-artist-profiles-refs.test.ts` uses `execFileSync` from `child_process` to scan runtime source for retired identifiers. Its comments state what is excluded (`supabase/` migrations, the test directory itself).

**Constraints:**
- These tests are text-based. Renaming a symbol or reformatting a file can fail them without a behavior change. Update the assertion in the same change.
- Read paths with `path.join(process.cwd(), ...)`. Tests run from the repo root.
- Some tests depend on `.planning/`. `__tests__/beta-security-migration-harness.test.ts` reads `.planning/quick/260912-beta-security-migration-harness`, and the same path is read by `scripts/verify-beta-security-migrations.mjs` in CI. Do not move or delete that directory without updating both.

## Component Tests

**Environment:** No `@testing-library/react`, no `jsdom`. `testEnvironment` is `node`.

**Pattern:** Components are rendered to static markup with `renderToStaticMarkup` from `react-dom/server`, and the test asserts on the HTML string. About 47 test files do this. Shape, based on `__tests__/artist-error-boundary.test.tsx` (the assertion text is illustrative):
```typescript
import { renderToStaticMarkup } from 'react-dom/server'
import ArtistError from '@/app/(artist)/error'

const html = renderToStaticMarkup(<ArtistError error={new Error('x')} reset={() => {}} />)
expect(html).toContain('<expected text>')
```

**Consequence:** `useEffect` does not run under static render. Behavior that happens in effects (for example, the `Sentry.captureException` call in `__tests__/artist-error-boundary.test.tsx`) is not exercised by these tests. Move effect logic into an exported pure function and test that function directly.

## Fixtures and Test Data

- Build inputs inline in each test. Most files construct the input object in the test body.
- Shared builders that exist are in the fixture modules listed above. Import them rather than copying their shape.
- Factory-style helpers live inside the test file, not in a shared directory.

**Test data for the database:** Migrations are tested as SQL text, not run against a database. `jest.config.js` has no `setupFiles` or `globalSetup`, so no test harness starts a local Supabase stack. `supabase gen types` (the `db:types` script) and `supabase db push` are manual workflows.

## Coverage

**Requirements:** None enforced. `jest.config.js` has no `collectCoverage`, no `coverageThreshold`, and no `collectCoverageFrom`. CI does not run coverage.

**View coverage locally:**
```bash
npx jest --coverage
```
Output goes to `coverage/` (ignored by ESLint via `.eslintignore`). Coverage is not measured across `app/` or `components/` by default; Jest collects it only from files that tests import.

## Test Types

**Unit tests:**
- The majority of the suite. Pure `lib/` functions tested directly. Examples: `lib/accounts/account-context.test.ts`, `lib/admin/gate.test.ts`, `lib/contracts/verify.test.ts`.

**Route and integration-style tests:**
- Route handlers called with `new Request(...)` and mocked Supabase clients. Examples: `__tests__/auth-health-route.test.ts`, `__tests__/buyer-brief-auth.test.ts`, `__tests__/staff-buyer-orgs-api.test.ts`.
- Each test mocks the database boundary. No test talks to a live Supabase project.

**Static and structural tests:**
- 234 files read source or SQL. See "Static-Source Gate Tests" above.

**Component tests:**
- Static markup only. See "Component Tests" above.

**Browser or end-to-end tests:**
- No Playwright, Cypress, or Vitest configuration is tracked. No `playwright.config.*` exists in the tracked tree.
- Untracked leftover directories at the repo root (`tests/`, `playwright-report/`, `test-results/`) are from an earlier local checkout. They are not part of the tracked test setup and are not run by `npm test`. Do not rely on them, and do not add them to CI without deciding the tooling first.

## Common Patterns

**Async tests:**
```typescript
it('returns false for the same id without querying', async () => {
  const service = { from: jest.fn() }
  const result = await mustBlockActionBetween(service as never, 'me', 'me')
  expect(result).toBe(false)
})
```
Use `async` and `await` directly. Do not use `done` callbacks.

**Error testing:**
- Assert on the thrown message or the failure result shape. Library functions that return `{ ok: false, error, status }` are checked with `toMatchObject`:
```typescript
expect(result).toMatchObject({ ok: false, status: 404 })
```
- Assert the exact status code on routes: `expect(res.status).toBe(401)`.
- Check that no side effect happened on failure: `expect(createNotification).not.toHaveBeenCalled()`.

**Partial matching:** `toMatchObject` for shape checks on objects that carry extra fields. `toEqual` when every field matters, as in the `buildConnectRequest` payload checks.

**Mock reset between tests:** When a file mocks modules whose functions have `mockResolvedValue` set in several tests, call `jest.clearAllMocks()` or `jest.resetAllMocks()` in `beforeEach`. Without it, a value set in one test leaks into the next.

## Continuous Integration

**Workflow:** `.github/workflows/quality.yml`, named "Quality and security". Runs on pull requests and on pushes to `main`. Concurrency cancels in-progress runs for the same ref.

**Single job `validate` (ubuntu-latest, 20-minute timeout, Node 20, `npm ci`):**
1. `npm run security:migrations:verify` (`scripts/verify-beta-security-migrations.mjs`)
2. `npm run typecheck:strict`
3. `npm run lint` (`--max-warnings=0`)
4. `npm test -- --runInBand`
5. `npm audit --omit=dev --audit-level=moderate`
6. `npm run audit:gate` (`scripts/audit-gate.ts`)

**Audit gate:** `scripts/audit-gate.ts` holds dated deferrals for known advisories. Each deferral has `approvedBy`, `approvedOn`, and `expires` (`YYYY-MM-DD`). Past its `expires` date a deferral stops suppressing the advisory, so the build fails again (see the comment on `AuditDeferral` in `scripts/audit-gate.ts`). At the time of this analysis, one deferral expires on 2026-11-02. Extend it only with a new approval entry, not by editing the date silently.

**Other workflows:** `.github/workflows/close-completed-prs.yml` is not a test workflow. No separate coverage, E2E, or deployment-test workflow exists.

**Local equivalent of CI:**
```bash
npm run security:migrations:verify && npm run typecheck:strict && npm run lint && npm test -- --runInBand
```

## Adding a Test

1. Put a unit test beside its source as `<name>.test.ts`. Put route, cross-module, or file-reading tests in `__tests__/`.
2. Import from the `@/` alias, not a relative path that climbs out of the directory.
3. Stub only the collaborators that touch the network, the database, or side effects. Test pure logic directly.
4. Name `it` blocks as the behavior they assert.
5. For routes, cover 401, 400, 404, and the success path.
6. Run `npx jest <file>` and then `npm run typecheck:strict`. Strict typing applies to tests.

---

*Testing analysis: 2026-10-18*
