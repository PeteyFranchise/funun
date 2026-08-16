---
phase: 31-ae-client-workspace-selects-my-client-partners-client-partne
plan: 02
subsystem: selects
tags: [supabase, migration, rls, sql, jest, crm]

# Dependency graph
requires: []
provides:
  - "supabase/migrations/111_selects.sql — Selects domain: selects, selects_tracks (FK tracks.id), selects_reactions, selects_saved_searches; unguessable share_token; D-02 download-gate columns; fail-closed staff-only REVOKE posture + one buyer-readable arm via is_buyer_org_member"
  - "supabase/migrations/112_client_partners_crm.sql — CRM-lite: buyer_org_contacts (multi-contact, one-primary partial unique index), client_relationship_log, buyer_orgs.website; non-destructive legacy contact_* backfill"
  - "Live schema (LOCAL=REMOTE through 112) that every Slice-1 API/UI/player plan reads and writes"
affects: [31-04, 31-05, 31-06, 31-07, 31-12, 31-13]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Staff-only table posture: RLS enabled + ZERO policies + full REVOKE from authenticated/anon (mirrors migration 089); reachable only via requireStaff-gated service-role routes"
    - "Buyer-readable arm: SELECT policy gated by is_buyer_org_member() + status leaving draft, destructive grants REVOKEd (mirrors migration 106)"
    - "Migration text-test convention (__tests__/migration-NNN.test.ts) asserting structural facts against the .sql text via string/regex"

key-files:
  created:
    - supabase/migrations/111_selects.sql
    - supabase/migrations/112_client_partners_crm.sql
    - __tests__/migration-111.test.ts
    - __tests__/migration-112.test.ts
  modified: []

key-decisions:
  - "selects_tracks.track_id is a NOT NULL UUID FK to public.tracks(id) ON DELETE CASCADE (matches migration 096 sync_listings, NOT a text ref) so rights-ready can be re-evaluated at read time via lib/deals/catalog.ts (Pitfall 3)."
  - "share_token is text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(16),'hex') — schema-qualified to pgcrypto's Supabase home; the sole authorization for the public /selects/[token] player (T-31-03)."
  - "Legacy buyer_orgs.contact_* backfilled non-destructively into a first primary buyer_org_contacts row per org; legacy columns retained (A4, owner-confirmed at push)."

patterns-established:
  - "supabase/migrations/111 + 112 are the Slice-1 data-model foundation; the token player reads selects via the service role (share_token), not RLS."

requirements-completed: [R11, R12, R1, D-02, D-05, D-08, D-09, D-12]

coverage:
  - id: D1
    description: "Selects domain + CRM-lite tables exist with the correct FK (tracks.id), unguessable token, download-gate columns, multi-contact-one-primary shape, and fail-closed REVOKE posture; schema is live (LOCAL=REMOTE through 112)."
    requirement: "R11, R12, R1, D-02, D-08, D-09"
    verification:
      - kind: unit
        ref: "__tests__/migration-111.test.ts, __tests__/migration-112.test.ts"
        status: pass
      - kind: manual
        ref: "owner supabase db push + supabase migration list — LOCAL=REMOTE 001-112 confirmed 2026-08-16"
        status: pass
    human_judgment: true

duration: 15min
completed: 2026-08-16
status: complete
---

# Phase 31 Plan 02: Slice-1 Data Model (Selects domain + CRM-lite) Summary

**Migrations 111 (the Selects domain, keyed on `tracks.id` with an unguessable share token and D-02 download-gate columns) and 112 (multi-contact-one-primary CRM-lite + relationship log + `buyer_orgs.website`), both text-tested and pushed live (LOCAL=REMOTE through 112).**

## Performance

- **Duration:** ~15 min (draft + text-test) + owner push
- **Tasks:** 3 (2 auto + 1 blocking-human checkpoint, resolved)
- **Files modified:** 4 (all new)

## Accomplishments
- `111_selects.sql` — `selects` / `selects_tracks` / `selects_reactions` / `selects_saved_searches`. `selects_tracks.track_id` is a NOT NULL UUID FK to `public.tracks(id)` (Pitfall 3 guard), `share_token` is an unguessable `encode(extensions.gen_random_bytes(16),'hex')` UNIQUE default (T-31-03), and `download_enabled`/`download_max_seconds` are the D-02 per-Selects download gate. Staff-only REVOKE posture with one buyer-readable arm (`is_buyer_org_member` + status ∉ draft).
- `112_client_partners_crm.sql` — `buyer_org_contacts` (multiple per org, at most one primary via a `WHERE is_primary` partial unique index, rich export-friendly record), `client_relationship_log` (append-only notes/conversations), `buyer_orgs.website`. Non-destructive legacy `contact_*` → first primary contact backfill (A4).
- Both migration text-tests green (23 tests); schema pushed live by the owner with `supabase db push`, LOCAL=REMOTE parity confirmed through 112.

## Task Commits

Each task was committed atomically:

1. **Task 1: Migration 111 — Selects domain + text-test** - `1942c4f` (feat)
2. **Task 2: Migration 112 — CRM-lite contacts + relationship log + backfill + text-test** - `102e195` (feat)
3. **Task 3: [BLOCKING] Owner-run migration push + parity** - resolved at checkpoint (owner `supabase db push`; `supabase migration list` LOCAL=REMOTE 001-112, 2026-08-16)

Plus one deviation fix: `48f88f3` (see Deviations).

## Files Created/Modified
- `supabase/migrations/111_selects.sql` - the Selects domain (4 tables, RLS, indexes, buyer-readable arm)
- `supabase/migrations/112_client_partners_crm.sql` - CRM-lite contacts + relationship log + `buyer_orgs.website` + legacy backfill
- `__tests__/migration-111.test.ts` - structural text-test for 111
- `__tests__/migration-112.test.ts` - structural text-test for 112

## Decisions Made
- `selects_tracks.track_id` FK to `tracks(id)` (not a text ref) so rights-ready re-evaluates at read time (Pitfall 3).
- `share_token` schema-qualified to `extensions.gen_random_bytes(16)` (see Deviations) — cryptographically random, the sole public-route authorization.
- Legacy `buyer_orgs.contact_*` retained and non-destructively backfilled to a first primary `buyer_org_contacts` row per org (A4, owner-confirmed).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `gen_random_bytes` failed at owner push (SQLSTATE 42883)**
- **Found during:** Task 3 checkpoint — the owner's first `supabase db push` aborted on migration 111 with `function gen_random_bytes(integer) does not exist`.
- **Issue:** `gen_random_bytes()` is a `pgcrypto` function; Supabase installs pgcrypto in the `extensions` schema, which is off the migration-apply search_path (unlike core `gen_random_uuid()`). The unqualified call in the `share_token` DEFAULT could not be resolved at CREATE TABLE time.
- **Fix:** Added `CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;` and schema-qualified the default as `encode(extensions.gen_random_bytes(16),'hex')`; updated the migration-111 text-test assertion.
- **Files modified:** `supabase/migrations/111_selects.sql`, `__tests__/migration-111.test.ts`
- **Commit:** `48f88f3`
- **Outcome:** Re-push succeeded; `supabase migration list` shows LOCAL=REMOTE through 112.

## Issues Encountered

Initial push failure on `gen_random_bytes` (resolved above). No other Supabase extensions-schema dependencies remain in 111/112 (the `updated_at` triggers use the public `update_updated_at()` from migration 001; the RLS helper `is_buyer_org_member()` is from the applied migration 080).

## User Setup Required

None beyond the owner-run `supabase db push` (completed) — this repo's standing migration convention.

## Next Phase Readiness

The Slice-1 schema is live and fail-closed. Wave 2 (31-04 Selects API, 31-05 AI-draft/saved-searches, 31-06 CRM API, 31-07 Crate-Requests API, 31-12 stream-preview watermark) can now read/write these tables. No blockers.

---
*Phase: 31-ae-client-workspace-selects-my-client-partners-client-partne*
*Completed: 2026-08-16*

## Self-Check: PASSED

- FOUND: supabase/migrations/111_selects.sql
- FOUND: supabase/migrations/112_client_partners_crm.sql
- FOUND: __tests__/migration-111.test.ts
- FOUND: __tests__/migration-112.test.ts
- FOUND: 1942c4f (feat — migration 111)
- FOUND: 102e195 (feat — migration 112)
- FOUND: 48f88f3 (fix — gen_random_bytes schema qualification)
- CONFIRMED: LOCAL=REMOTE 001-112 (owner push, 2026-08-16)
