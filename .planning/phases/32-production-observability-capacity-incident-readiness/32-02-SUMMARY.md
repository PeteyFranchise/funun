---
phase: 32-production-observability-capacity-incident-readiness
plan: 02
subsystem: infra
tags: [observability, logging, sentry, pii-scrubbing, correlation-id, jest]

# Dependency graph
requires: []
provides:
  - "lib/observability/scrub.ts exporting scrubKnownSensitiveKeys() and SENSITIVE_KEY_PATTERNS"
  - "lib/logging/correlation.ts exporting getOrCreateCorrelationId() and CORRELATION_HEADER"
  - "lib/logging/logger.ts exporting logWithCorrelation() and the LogKind union"
affects: [32-05-daily-observability-cron, 32-06-sentry-wiring]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure key-based redaction: fields are scrubbed by matching their KEY against a regex list, never by inspecting the value — makes redaction encoding-agnostic by construction"
    - "Structural safety over runtime validation: logWithCorrelation's typed safe-field-only signature makes leaking a raw record a compile-time impossibility, not a runtime check"

key-files:
  created:
    - lib/observability/scrub.ts
    - lib/observability/scrub.test.ts
    - lib/logging/correlation.ts
    - lib/logging/correlation.test.ts
    - lib/logging/logger.ts
  modified: []

key-decisions:
  - "Key comparison normalizes to NFKC before regex testing so alternate Unicode key spellings aren't missed by an unanchored substring match"
  - "logWithCorrelation and correlation-ID tests live in one file (lib/logging/correlation.test.ts), matching the plan's files_modified list — no separate logger.test.ts"
  - "request.cookies/headers/query_string are deleted outright (not redacted-in-place) since they're often raw strings/blobs, not key/value maps that a generic key-match scrub could reach"

patterns-established:
  - "Pattern: shared scrub module (lib/observability/scrub.ts) reused by every future monitoring egress point — Sentry's beforeSend (Plan 06) imports it directly rather than reimplementing redaction"
  - "Pattern: safe-field allowlist logging (lib/logging/logger.ts) — any future log call site imports LogFields' shape, never passes an ad-hoc object"

requirements-completed: [R5, R6]

coverage:
  - id: D1
    description: "scrubKnownSensitiveKeys strips request.cookies/headers/query_string and redacts nested keys matching known-sensitive patterns (passwords, JWTs, cookies, authorization, API keys, Supabase tokens, legal names, contracts, signatures, royalties), including non-ASCII values, without throwing on null/undefined/empty input"
    requirement: R5
    verification:
      - kind: unit
        ref: "lib/observability/scrub.test.ts#scrubKnownSensitiveKeys (8 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "getOrCreateCorrelationId propagates x-correlation-id when present, mints a fresh per-call UUID otherwise, and never shares an ID across concurrent no-header calls"
    requirement: R6
    verification:
      - kind: unit
        ref: "lib/logging/correlation.test.ts#getOrCreateCorrelationId (4 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "logWithCorrelation emits exactly one JSON line containing only the correlationId + allowlisted fields (route, status, durationMs, kind) + ts — its signature has no raw-record parameter"
    requirement: R6
    verification:
      - kind: unit
        ref: "lib/logging/correlation.test.ts#logWithCorrelation (2 tests)"
        status: pass
    human_judgment: false

duration: ~5min
completed: 2026-08-13
status: complete
---

# Phase 32 Plan 02: Scrub + Correlation/Logging Primitives Summary

**Unicode-safe key-based PII/secret scrubber (`scrub.ts`) plus a per-request correlation-ID helper (`correlation.ts`) and a structurally safe-field-only structured logger (`logger.ts`), all leaf modules with zero dependencies on other Phase-32 plans.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-08-13T16:58:06Z
- **Completed:** 2026-08-13T17:00:40Z
- **Tasks:** 2
- **Files modified:** 5 (all new)

## Accomplishments
- `lib/observability/scrub.ts`: pure `scrubKnownSensitiveKeys(event)` that deletes `request.cookies`/`request.headers`/`request.query_string` and redacts any nested key matching `SENSITIVE_KEY_PATTERNS` (auth secrets + rights-sensitive business fields) with a fixed `[redacted]` placeholder — key match is NFKC-normalized and value-encoding-agnostic, verified against a `"Funūn Holdings Ltd."` legal-name fixture.
- `lib/logging/correlation.ts`: `getOrCreateCorrelationId(headers)` returns a propagated `x-correlation-id` or mints a fresh `randomUUID()` per call — verified that 50 concurrent no-header calls produce 50 distinct IDs (Set size === N).
- `lib/logging/logger.ts`: `logWithCorrelation(correlationId, fields)` emits exactly one JSON line built from a typed `LogFields` allowlist (`route`, `status`, `durationMs`, `kind`) plus `correlationId`/`ts` — the function signature has no arbitrary-record parameter, so it structurally cannot log a raw sensitive payload.
- 14 Jest tests across both suites, all passing; repo-wide `tsc --noEmit` and `npm run lint` both clean.

## Task Commits

Each task followed RED → GREEN TDD:

1. **Task 1: Unicode-safe PII/secret scrubber**
   - `a09b9b0` test(32-02): add failing test for scrubKnownSensitiveKeys (RED)
   - `f2e5195` feat(32-02): implement Unicode-safe PII/secret scrubber (GREEN)
2. **Task 2: Correlation-ID + structured-logging convention**
   - `bfb794a` test(32-02): add failing test for correlation-ID + structured logger (RED)
   - `5ae1e5f` feat(32-02): implement correlation-ID + structured-logging convention (GREEN)

**Plan metadata:** committed alongside this SUMMARY (see below).

## Files Created/Modified
- `lib/observability/scrub.ts` - Pure key-based redaction scrubber; exports `scrubKnownSensitiveKeys`, `SENSITIVE_KEY_PATTERNS`, `REDACTION_PLACEHOLDER`
- `lib/observability/scrub.test.ts` - 8 tests covering request-field deletion, nested-key redaction, non-ASCII values, empty-input safety, non-sensitive-key preservation
- `lib/logging/correlation.ts` - `getOrCreateCorrelationId`, `CORRELATION_HEADER`
- `lib/logging/correlation.test.ts` - 6 tests covering header propagation, fresh-UUID minting, N-distinct concurrency, and (co-located per plan) `logWithCorrelation`'s allowlist-only emission
- `lib/logging/logger.ts` - `logWithCorrelation`, `LogKind`, `LogFields`

## Decisions Made
- Key-match normalization: keys are `.normalize('NFKC')`'d before testing against `SENSITIVE_KEY_PATTERNS`, so an unanchored substring match isn't defeated by an alternate Unicode key spelling (SPEC's "encoding-agnostic key match" requirement).
- `request.cookies`/`headers`/`query_string` are deleted wholesale rather than run through the generic key-based redaction pass, because their values are often raw strings/blobs (a cookie header string, a query-string blob) rather than key/value maps a generic scrub could reach field-by-field.
- Per the plan's file list, `logWithCorrelation`'s tests live inside `lib/logging/correlation.test.ts` rather than a separate `logger.test.ts` — matches `files_modified` in the plan frontmatter exactly.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. These are pure, dependency-light modules (Node built-in `crypto` only, no pino/winston, no new npm packages).

## Next Phase Readiness

- `lib/observability/scrub.ts` is ready for Plan 06's Sentry `beforeSend` wiring — single import, single call site, as specified in this plan's `key_links`.
- `lib/logging/correlation.ts` + `lib/logging/logger.ts` are ready for any route/cron that wants a per-request correlation ID and a safe structured log line (e.g. Plan 05's daily observability cron, Plan 04's `/api/health`).
- No blockers for downstream plans in this phase's wave sequence.

---
*Phase: 32-production-observability-capacity-incident-readiness*
*Completed: 2026-08-13*
