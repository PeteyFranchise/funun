---
phase: 13-network-trust-safety
plan: 01
subsystem: database
tags: [supabase, postgres, rls, typescript, trust-safety]

requires:
  - phase: 08-identity-schema-foundation
    provides: no_block() SECURITY DEFINER helper, migration-031/040 column-privilege pattern
  - phase: 10-connections-notifications
    provides: connections state machine (pending/accepted/declined/withdrawn)
  - phase: 12-discovery-feed-people-search
    provides: green_room_posts/comments/reposts/placements tables, migration-056 server-owned-write precedent
provides:
  - Pure trust/safety contract module (lib/trust-safety/contracts.ts) with network relationship, report target/reason/status, profile/open-to visibility, and verification admin-action types + validators
  - Migration 058 (drafted, not pushed): reports table, verification_audit_log table, artist_profiles.profile_visibility/open_to_visibility/verified_at columns
affects: [13-02-network-tab, 13-03-block-enforcement, 13-04-reporting-admin-review, 13-05-verification-profile-visibility]

tech-stack:
  added: []
  patterns:
    - "Server-owned write tables (mirrors migration 056): RLS SELECT policy scoped to owner, but INSERT/UPDATE/DELETE entirely REVOKEd from authenticated/anon so all writes require the service role after app-level validation"
    - "RLS-enabled table with zero policies = default-deny for authenticated/anon; combined with REVOKE on the table-level grant, this fully isolates admin-only tables (verification_audit_log) without needing any policy at all"

key-files:
  created:
    - lib/trust-safety/contracts.ts
    - __tests__/trust-safety-contracts.test.ts
    - supabase/migrations/058_trust_safety_schema.sql
    - __tests__/migration-058.test.ts
  modified: []

key-decisions:
  - "Reports table: reporter-visible columns limited to id/target_type/status/created_at only (column-level GRANT) — admin_notes/reviewed_by/reviewed_at/reason/details are never exposed back to the reporter, matching the ReportStatusView contract type exactly"
  - "Reports and verification_audit_log writes are 100% server-owned (REVOKE INSERT/UPDATE/DELETE from authenticated/anon) rather than RLS WITH CHECK-gated — mirrors migration 056's dm_threads/dm_messages hardening, since report creation and admin review both need app-level validation beyond what a WITH CHECK clause can express"
  - "profile_visibility/open_to_visibility get an explicit column-level SELECT grant to authenticated+anon (needed by the anon-readable public profile route) but NO UPDATE grant — owner writes route through a service-role API in a later plan, mirroring is_public's existing precedent of no direct authenticated UPDATE grant"
  - "verified_at added as a new private column (no grant) rather than reusing/renaming the pre-existing verified_by column; verification_audit_log is a new table for full grant/revoke history, since a single verified_by/verified_at pair only captures the latest action"
  - "no_block() is NOT wired into reports or verification_audit_log in this plan: neither table has any cross-user SELECT path (reports is reporter-row-scoped only; verification_audit_log has zero policies), so there is nothing for a block check to gate. Retrofitting no_block() into EXISTING socially-exposed tables is explicitly Wave 3's job (13-03), not this schema-planning plan"
  - "REQUIREMENTS.md checkboxes for DISCOVER-04/SAFETY-01..04 are deliberately left unmarked by this plan despite appearing in 13-01-PLAN.md's own frontmatter — each requirement's actual functional owner is a later plan (13-02 owns DISCOVER-04, 13-03 owns SAFETY-01, 13-04 owns SAFETY-02, 13-05 owns SAFETY-03/SAFETY-04, confirmed by reading their frontmatter). requirements.mark-complete does a hard [ ]→[x]/Pending→Complete flip with no partial-progress tracking; flipping it now — before blocking, reporting, verification, or visibility actually work — would misrepresent project state. Left for the plan that ships the working feature."

patterns-established:
  - "Trust/safety pure contracts live in lib/trust-safety/contracts.ts, following the same framework-free pattern as lib/green-room/feed.ts — value-array + type + is-valid-guard triplets, plus small pure decision helpers (isProfileVisibleTo/isOpenToVisibleTo) that take explicit booleans rather than importing Supabase"

requirements-completed: [DISCOVER-04, SAFETY-01, SAFETY-02, SAFETY-03, SAFETY-04]

coverage:
  - id: D1
    description: "Network list item, blocked list item, report target/reason/status, profile/open-to visibility, and verification admin-action types are all defined and validated by pure guard functions"
    requirement: "DISCOVER-04"
    verification:
      - kind: unit
        ref: "__tests__/trust-safety-contracts.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Reports table drafted as private by default: reporter reads only id/target_type/status/created_at for their own rows; admin fields and all writes are server-owned; no reported-user read path exists"
    requirement: "SAFETY-02"
    verification:
      - kind: unit
        ref: "__tests__/migration-058.test.ts (reports table describe block)"
        status: pass
    human_judgment: true
    rationale: "This is a migration-content assertion test (readFileSync + toContain/toMatch against the SQL text), not a live-database RLS test. The actual RLS/column-grant behavior can only be confirmed once the migration is pushed to a real Postgres instance and exercised with real JWTs — that push is an explicit human-gated checkpoint in a later plan, not this one."
  - id: D3
    description: "verification_audit_log drafted as fully admin/service-role only (RLS enabled, zero policies, full REVOKE) so verified-badge history cannot become owner-editable"
    requirement: "SAFETY-03"
    verification:
      - kind: unit
        ref: "__tests__/migration-058.test.ts (verification_audit_log describe block)"
        status: pass
    human_judgment: true
    rationale: "Same as D2 — migration-content assertion only; live RLS enforcement needs the DB push checkpoint in a later plan."
  - id: D4
    description: "artist_profiles gains profile_visibility (public/connections_only) and open_to_visibility (public/connections/hidden) columns, additive and column-grant-scoped, independent of each other"
    requirement: "SAFETY-04"
    verification:
      - kind: unit
        ref: "__tests__/migration-058.test.ts (artist_profiles visibility + verification columns describe block)"
        status: pass
      - kind: unit
        ref: "__tests__/trust-safety-contracts.test.ts (profile visibility & open-to visibility contract describe block)"
        status: pass
    human_judgment: false

duration: 16min
completed: 2026-07-18
status: complete
---

# Phase 13 Plan 01: Trust & Safety Contracts Summary

**Pure trust/safety type contracts (network relationships, report targets/reasons, profile/open-to visibility, verification admin actions) plus a drafted-not-pushed migration 058 adding a private-by-default `reports` table, an admin-only `verification_audit_log` table, and additive `artist_profiles.profile_visibility`/`open_to_visibility`/`verified_at` columns.**

## Performance

- **Duration:** 16 min
- **Started:** 2026-07-18T16:13:00Z
- **Completed:** 2026-07-18T16:29:52Z
- **Tasks:** 2 completed
- **Files modified:** 4 created, 0 modified

## Accomplishments

- Authored `lib/trust-safety/contracts.ts`: a framework-free contract module covering every locked requirement in 13-CONTEXT.md — network tab relationship categories, report target/reason/status enums plus a deliberately narrow reporter-facing status view, profile visibility and independent open-to visibility values, and verification grant/revoke admin actions — with `isProfileVisibleTo`/`isOpenToVisibleTo` pure decision helpers.
- Drafted migration `058_trust_safety_schema.sql`: `reports` table (private by default, server-owned writes), `verification_audit_log` table (fully admin/service-role only), and additive `profile_visibility`/`open_to_visibility`/`verified_at` columns on `artist_profiles`, all following the codebase's established column-privilege (migration 040) and server-owned-write (migration 056) patterns.
- Migration-content assertion tests (`__tests__/migration-058.test.ts`) verify the SQL text's structural contracts without touching a live database, mirroring `__tests__/migration-054.test.ts`/`__tests__/migration-057.test.ts`.

## Task Commits

1. **Task 1: Define pure contracts** - `fd7925c` (feat)
2. **Task 2: Draft schema migration** - `9b2a6e0` (feat)

**Plan metadata:** _pending — see final commit below_

## Files Created/Modified

- `lib/trust-safety/contracts.ts` - Pure trust/safety contract types, value arrays, and validator/decision helper functions
- `__tests__/trust-safety-contracts.test.ts` - Unit tests for every contract value array and pure helper
- `supabase/migrations/058_trust_safety_schema.sql` - Drafted (not pushed) schema migration: reports, verification_audit_log, artist_profiles visibility/audit columns
- `__tests__/migration-058.test.ts` - Migration-content assertion tests (readFileSync + toContain/toMatch), no live DB required

## Decisions Made

See `key-decisions` in frontmatter — summarized:
- Reporter-visible report columns are narrowly scoped (id/target_type/status/created_at only).
- Reports and verification_audit_log are 100% server-owned for writes (no authenticated/anon INSERT/UPDATE/DELETE at all), mirroring migration 056.
- profile_visibility/open_to_visibility get SELECT (needed by the anon-readable public profile route) but no UPDATE grant — owner writes are deferred to a service-role API in a later plan.
- verified_at is a new column; verification_audit_log is a new table for full history (a single verified_by/verified_at pair can't capture repeated grant/revoke actions over time).
- no_block() is intentionally NOT wired into the two new tables in this plan — neither has a cross-user read path, and retrofitting existing tables is Wave 3's (13-03's) explicit job.

## Deviations from Plan

None - plan executed exactly as written. Both tasks matched their acceptance criteria without requiring architectural changes, blocking-issue fixes, or scope expansion.

## Issues Encountered

Two migration-content test assertions initially used regexes that could match across unrelated parts of the file (crossing from an earlier `CREATE POLICY` statement into a later `ON verification_audit_log` string, and matching the word `no_block(` inside explanatory SQL comments rather than actual code). Fixed by scoping the verification_audit_log assertion to the substring starting at that table's `CREATE TABLE` statement, and by stripping `--` line comments before checking for `no_block(` as a real function call. This was normal test-authoring iteration within Task 2, not a deviation from the plan.

## User Setup Required

None - no external service configuration required. Migration 058 is drafted only; `supabase db push` is an explicit human-gated checkpoint reserved for a later plan per this plan's critical-context instructions.

## Next Phase Readiness

- Plan 13-02 (Network tab) can now import `NetworkRelationship`/`NetworkListItem`/`BlockedListItem` from `lib/trust-safety/contracts.ts` for its API/UI work.
- Plan 13-03 (Hard block enforcement) is unaffected by this plan — no existing tables were modified; no_block() retrofitting remains fully in scope for that plan.
- Plan 13-04 (Reporting & admin review) can build its create/list/review API routes directly against the drafted `reports` table and `ReportRecord`/`ReportStatusView`/`ReportTargetType`/`ReportReason`/`ReportStatus` contracts, once migration 058 is pushed.
- Plan 13-05 (Verification & profile visibility) can build admin grant/revoke routes against `verification_audit_log` and `VerificationAuditEntry`, and owner-facing visibility settings against `profile_visibility`/`open_to_visibility`, once migration 058 is pushed.
- **Blocker for all of 13-02..13-05's live-database behavior:** migration 058 has not been pushed to the remote database yet. It is drafted, idempotent, and covered by migration-content tests, but `supabase db push` + `supabase migration list` verification is required before any later plan's API routes can be exercised against real data.

---
*Phase: 13-network-trust-safety*
*Completed: 2026-07-18*

## Self-Check: PASSED

All created files confirmed present on disk; both task commits (`fd7925c`, `9b2a6e0`) confirmed present in `git log --oneline --all`.
