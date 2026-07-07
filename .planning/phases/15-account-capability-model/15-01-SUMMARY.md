---
phase: 15-account-capability-model
plan: "01"
subsystem: capability-grants-schema
tags: [migration, schema, tdd, capabilities, rls, column-lockdown, backfill, capability-model]
status: complete
dependency_graph:
  requires:
    - "supabase/migrations/034_member_identity_wave4.sql — artist_profiles.member_type column (D-12 backfill source)"
  provides:
    - "capability_grants table with request/approve state machine, partial unique index, RLS, column lockdown (D-01/D-02)"
    - "D-12 member_type backfill: all existing artist_profiles rows preserved as 'approved'/'backfill' grants"
    - "grantCapability() / requestCapability() server-side helpers with D-10 badge auto-attach (lib/capabilities/grant.ts)"
    - "hasCapability() / isValidCapability() read helpers for D-14 route enforcement (lib/capabilities/check.ts)"
    - "Wave 0 unit test suite (14/14 green) — gating signal for Plans 02-04"
  affects:
    - "Plan 02 — POST /api/capabilities/request + /api/capabilities/approve/[grantId] consume grantCapability/requestCapability"
    - "Plan 02 — D-14 hasCapability() gate on POST /api/antenna/opportunities"
    - "Plan 03 — ArtistNav rewiring pulls hasCapability() result server-side"
    - "Plan 04 — admin approval queue reads capability_grants WHERE status='pending'"
tech_stack:
  added: []
  patterns:
    - "TDD RED→GREEN cycle (mirrors Plan 14-01)"
    - "Partial unique index state machine (mirrors connections_active_pair_uniq in migration 035)"
    - "Column-lockdown REVOKE/GRANT doctrine (mirrors migration 040)"
    - "information_schema.columns defensive backfill guard (Pitfall 3)"
    - "DuplicateCapabilityRequestError subclass (mirrors DuplicateIndustryMemberError in createIndustryMember.ts)"
key_files:
  created:
    - supabase/migrations/042_capability_grants.sql
    - lib/capabilities/grant.ts
    - lib/capabilities/check.ts
    - __tests__/capability-grant.test.ts
    - __tests__/capability-check.test.ts
  modified: []
decisions:
  - "capability_grants models both instant-grant and review-then-grant paths in one table — avoids separate approved_grants/pending_requests split that would require JOIN in every capability check (D-01/D-02)"
  - "mapSlugsToProfileRoles() called from grant.ts, not reimplemented — slug→badge mapping stays canonical in lib/industry/roleMapping.ts (D-10)"
  - "Badge auto-attach on grantCapability() uses UPDATE artist_profiles.roles, NOT admin.createUser() — accounts already exist (Pitfall 4)"
  - "Column lockdown (REVOKE INSERT/UPDATE/DELETE from authenticated/anon) ships in the same migration that creates the table — per Wave 4 research CRITICAL flag, not deferred to a later migration"
  - "Partial unique index allows re-request after a terminal 'denied' status — identical rationale to connections_active_pair_uniq (mirrors Phase 08 P02 connection table decision)"
  - "Migration 034-040 stale-blocker retroactively resolved: npx supabase migration list confirmed LOCAL=REMOTE for all 001-042 after push; Phase 8's documented manual-intervention gap (STATE.md Blockers) is now closed"
metrics:
  duration: "~45 minutes (across two sessions: TDD implementation + checkpoint resolution)"
  completed_date: "2026-07-07"
  tasks_completed: 3
  files_changed: 5
---

# Phase 15 Plan 01: Capability-Grants Schema Foundation Summary

Capability-grants data model and server-side helper modules: the `capability_grants` join table with a request/approve state machine, the `grantCapability()`/`requestCapability()` service functions, and the `hasCapability()` read helper — all gated by a Wave 0 TDD suite that must stay green before Plans 02-04 can ship.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | Wave 0 failing tests — capability-grant and capability-check | `418f680` | `__tests__/capability-grant.test.ts`, `__tests__/capability-check.test.ts` |
| 2 (GREEN) | Migration 042 + lib/capabilities/grant.ts + check.ts | `27158ab` | `supabase/migrations/042_capability_grants.sql`, `lib/capabilities/grant.ts`, `lib/capabilities/check.ts` |
| 3 (checkpoint resolved) | Schema push + DB-level verification | `7c8cb17` (pause recorded) + user push on 2026-07-07 | live Supabase DB: funun / wgfjakfiyeewzfuxkgyo |

## Key Artifacts

### Migration 042 — capability_grants table

File: `supabase/migrations/042_capability_grants.sql`

Table columns:
- `id UUID PRIMARY KEY DEFAULT uuid_generate_v4()`
- `profile_id UUID NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE`
- `capability TEXT NOT NULL CHECK (capability IN ('artist','industry'))`
- `status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('pending','approved','denied'))`
- `role_slugs TEXT[] NOT NULL DEFAULT '{}'`
- `source TEXT NOT NULL CHECK (source IN ('signup','self_serve_instant','admin_approved','backfill'))`
- `requested_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `decided_at TIMESTAMPTZ`, `decided_by UUID REFERENCES auth.users(id)`

Indexes:
- `capability_grants_active_uniq ON capability_grants (profile_id, capability) WHERE status IN ('pending','approved')` — partial unique index, mirrors `connections_active_pair_uniq`; allows re-request after terminal 'denied'
- `idx_capability_grants_pending ON capability_grants (status, requested_at) WHERE status = 'pending'` — admin queue lookup

Security:
- RLS enabled with `capability_grants_select_own USING (profile_id = auth.uid())`
- `REVOKE INSERT, UPDATE, DELETE ON capability_grants FROM authenticated, anon` — all writes route through service_role API routes (column-lockdown doctrine)
- `REVOKE SELECT ON capability_grants FROM anon`

D-12 backfill (inside defensive `DO $$ IF EXISTS information_schema.columns ... $$`):
```sql
INSERT INTO capability_grants (profile_id, capability, status, source, decided_at)
SELECT id, member_type, 'approved', 'backfill', now()
FROM artist_profiles
WHERE member_type IS NOT NULL
ON CONFLICT DO NOTHING;
```

### Library function signatures

**`lib/capabilities/check.ts`**

```typescript
export async function hasCapability(
  profileId: string,
  capability: 'artist' | 'industry'
): Promise<boolean>

export function isValidCapability(value: unknown): value is 'artist' | 'industry'
```

`hasCapability` uses `createServiceClient()` with `.from('capability_grants').select('id').eq('profile_id',...).eq('capability',...).eq('status','approved').maybeSingle()`, returning `data !== null`. Returns false for 'pending', 'denied', or absent rows (D-14 gate foundation).

**`lib/capabilities/grant.ts`**

```typescript
export class DuplicateCapabilityRequestError extends Error {}

export async function grantCapability(input: {
  profileId: string
  capability: 'artist' | 'industry'
  roleSlugs: string[]
  source: 'signup' | 'self_serve_instant' | 'admin_approved' | 'backfill'
  decidedBy?: string
}): Promise<{ grantId: string }>

export async function requestCapability(input: {
  profileId: string
  capability: 'artist' | 'industry'
  roleSlugs: string[]
}): Promise<{ grantId: string; status: 'approved' | 'pending' }>
```

- `grantCapability`: inserts `status='approved'`, then `UPDATE artist_profiles.roles = mapSlugsToProfileRoles(roleSlugs)` (D-10 badge auto-attach). Throws `DuplicateCapabilityRequestError` on Postgres error code `23505`.
- `requestCapability`: D-02 asymmetric gate — `capability='artist'` delegates to `grantCapability` (instant approve); `capability='industry'` inserts `status='pending'` with no badge write (badge attaches at admin approval in Plan 02).

## Checkpoint Resolution: Task 3 (Schema Push)

**Resolution signal received:** "pushed" (2026-07-07)

The user ran `npx supabase login` + `npx supabase link --project-ref wgfjakfiyeewzfuxkgyo` + `npx supabase db push` against the live Funūn Supabase project.

**Migration list sync finding (stale-blocker closure):**

`npx supabase migration list` confirmed LOCAL and REMOTE are fully in sync for ALL migrations 001–042. **Migrations 034–040 (Phase 8) were already live on the remote database** — the long-standing "Phase 8 migrations unpushed" blocker recorded in STATE.md Blockers/Concerns was stale. Only migrations 041 and 042 needed pushing in this session.

**This closes the Phase 8 manual-intervention gap retroactively.** The gap recorded in 08-05-SUMMARY.md and the STATE.md blocker entry `[Phase 08] Task 3 (schema push, migrations 034-040) could not run in this sandbox` is now resolved — all Phase 8 migrations are confirmed live.

**DB-level verification results (three SQL checks, all PASS):**

**Check 1 — D-12 backfill (PASS):**

```sql
SELECT capability, status, source, count(*)
FROM capability_grants
GROUP BY 1,2,3;
```

Result: exactly one row: `artist | approved | backfill | 5`

All 5 existing `artist_profiles` rows backfilled as approved artist grants. Zero industry rows is correct — no `member_type='industry'` accounts exist on this database (industry was admin-invite only and unused). D-12 satisfied.

**Check 2 — column lockdown / Pitfall 2 (PASS):**

As `authenticated` role via direct PostgREST:

```sql
UPDATE capability_grants SET status='approved' WHERE id = <any-id>;
```

Result: `ERROR: 42501: permission denied for table capability_grants`

`REVOKE INSERT, UPDATE, DELETE FROM authenticated` is enforced at the database level.

**Check 3 — partial unique index (PASS):**

DO-block duplicate-insert test raised `unique_violation` on the second `pending` insert for the same `(profile_id, capability)` pair. Caught and reported "Check 3 PASSED: duplicate correctly rejected by `capability_grants_active_uniq`". Test row cleaned up via ROLLBACK.

## TDD Gate Compliance

- RED gate: `418f680` — `test(15-01)` commit — both test files import from non-existent `@/lib/capabilities/grant` and `@/lib/capabilities/check`, failing with `Cannot find module`
- GREEN gate: `27158ab` — `feat(15-01)` commit — 14/14 tests pass
- REFACTOR: not needed (implementation is minimal and clean on first pass)

## Verification Status

| Check | Status | Notes |
|-------|--------|-------|
| `npx jest __tests__/capability-grant.test.ts __tests__/capability-check.test.ts` | PASS | 14/14 green |
| `npx tsc --noEmit` | PASS | Zero errors |
| `grep -c "REVOKE" 042_capability_grants.sql` | PASS | 2 REVOKE statements (authenticated + anon) |
| `capability_grants_active_uniq` partial unique index present | PASS | Confirmed in migration + live DB |
| `information_schema.columns` defensive backfill guard | PASS | DO $$ block guards member_type existence |
| `mapSlugsToProfileRoles` reused in grant.ts (not reimplemented) | PASS | Import from @/lib/industry/roleMapping |
| `admin.createUser` absent from grant.ts | PASS | File does not contain admin.createUser |
| D-12 backfill landed on live DB | PASS | 5 rows, artist/approved/backfill (Check 1 above) |
| Column lockdown enforced at DB level | PASS | 42501 on authenticated UPDATE (Check 2 above) |
| Partial unique index rejects duplicates at DB level | PASS | unique_violation on second pending insert (Check 3 above) |
| Migrations 034-040 (Phase 8) live on remote | PASS — retroactive | supabase migration list: LOCAL=REMOTE for 001-042 |

## Deviations from Plan

### Stale-blocker Discovery (Informational)

**Type:** Informational discovery (not a code deviation)

- **Found during:** Task 3 checkpoint resolution
- **Issue:** STATE.md contained a stale blocker: "Phase 08 migrations 034-040 unpushed." This was recorded during Phase 8 execution when the sandbox lacked credentials.
- **Reality confirmed by user:** `npx supabase migration list` output showed ALL migrations 001-042 as `LOCAL` and `REMOTE` in sync. Phase 8 migrations were already live.
- **Impact:** No code change needed. The blocker entry in STATE.md can be cleared by the orchestrator. The 08-05-SUMMARY.md manual-intervention note remains historically accurate (describing what was true at that moment) but the gap is now closed.

No code deviations — plan executed exactly as written.

## Known Stubs

None — this plan is pure schema and library logic. No UI, no data display. Plans 02-04 wire these functions to routes and components.

## Threat Flags

All threat model entries (T-15-01 through T-15-SC) were mitigated in this plan:

| Threat | Mitigation | Status |
|--------|-----------|--------|
| T-15-01: Elevation of Privilege — direct INSERT with status='approved' | REVOKE INSERT/UPDATE/DELETE from authenticated/anon; DB-level check PASSED (42501) | MITIGATED |
| T-15-02: Tampering — duplicate concurrent capability requests | Partial unique index `capability_grants_active_uniq`; DB-level check PASSED (unique_violation) | MITIGATED |
| T-15-03: Information Disclosure — reading another member's grant state | RLS policy `capability_grants_select_own USING (profile_id = auth.uid())`; anon SELECT revoked | MITIGATED |
| T-15-04: Tampering — backfill migration fails on DB without member_type | `information_schema.columns` existence guard makes backfill a safe no-op | MITIGATED |
| T-15-SC: No new npm packages | No packages installed | N/A |

## Self-Check: PASSED

- [x] `supabase/migrations/042_capability_grants.sql` — found (3,988 bytes)
- [x] `lib/capabilities/grant.ts` — found (4,034 bytes)
- [x] `lib/capabilities/check.ts` — found (1,205 bytes)
- [x] `__tests__/capability-grant.test.ts` — found (6,047 bytes)
- [x] `__tests__/capability-check.test.ts` — found (3,416 bytes)
- [x] Commits `418f680`, `27158ab`, `7c8cb17` — all found in git log
- [x] 14/14 tests green (final run confirmed)
- [x] `npx tsc --noEmit` — zero errors (final run confirmed)
