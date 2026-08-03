---
phase: 16-gtm-beta-buyer-portal
plan: 01
subsystem: buyers
tags: [supabase, postgres, rls, security-definer, typescript, jest, buyer-identity]

# Dependency graph
requires: []
provides:
  - buyer_orgs / buyer_members tables (migration 080) — the fully-separate buyer identity layer
  - handle_new_user() buyer early-return branch — buyers never get a user_profiles row
  - is_buyer_org_member() SECURITY DEFINER helper — non-recursive RLS scoping for buyer_members/buyer_orgs
  - lib/buyers/schema.ts (BuyerOrg/BuyerMember types, BUYER_ROLE_VALUES/LABELS)
  - lib/buyers/permissions.ts (hasApproverRole/canSubmitRequest/canApproveTerms/canManageMembers/isOrgMember — pure, fail-closed)
  - lib/buyers/org.ts (buildPersonalOrgName, normalizeBuyerRole)
affects: [16-02-license-requests-deals, 16-03-buyer-provisioning, 16-04-artist-deals-room, 16-06-buyer-request-route, 16-11-ddex-identifiers]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "is_buyer_org_member(p_org_id, p_uid) SECURITY DEFINER helper mirrors the no_block()/migration-064/078 pattern — avoids 42P17 self-referential RLS recursion on a table whose own SELECT policy needs to check membership in itself"
    - "Two-tier permission model (requester/approver) as pure predicate functions over already-fetched rows, no Supabase client — mirrors lib/capabilities/check.ts"

key-files:
  created:
    - supabase/migrations/080_buyer_orgs_members.sql
    - lib/buyers/schema.ts
    - lib/buyers/permissions.ts
    - lib/buyers/permissions.test.ts
    - lib/buyers/org.ts
  modified: []

key-decisions:
  - "[Rule 2 — deviation from plan body] Added is_buyer_org_member() SECURITY DEFINER helper, not explicitly named in the plan's task action prose. buyer_members' own SELECT policy needs to check 'is this caller a member of this row's org', which is a self-referential subquery on buyer_members itself — evaluating that under RLS directly produces a 42P17 infinite-recursion error. Migrations 064 (no_block()) and 078 (project_members) hit and fixed this exact class of bug; this plan pre-empts it by mirroring the same SECURITY DEFINER + EXECUTE REVOKE FROM PUBLIC/anon/authenticated + GRANT TO authenticated pattern from day one, applied to both buyer_members and buyer_orgs SELECT policies."
  - "Two permission tiers only (requester/approver) — no third viewer tier, matching D-13. canSubmitRequest is true for BOTH tiers (D-14a) so a requester is never blocked from creating a request; canApproveTerms is approver-only."
  - "Buyer branch positioned in handle_new_user() alongside the existing curator early-return, before the default artist_profiles-insert fallback — rebased on migration 076's LIVE function body (user_profiles), not migration 039, per the plan's explicit C1 correction."
  - "handle_new_user() intentionally carries no SET search_path = '' — preserved 076's convention of fully public-qualified object references rather than introducing a new pattern."

# Metrics
duration: unknown (continuation/finalization pass; original execution session not timed by this agent)
completed: 2026-08-03
status: complete
---

# Phase 16 Plan 01: Buyer Identity — Orgs, Members, Permission Tiers Summary

**Fully-separate buyer identity layer (buyer_orgs/buyer_members, migration 080) with a two-tier requester/approver permission model and a phantom-row-safe handle_new_user() buyer branch — migration 080 is now live (LOCAL=REMOTE), confirmed via `supabase migration list` and a service-role read against `buyer_orgs` returning 200.**

## What Was Built

- **Migration 080** (`supabase/migrations/080_buyer_orgs_members.sql`): `buyer_orgs` (born-verified per D-14, `is_personal` flag for solo-buyer auto-orgs) and `buyer_members` (two-tier `buyer_role` CHECK constraint, `is_org_admin`, `UNIQUE(org_id, user_id)`). `handle_new_user()` rebased on migration 076's live body (not 039 — C1 review finding), with a buyer early-return branch (`RETURN NEW` before any `user_profiles`/`subscriptions` insert) positioned alongside the existing curator early-return. RLS enabled on both tables; SELECT policies scope to the caller's own org via the `is_buyer_org_member()` helper; `INSERT`/`UPDATE`/`DELETE` REVOKEd from `authenticated`/`anon` (all buyer-table writes are server-owned); column-level `SELECT` GRANT allowlist mirrors migration 058's convention.
- **lib/buyers/schema.ts**: `BUYER_ROLE_VALUES`/`BUYER_ROLE_LABELS`, `BuyerOrg`/`BuyerMember`/`BuyerRole` types, named exports only, no semicolons, per project style.
- **lib/buyers/permissions.ts**: `hasApproverRole`, `canSubmitRequest` (true for both tiers, D-14a), `canApproveTerms` (approver-only), `canManageMembers` (org-admin-only), `isOrgMember` — all pure, fail-closed on missing/unknown roles.
- **lib/buyers/org.ts**: `buildPersonalOrgName`, `normalizeBuyerRole` — pure helpers for the provisioning route plan 16-03 will build; no I/O, no Supabase client, no account-creation side effects (kept out per plan instruction).
- **lib/buyers/permissions.test.ts**: RED-first coverage of every behavior-block case (approver/requester capability split, org-admin-only member management, fail-closed on no membership row).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Auto-add missing critical functionality] Added `is_buyer_org_member()` SECURITY DEFINER helper**
- **Found during:** Task 1 (migration 080 authoring)
- **Issue:** The plan's Task 1 action describes a SELECT policy on `buyer_members` scoping rows "via a subquery on `buyer_members`" — i.e., a self-referential RLS check. Evaluating a table's own RLS policy via a direct subquery on that same table produces Postgres error 42P17 (infinite recursion detected in policy). This codebase already hit and fixed this exact bug class twice (migration 064's `no_block()`, migration 078's `project_members` rewrite).
- **Fix:** Added `is_buyer_org_member(p_org_id uuid, p_uid uuid)` as a `SECURITY DEFINER` function, `EXECUTE` revoked from `PUBLIC`/`anon`/`authenticated` and granted only to `authenticated` (intended for RLS policy bodies, not client RPC — mirroring the `no_block()` doctrine). Both `buyer_members` and `buyer_orgs` SELECT policies call this helper instead of a bare self-referential subquery.
- **Files modified:** `supabase/migrations/080_buyer_orgs_members.sql`
- **Verification:** Structural greps pass (`STRUCTURE_OK`); live push confirmed schema-valid (PostgREST recognizes `buyer_orgs`, service-role read returned 200 — no 42P17 raised at push time).
- **Commit:** `49b4950`

---

**Total deviations:** 1 auto-fixed (Rule 2, pre-emptive correctness fix mirroring established precedent).
**Impact on plan:** Necessary to avoid a guaranteed-recurring RLS recursion error the moment any buyer session queries `buyer_members`. No scope creep — reused the exact pattern already proven at migrations 064/078.

## Task Commits

1. **Task 1: Author migration 080** — `49b4950` (feat) — buyer_orgs/buyer_members + handle_new_user buyer branch + `is_buyer_org_member()` helper.
2. **Task 2 (RED): Buyer permission tiers test** — `c2a77e7` (test) — permissions.test.ts written to the behavior block first.
3. **Task 2 (GREEN): Buyer schema types + pure permission logic** — `19c4e68` (feat) — schema.ts/permissions.ts/org.ts implemented to green.

## Live Migration Push — Approved

The Task 3 checkpoint (`checkpoint:human-verify`, gate `blocking-human`) required a human to run `supabase db push` against the live database — an executor agent never runs this command. The operator pushed migrations 080, 081, and 082 together, in order:

- `supabase migration list` shows **LOCAL=REMOTE through 082**.
- PostgREST recognizes the new `buyer_orgs` table (service-role read returned 200).
- Operator response: **"approved."**

This confirms the migration is live **at the schema level** (service-role read, which bypasses RLS).

## Outstanding / Deferred — Behavioral Adversarial Checks

The following checks named in this plan's `<verification>` block and Task 3's `how-to-verify` steps have **NOT** been executed and are recorded here as **DEFERRED**, not passed:

- **Phantom-row guard sanity query**: `SELECT COUNT(*) FROM user_profiles WHERE id IN (SELECT id FROM auth.users WHERE raw_app_meta_data->>'role'='buyer')` must return 0. This requires at least one buyer account to exist. Buyer signup/provisioning is built in a later Wave 2 plan (16-03) — no buyer account exists yet, so this check cannot run today.
- **RLS row-scoping smoke test** (a buyer session can only see their own org's `buyer_members`/`buyer_orgs` rows) — also requires a live buyer account and a second buyer/org to test cross-org isolation against.
- **Column-grant lockdown adversarial check** (a buyer session cannot read a non-granted column via direct PostgREST) — requires a live buyer session to attempt.

These are tracked as outstanding for the phase verifier and should be executed once Wave 2 (buyer signup) ships a real buyer account.

## Threat Flags

None beyond the plan's own threat model (T-16-01/02/03), which are addressed by the artifacts above. No new surface introduced outside the plan's scope.

## Self-Check

- `supabase/migrations/080_buyer_orgs_members.sql` — FOUND
- `lib/buyers/schema.ts` — FOUND
- `lib/buyers/permissions.ts` — FOUND
- `lib/buyers/permissions.test.ts` — FOUND
- `lib/buyers/org.ts` — FOUND
- Commit `49b4950` — FOUND in git log
- Commit `c2a77e7` — FOUND in git log
- Commit `19c4e68` — FOUND in git log
- Migration 080 confirmed LOCAL=REMOTE per operator-reported `supabase migration list` output (schema-level only, not independently re-run by this agent — no live-DB commands executed per this continuation's constraints).

---
*Phase: 16-gtm-beta-buyer-portal*
*Completed: 2026-08-03*

## Self-Check: PASSED

All listed artifacts and task commits confirmed present on disk / in git log. Live migration push confirmed via operator-reported `supabase migration list` (LOCAL=REMOTE through 082) and PostgREST schema recognition — this agent did not run any live-DB command itself. Behavioral adversarial checks (phantom-row guard, RLS row-scoping, column-grant lockdown) remain DEFERRED pending a real buyer account (Wave 2).
