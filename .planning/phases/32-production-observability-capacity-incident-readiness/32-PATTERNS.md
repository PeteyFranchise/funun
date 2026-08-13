# Phase 32: Production Observability, Capacity & Incident Readiness - Pattern Map

**Mapped:** 2026-08-13
**Files analyzed:** 8 code deliverables (vendor-dashboard config and pure-documentation deliverables excluded per RESEARCH's Work Split table)
**Analogs found:** 8 / 8

## Scope note

Per RESEARCH.md's "Work Split by Requirement" table, R1/R2/R3 are vendor-dashboard-only (Vercel, Supabase Advisor, Better Stack — no Funūn code) and R9/R10's runbook/checklists are pure documentation. This map covers only the code-writing surface: `/api/health` (R4), Sentry wiring (R5), the correlation/logging module (R6), the D-10 config layer (R1/R8/R10 cross-cutting), the alert fan-out helper, k6 scripts (R7, dev-only), and their tests.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `app/api/health/route.ts` | route/controller | request-response (read-only, single cheap read) | `app/api/waitlist/route.ts` (public, unauthenticated, self-guarded) + `app/api/cron/curator-reach/route.ts` (single cheap Supabase read/write shape) | role-match (hybrid of two analogs) |
| `app/api/health/route.test.ts` | test | request-response | `app/api/waitlist/route.test.ts` | exact |
| `instrumentation.ts` / `instrumentation-client.ts` / `sentry.server.config.ts` / `sentry.edge.config.ts` | config/provider | event-driven (SDK init, error capture) | No direct in-repo analog (first monitoring SDK) — closest structural analog is `next.config.mjs`'s env-gated, comment-documented top-level config shape | no analog (see below) |
| `next.config.mjs` (modified — `withSentryConfig` wrap) | config | transform | `next.config.mjs` itself (current file, extend in place) | exact (self) |
| `app/api/cron/daily-observability-check/route.ts` | route/controller | event-driven (cron-triggered, R10 daily digest) | `app/api/cron/curator-reach/route.ts` | exact |
| `lib/observability/config.ts` | service/config module | CRUD (thresholds/recipients/owners, typed + optionally table-backed) | `lib/metadata/schema.ts` (typed unions + `_LABELS`/`_VALUES` export convention) for the typed-threshold half; `lib/admin/staff-role.ts` (role/permission union pattern) for the owners/recipients half | role-match |
| `lib/observability/config.test.ts` | test | CRUD | `lib/email/index.test.ts` or `lib/email/esc.test.ts` (lib-module unit test style) | role-match |
| `lib/observability/scrub.ts` | utility | transform | `lib/metadata/identifiers.ts` (30-80 line pure validators/formatters) | role-match |
| `lib/observability/scrub.test.ts` | test | transform | `lib/email/esc.test.ts` | role-match |
| `lib/logging/correlation.ts` | utility | transform / request-response | ad-hoc `requestId` usages in `lib/esign/webhook.ts` (`extractRequestId` + typed event shape) and `lib/split-sheets/distribution.ts` — standardize the convention these establish | role-match |
| `lib/logging/correlation.test.ts` | test | transform | `lib/email/esc.test.ts` | role-match |
| `lib/observability/alerts.ts` (fan-out helper) | service | pub-sub (fan-out to recipient list) | `lib/email/index.ts` (`sendEmail`, Resend wrapper, no-op-safe-when-unconfigured) as the send primitive; call-site pattern from `app/api/cron/curator-reach/route.ts`'s per-row loop | role-match |
| `lib/observability/alerts.test.ts` | test | pub-sub | `lib/email/index.test.ts` | role-match |
| `supabase/migrations/11X_observability_config.sql` (if table-backed per RESEARCH's hybrid recommendation) | migration | CRUD | `supabase/migrations/108_anr_staff_role.sql` (most recent; DROP/ADD CONSTRAINT convention, COMMENT ON, `NOTIFY pgrst, 'reload schema'`) | exact |
| `scripts/load/*.js` (k6 scenarios) | utility/tooling | batch (dev-only load harness) | No existing k6/load-test script in repo; closest structural analog for **script conventions** (top-of-file comment header, standalone invocation, not imported by app code) is `scripts/break-glass.ts` | role-match (conventions only, no data-flow analog) |

## Pattern Assignments

### `app/api/health/route.ts` (route, request-response)

**Analogs:** `app/api/waitlist/route.ts` (unauthenticated public route self-guard pattern) + `app/api/cron/curator-reach/route.ts` (single cheap read shape) + RESEARCH.md's own "Code Examples" design contract (already synthesized against these two, cite directly).

**Imports pattern** (from `app/api/waitlist/route.ts` lines 1-5):
```typescript
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { createRateLimiter, getClientIp } from '@/lib/security/rate-limit'
```
For `/api/health`, only `NextResponse` + `createServiceClient` are needed (rate-limit is optional per SPEC — "only where justified"; polling volume at 1-2 min is low, so omit unless the planner decides otherwise).

**Self-guard / no-middleware-protection pattern** (documented in RESEARCH Common Pitfall #3, VERIFIED against `middleware.ts`):
```typescript
// middleware.ts config.matcher excludes /api entirely — this route is the
// ENTIRE security boundary for itself. No auth.getUser() call, ever.
```

**Core pattern — single cheap bounded read, never throw, never write** (RESEARCH Code Examples, synthesized from `app/api/waitlist`'s error-handling discipline):
```typescript
export async function GET() {
  const startedAt = Date.now()
  let supabaseOk = false
  try {
    const service = createServiceClient()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), SUPABASE_CHECK_TIMEOUT_MS)
    const { error } = await service.from('artist_invites').select('id').limit(1)
    clearTimeout(timeout)
    supabaseOk = !error
  } catch {
    supabaseOk = false // never throw — degraded, not a crash
  }
  const status = supabaseOk ? 'healthy' : 'degraded'
  return NextResponse.json(
    { status, checkedAt: new Date().toISOString(), durationMs: Date.now() - startedAt },
    { status: 200 } // OR 503 for degraded — planner must decide per RESEARCH Open Question #1
  )
}
```

**Error handling idiom to copy** (from `app/api/waitlist/route.ts` lines 32-42): destructure `{ data, error }`, check error before use, return a neutral typed JSON body — never leak `error.message`/stack text into the response (`/api/health`'s stricter constraint: don't even echo the Supabase error string, per SPEC Prohibition against exposing exception text).

---

### `app/api/health/route.test.ts` (test)

**Analog:** `app/api/waitlist/route.test.ts`

**Mocking pattern** (lines 1-20):
```typescript
jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: jest.fn(),
}))
```
Build a `mockService({ selectResult })` helper mirroring `mockService({ rpcResult })` in the waitlist test, and a `jsonRequest`-style helper if needed (health is a `GET` with no body, so likely just `new Request('http://t.local/api/health')`).

**Test cases to mirror the analog's `describe` block structure:** healthy (select succeeds), degraded (select errors), timeout (mock a hang past `SUPABASE_CHECK_TIMEOUT_MS` — use `jest.useFakeTimers()` or a rejected/never-resolving promise raced against the abort), secret-redaction (assert `JSON.stringify(body)` contains no `SUPABASE`, `service_role`, stack-trace substrings).

---

### Sentry wiring — `instrumentation.ts`, `instrumentation-client.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, `next.config.mjs`

**No in-repo analog** — this is the first error-monitoring SDK in the codebase (VERIFIED in SPEC Background: "no `@sentry/*`... in `package.json`"). Use RESEARCH.md's Architecture Patterns 1-4 directly (already CITED against `docs.sentry.io`); do not invent a different structure.

**`next.config.mjs` current shape to extend** (full file, 17 lines):
```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingIncludes: {
    'app/api/**/*': ['./assets/fonts/**'],
  },
}

export default nextConfig
```
Note: this repo uses `.mjs` (ESM), not `.ts` — RESEARCH's `next.config.ts` examples must be adapted to `.mjs` import/export syntax (`import { withSentryConfig } from '@sentry/nextjs'` / `export default withSentryConfig(nextConfig, {...})` — both are valid ESM, just keep the `.mjs` extension and drop TS type annotations, using the existing `/** @type {...} */` JSDoc convention instead).

**Env-gated no-op pattern** (server-only secret, no `NEXT_PUBLIC_` prefix — mirrors this repo's existing convention e.g. `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `RESEND_API_KEY` all being un-prefixed in `lib/supabase/server.ts` / `app/api/cron/curator-reach/route.ts` / `lib/email/index.ts`):
```typescript
const dsn = process.env.SENTRY_DSN
if (dsn) {
  Sentry.init({ dsn, tracesSampleRate: ..., beforeSend: scrubSensitiveEvent })
}
```
This "unset env var ⇒ no-op, never throw" idiom is the exact same shape as `lib/email/index.ts`'s `if (!apiKey || !configured || !from) return { ok: false, ... }` no-op gate — copy that no-op philosophy, not just the Sentry docs' literal example.

---

### `app/api/cron/daily-observability-check/route.ts` (route, event-driven)

**Analog:** `app/api/cron/curator-reach/route.ts` (exact — same trigger mechanism, same repo)

**Full auth pattern to copy verbatim** (lines 1-19):
```typescript
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }
  // ... digest logic (read Sentry/Vercel/Better Stack status if reachable via
  // API, or simply re-check /api/health + summarize + email via
  // lib/observability/alerts.ts) ...
  return NextResponse.json({ ok: true })
}
```
**Fail-closed CRON_SECRET check is load-bearing** — copy exactly, including the comment about `Bearer undefined` (WR-05 in the analog). Add the new cron entry to `vercel.json`:
```json
{ "path": "/api/cron/daily-observability-check", "schedule": "0 6 * * *" }
```
(daily, matching Hobby-tier's once-per-day ceiling per RESEARCH Common Pitfall #6 — keep alongside the existing weekly `curator-reach` entry, do not replace it).

**Per-row loop / never-throw pattern** (lines 29-43 of the analog): iterate a list (e.g. recipients or check results), never let one failure abort the batch — mirrors the fan-out helper's required resilience.

---

### `lib/observability/config.ts` (D-10 central config layer)

**Analogs:** `lib/metadata/schema.ts` (typed union + `_LABELS`/`_VALUES` export convention) for static thresholds; `lib/admin/staff-role.ts` (not read this session but referenced in migration 108's comments as the authoritative role union) for the growable owners/recipients shape.

**Typed export pattern to copy** (`lib/metadata/schema.ts` lines 1-34):
```typescript
// ─── Section header comment ─────────────────────────────────────────
export type SeverityLevel = 'SEV-1' | 'SEV-2' | 'SEV-3' | 'SEV-4'

export const SEVERITY_LABELS: Record<SeverityLevel, string> = {
  'SEV-1': 'Critical — production down or data at risk',
  'SEV-2': 'Major — significant degradation',
  'SEV-3': 'Minor — limited impact',
  'SEV-4': 'Cosmetic — no user impact',
}

export const SEVERITY_VALUES = Object.keys(SEVERITY_LABELS) as SeverityLevel[]
```
Apply the same `Type` + `_LABELS: Record<Type,string>` + `_VALUES = Object.keys(...)` triad for thresholds (CPU/latency/5xx/connections/disk bands) and for owner roles.

**Hybrid shape per RESEARCH's Standard Stack "Alternatives Considered":** thresholds stay a typed module (static, benefits from type-checking, no redeploy-avoidance need); recipients/owners are table-backed (`observability_recipients` or similar) so they're addable without a redeploy — mirrors this codebase's existing split between compile-time enums (`lib/metadata/schema.ts`) and runtime-editable tables (`funun_staff`, migration 089/108). A reader function in `config.ts` fetches the table via `createServiceClient()` (same client factory as every other server-side read in this repo) and falls back to a hardcoded default array (e.g. `[{ email: 'pete@funun.studio', role: 'primary' }]`) if the table is empty/unreachable — never throw, matching `lib/email/index.ts`'s no-op philosophy.

**Error handling idiom** (destructure-check-return, from `lib/supabase/server.ts` callers' universal convention): `const { data, error } = await service.from('observability_recipients').select('*'); if (error) return DEFAULT_RECIPIENTS`.

---

### `lib/observability/scrub.ts` (PII-scrubbing utility)

**Analog:** `lib/metadata/identifiers.ts` (short, pure, ~30-80 line validators — same shape as a key-based scrub predicate; not read this pass but consistent with CLAUDE.md's stated convention "Single-purpose utility functions kept short and pure").

**Pattern:** pure function, no side effects, explicit return type:
```typescript
export function scrubKnownSensitiveKeys(event: Record<string, unknown>): Record<string, unknown> {
  // Unicode-safe key/value matching (SPEC edge coverage: "Funūn" must scrub
  // regardless of encoding/normalization) — do not assume ASCII-only keys.
  ...
}
```
Shared by both Sentry's `beforeSend` (R5) and `lib/logging/correlation.ts`'s `logWithCorrelation` (R6) per RESEARCH's Recommended Project Structure — a single scrub module, two call sites.

---

### `lib/logging/correlation.ts` (correlation-ID convention)

**Analog:** the ad-hoc `requestId` pattern already established in `lib/esign/webhook.ts` — extract and standardize rather than invent from scratch.

**Existing convention to generalize** (`lib/esign/webhook.ts` lines 89-101):
```typescript
const requestId = extractRequestId(data)
if (...) {
  return { type: 'all_signed', requestId }
}
...
return { type: 'other', requestId }
```
This shows the repo's existing idiom: extract an ID once, thread it through a typed discriminated-union result. `lib/logging/correlation.ts` generalizes this into a request-scoped (not esign-scoped) helper:
```typescript
import { randomUUID } from 'crypto'

export function getOrCreateCorrelationId(headers: Headers): string {
  return headers.get('x-correlation-id') ?? randomUUID()
}

export function logWithCorrelation(
  correlationId: string,
  fields: { route: string; status: number; durationMs: number; kind: 'user_error' | 'operational_failure' }
) {
  console.log(JSON.stringify({ correlationId, ts: new Date().toISOString(), ...fields }))
}
```
(RESEARCH Pattern 6, CITED partial — this is the canonical shape; no stronger in-repo analog exists since no shared correlation module currently exists, only scattered `requestId` fields on esign types.)

---

### `lib/observability/alerts.ts` (alert fan-out helper)

**Analog:** `lib/email/index.ts`'s `sendEmail` as the underlying send primitive; `app/api/cron/curator-reach/route.ts`'s per-row loop as the fan-out iteration pattern.

**Send primitive to call, not reimplement** (`lib/email/index.ts` signature):
```typescript
export async function sendEmail(args: {
  to: string
  subject: string
  html: string
  text?: string
  replyTo?: string
  from?: string
  idempotencyKey?: string
}): Promise<{ ok: boolean; error?: string }>
```
`lib/observability/alerts.ts` reads the growable recipient list from `lib/observability/config.ts`, then loops and calls `sendEmail` once per recipient — mirroring the curator-reach cron's "iterate, never let one failure abort the batch" resilience:
```typescript
export async function fanOutAlert(subject: string, html: string): Promise<{ sent: number; failed: number }> {
  const recipients = await getAlertRecipients() // from lib/observability/config.ts
  let sent = 0, failed = 0
  for (const r of recipients) {
    const result = await sendEmail({ to: r.email, subject, html })
    result.ok ? sent++ : failed++
  }
  return { sent, failed }
}
```
Note per CONTEXT.md D-08: "never a hardcoded single sink" — this is exactly why the recipient list is read from the config layer rather than a literal `pete@funun.studio` string in this file.

---

### `supabase/migrations/11X_observability_config.sql` (if table-backed)

**Analog:** `supabase/migrations/108_anr_staff_role.sql` (most recent migration; exact conventions to copy)

**Structural conventions to copy verbatim:**
- Header comment block: `-- ===...===`, `-- Funūn — Phase N (...): <one-line summary>`, `-- Migration NNN`, then `-- WHY:`, `-- WHAT:` prose sections explaining rationale and citing the CONTEXT.md decision ID (here: D-10).
- `HUMAN-GATED` footer comment: *"this project never runs `supabase db push` from an agent... Draft + text-tested only; the owner reviews and pushes via their normal Codex `supabase db push` flow."* — this applies verbatim to Phase 32's migration too.
- End every migration with `NOTIFY pgrst, 'reload schema';`.
- Use `COMMENT ON TABLE`/`COMMENT ON COLUMN` to document the authoritative-vs-display-copy relationship if any field mirrors app_metadata or another table (not applicable here unless recipients tie to `funun_staff`).
- RLS style: this repo's tables gate via `funun_staff`/`app_metadata` role checks (migration 089 pattern, referenced but not directly read this session) — a new `observability_recipients`/`observability_config` table should follow the same founder-only-write, no-public-read RLS shape (D-04: "Monitoring-data access = founder-only for now").

---

### `scripts/load/*.js` (k6 harness, dev-only)

**No true analog** — first load-test harness in the repo. Closest structural convention is `scripts/break-glass.ts`'s standalone-invocation, not-imported-by-app-code shape (confirms this repo already has a precedent for `scripts/` containing operator tooling outside the Next.js bundle, which is exactly what R7 needs). Use RESEARCH Pattern 5 (`ramping-vus` executor + `abortOnFail` thresholds) directly — it is already CITED against official k6 docs and is the correct, non-invented shape.

**Critical non-negotiable from RESEARCH Common Pitfall #4:** do NOT add `k6` to `package.json`. Scripts are invoked via `k6 run scripts/load/run-ramp.js`, never `require()`d/`import`ed by `app/` or `lib/`.

---

## Shared Patterns

### Server-only secrets, never `NEXT_PUBLIC_`
**Source:** `lib/supabase/server.ts` (`SUPABASE_SERVICE_ROLE_KEY`), `app/api/cron/curator-reach/route.ts` (`CRON_SECRET`), `lib/email/index.ts` (`RESEND_API_KEY`)
**Apply to:** `SENTRY_DSN` (via `next.config.mjs`'s `env` key, NOT the `NEXT_PUBLIC_SENTRY_DSN` the Vercel Marketplace integration would auto-inject — RESEARCH Pitfall 1), `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, Better Stack API key if used server-side.
```typescript
// Pattern: read process.env.X directly, no NEXT_PUBLIC_ prefix, gate with
// a truthiness check that no-ops rather than throws when unset.
const apiKey = process.env.RESEND_API_KEY
if (!apiKey || ...) return { ok: false, error: 'Email not configured' }
```

### No-op-when-unconfigured (never throw on missing integration)
**Source:** `lib/email/index.ts` lines 40-47
**Apply to:** Sentry init (env-gated), `lib/observability/alerts.ts` (no-op-safe if `sendEmail` fails), `/api/health` (Supabase check failure → `degraded`, never throw/500).

### Service-role Supabase client for server-side reads with no user session
**Source:** `lib/supabase/server.ts`'s `createServiceClient()`, used by `app/api/waitlist/route.ts`, `app/api/cron/curator-reach/route.ts`
**Apply to:** `/api/health`'s single read, `lib/observability/config.ts`'s recipient/owner table reads, the daily cron's status checks.
```typescript
export const createServiceClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
```

### Fail-closed Bearer-token check for cron routes
**Source:** `app/api/cron/curator-reach/route.ts` lines 8-14
**Apply to:** `app/api/cron/daily-observability-check/route.ts` — copy verbatim, including the `!process.env.CRON_SECRET ||` guard that prevents an unset-secret bypass (WR-05 in the analog's own comment).

### `{ data, error }` destructure-and-check
**Source:** universal in this repo (`app/api/waitlist/route.ts`, `app/api/cron/curator-reach/route.ts`)
**Apply to:** every Supabase call in `/api/health`, `lib/observability/config.ts`, the daily cron.

### Jest mock-the-client-factory test style
**Source:** `app/api/waitlist/route.test.ts` lines 1-20, 34-50
**Apply to:** `app/api/health/route.test.ts`, `lib/observability/config.test.ts`, `lib/observability/alerts.test.ts` — `jest.mock('@/lib/supabase/server', () => ({ createServiceClient: jest.fn() }))`, a `mockService(options)` builder returning stubbed `{ from, rpc }`, `beforeEach(() => jest.clearAllMocks())`.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `instrumentation.ts`, `instrumentation-client.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts` | provider/config | event-driven | First error-monitoring SDK in the repo (VERIFIED — no `@sentry/*` in `package.json`); use RESEARCH.md's CITED official-docs patterns directly, not a repo analog |
| `scripts/load/*.js` (k6 scenarios) | tooling | batch | First load-test harness; no `k6`/`artillery`/`autocannon` script exists in `scripts/`; use RESEARCH Pattern 5 (CITED against k6.io docs) |
| `docs/RUNBOOK.md`, `docs/OBSERVABILITY-OPERATING-RHYTHM.md`, `docs/THRESHOLDS-AND-SEVERITY.md` | documentation | n/a | Out of pattern-mapping scope per this phase's instructions (pure documentation, not code) — `docs/BREAK-GLASS.md` is the reconciliation reference the runbook must cite, not duplicate |

## Metadata

**Analog search scope:** `app/api/waitlist/`, `app/api/cron/curator-reach/`, `lib/supabase/`, `lib/security/rate-limit.ts`, `lib/email/`, `lib/metadata/schema.ts`, `lib/esign/webhook.ts`, `middleware.ts`, `next.config.mjs`, `vercel.json`, `supabase/migrations/108_anr_staff_role.sql`, `scripts/`
**Files scanned:** ~20
**Pattern extraction date:** 2026-08-13
