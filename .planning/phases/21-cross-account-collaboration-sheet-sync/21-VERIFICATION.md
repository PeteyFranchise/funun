---
phase: 21-cross-account-collaboration-sheet-sync
verified: 2026-08-02T06:13:44Z
status: human_needed
score: 12/20 must-haves verified
behavior_unverified: 8 # present + wired (migrations pushed live, structurally tested), live behavior not exercised — see behavior_unverified_items
overrides_applied: 0
behavior_unverified_items:
  - truth: "Owner SELECTs their own vault_projects and all four child rows exactly as before (migration 078)"
    test: "As Account A (owner), SELECT own vault_projects row and its tracks/vault_assets/vault_documents/tool_outputs rows against the LIVE database"
    expected: "All rows returned unchanged from pre-078 behavior"
    why_human: "RLS enforcement can only be proven against a real Postgres/PostgREST instance with a real session; no live-RLS harness exists in this repo. 21-RLS-SMOKE-CHECKLIST.md has 0/31 boxes checked."
  - truth: "A viewer member SELECTs a shared project AND its four child-table rows (migration 078)"
    test: "Grant Account B a viewer project_members row on Account A's project; SELECT the project and its child rows as Account B"
    expected: "Account B sees the project and all four child tables' rows for that project"
    why_human: "Same reason — live RLS behavior, no automated harness; checklist unchecked."
  - truth: "A co-owner or editor member can UPDATE the shared project and its child rows; a viewer CANNOT (migration 078)"
    test: "As co-owner/editor Account B, UPDATE the shared project and a child row; as viewer Account B, attempt the same UPDATE"
    expected: "co-owner/editor UPDATE succeeds; viewer UPDATE is RLS-filtered (0 rows affected / blocked)"
    why_human: "Live RLS behavior; checklist unchecked."
  - truth: "Only the owner can DELETE a project (migration 078)"
    test: "As co-owner/editor/viewer Account B, attempt DELETE on Account A's project"
    expected: "DELETE fails/no-ops for all non-owner roles"
    why_human: "Live RLS behavior; checklist unchecked."
  - truth: "An owner-membership row exists in project_members for every pre-existing vault_projects row after backfill (migration 078)"
    test: "COUNT(*) FROM vault_projects vs COUNT(*) FROM project_members WHERE role='owner' on the live database"
    expected: "Counts match"
    why_human: "Requires a live database query against production data; not exercisable from the repo."
  - truth: "Every authenticated read on vault_projects / project_members succeeds without a 42P17 recursion error (migration 078)"
    test: "Any authenticated SELECT against vault_projects or project_members post-078"
    expected: "No 42P17 error"
    why_human: "Only observable against the live Postgres planner/rewriter; the SECURITY DEFINER helper-pair shape mirrors migration 064's proven fix but this is a runtime property, not provable by static/structural test alone."
  - truth: "A claimed writer on a project-linked, non-draft split sheet automatically gains a viewer project_members row, from any of the three event orderings, idempotently (migration 079)"
    test: "Run the three orderings from 21-02-PLAN.md Task 3 how-to-verify (claim-then-party, party-then-claim, draft-gate) plus an idempotent re-fire, against two real accounts"
    expected: "Viewer row appears in all applicable cases, never for a draft sheet, never duplicated on re-fire"
    why_human: "21-02-SUMMARY.md explicitly records this as 'NOT YET SMOKED' / 'OUTSTANDING' — only the migration push + PostgREST schema-cache recognition were confirmed live, not the behavioral trigger firing."
  - truth: "A writer on a still-draft (unsent) linked sheet does NOT gain project visibility (migration 079 draft gate)"
    test: "Add a claimed collaborator as a party on a still-draft linked sheet; confirm no project_members row appears"
    expected: "No membership row until the sheet leaves draft"
    why_human: "Same outstanding behavioral smoke as above."
human_verification:
  - test: "Run the full 21-RLS-SMOKE-CHECKLIST.md access matrix (owner/co-owner/editor/viewer/non-member × SELECT/UPDATE/DELETE × vault_projects + 4 child tables) against two-plus real accounts on the live database."
    expected: "Every cell matches the expected access pattern; all 31 checkboxes get checked."
    why_human: "No live-RLS test harness exists in this repo; this is the phase's own documented gate evidence and it is currently 0/31 checked despite 21-01-SUMMARY.md's 'approved'/'passed' narrative."
  - test: "Run 21-02-PLAN.md Task 3's three event-ordering + draft-gate + idempotency auto-membership smoke against two real accounts."
    expected: "Viewer row appears in the claim-then-party and party-then-claim cases once the sheet is non-draft; no row while draft; re-firing does not duplicate."
    why_human: "21-02-SUMMARY.md records this explicitly as outstanding — not run."
  - test: "As a second real account with a viewer project_members row, load /vault and visually confirm the 'Shared with me' lane renders the project, badged 'Shared · {owner}'s project' + 'You're a viewer', with no edit/new-project CTA on the shared card, and that the owned grid/counts are unaffected."
    expected: "Shared card renders correctly, isolated from the owned grid."
    why_human: "21-03-SUMMARY.md D2 flags this as unexercised — no seeded shared-membership fixture exists in this repo; the query/badge code is unit-tested but never rendered against live cross-account RLS-visible data."
  - test: "As the sheet initiator, edit a linked living-draft sheet's writers/splits and confirm the linked project's track composers update; then edit the project's composers and confirm the draft sheet's parties update; then send the sheet for signature and confirm further edits on either side stop syncing."
    expected: "Bidirectional sync observed live in both directions while draft; sync stops once esign_pending/executed."
    why_human: "21-04-SUMMARY.md D3/D4 flag this — no live-DB/session test harness exists for app/api/** routes in this repo; the pure mapping/merge logic is fully unit-tested and both PATCH routes are confirmed wired via code read, but the end-to-end live write was not exercised."
  - test: "As a second real account with a pending cross-account split-sheet action (e.g. named party on someone else's non-draft sheet), load the dashboard and visually confirm the 'Your next moves' feed lists the cross-account item, with money/signature rows rendered in the pinned (amber) tier above flexible rows."
    expected: "Cross-account item appears with correct pinned/flexible tiering."
    why_human: "21-05-SUMMARY.md D3 flags this as unexercised — buildNextMoves() itself is fully unit-tested (12 tests) and the dashboard wiring is confirmed via code read, but no live second-account cross-verification was run in this autonomous execution."
---

# Phase 21: Cross-Account Collaboration & Split-Sheet ↔ Project Sync Verification Report

**Phase Goal:** Make a song a single source of truth shared by the people on it. A split sheet and its
Sound Vault project stay linked (writers/roles/splits) while the sheet is a draft, and every
collaborator with a Funūn account sees the shared project + the tasks waiting on them, from their own
account, with no data re-entry. First concrete slice of the post-beta access model.

**Verified:** 2026-08-02T06:13:44Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

Every decision ID this phase claims (①-access-model, ②-membership, ③-mine-vs-shared, ④-dashboard,
identity-dedupe-claim, sheet-project-sync) has shipped code — all five plans' artifacts exist, are
substantive (no stubs), are wired into their call sites, and pass the full test suite (96 suites /
1204 tests green, `tsc --noEmit` clean). **However, this phase's load-bearing security surface —
migration 078's RLS rewrite and migration 079's auto-membership trigger — has been pushed live but its
own documented behavioral smoke tests have NOT been run against real second accounts.** The
21-RLS-SMOKE-CHECKLIST.md this phase itself produced as the gate evidence has 0 of 31 checkboxes
checked. 21-01-SUMMARY.md's narrative ("the full RLS access-matrix smoke... passed... Operator response:
approved") is **not corroborated by any evidence in the repo** — the checklist file has no checked boxes,
and 21-02-SUMMARY.md (same session context, same phase) explicitly and consistently records the
overlapping auto-membership behavioral smoke as "OUTSTANDING... NOT YET SMOKED." This verification does
NOT accept the 21-01-SUMMARY.md claim at face value; it is treated as unproven.

The owner's own live post-push check used a SERVICE-ROLE query pattern (per the task brief), which
bypasses RLS entirely and cannot validate the policies it was meant to prove. No live RLS enforcement
claim in this phase is corroborated by evidence this verifier can independently confirm.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Owner SELECTs own vault_projects + 4 child rows unchanged | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Migration 078 owner-path SELECT policy present (`(SELECT auth.uid()) = user_id`); 38/38 structural tests pass; live RLS smoke not run (checklist 0/31) |
| 2 | Viewer member SELECTs shared project + 4 child rows | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Policy present, project_id-keyed via helpers (not row's own user_id — RESEARCH Pitfall 1 addressed); live smoke not run |
| 3 | Co-owner/editor UPDATE shared project + child rows; viewer cannot | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | UPDATE policies present with correct role sets; live smoke not run |
| 4 | Only owner DELETEs a project | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | DELETE policy owner-only; live smoke not run |
| 5 | Owner-membership backfill row exists for every pre-existing project | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Backfill INSERT with ON CONFLICT DO NOTHING present in 078; live count-match not confirmed |
| 6 | No 42P17 recursion on any authenticated read | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | SECURITY DEFINER helper pair mirrors migration 064's proven fix exactly; runtime property, not provable statically |
| 7 | Auto-membership grants viewer row from claimed writer on linked, non-draft sheet, idempotent across 3 orderings | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Trigger authored at all 3 fire sites, 19/19 structural tests pass; 21-02-SUMMARY.md explicitly records this smoke as NOT run |
| 8 | Draft-gated linked sheet grants nothing | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `status <> 'draft'` guard present in trigger body; live confirmation not run |
| 9 | Auto-membership keys strictly off verified `collaborators.claimed_by`, never a typed email or the dead `split_sheet_parties.user_id` | ✓ VERIFIED | Migration 079 body reads only `c.claimed_by`/`NEW.claimed_by`; grep confirms no read of `split_sheet_parties.user_id` |
| 10 | Vault page renders a separate "Shared with me" section, distinct from the owned grid | ✓ VERIFIED | `app/(artist)/vault/page.tsx` lines 210-219: separate render block, only shown when non-empty |
| 11 | Shared card badged with owner's name + viewer's own role | ✓ VERIFIED | `SharedProjectBadge.test.tsx` 3/3 tests pass; component renders exact text per ③ |
| 12 | Owned-projects query unchanged (`.eq('user_id', me)`) | ✓ VERIFIED | Grep confirms line 59 of vault/page.tsx intact; shared query is a separate parallel query |
| 13 | Forward sync: sheet party edits → linked project's track composer metadata (while draft) | ✓ VERIFIED (code+unit level) | `mapPartiesToComposers`/`mergeComposers` unit-tested (5 behaviors incl. idempotent round-trip); hook wired into PATCH `/api/split-sheets/[id]` gated on `isSyncActive` |
| 14 | Reverse sync: project composer edits → linked living-draft sheet parties (initiator-only) | ✓ VERIFIED (code+unit level) | `mapComposersToParties` unit-tested; hook wired into PATCH tracks route with single-account guard (`.eq('initiator_user_id', user.id)`) confirmed by code read |
| 15 | Sync active window keyed off `lifecycle.ts` vocabulary (not a fresh `'draft'` literal), stops on send-for-signature | ✓ VERIFIED | `isSyncActive`/`SYNC_FROZEN_STATUSES` unit-tested; both PATCH routes call `isSyncActive` from lifecycle.ts, no re-declared literal |
| 16 | Writers ⊆ credits: project-only performers/producers preserved through sync | ✓ VERIFIED | `mergeComposers` unit test explicitly covers this invariant |
| 17 | Dashboard no longer shows "Avg readiness" | ✓ VERIFIED | Grep confirms zero matches of `avgScore`/"Avg readiness" string in app/components/lib except an explanatory comment |
| 18 | Dashboard shows "Closest to ready" (nearest OWNED not-yet-ready project + gates left + link) | ✓ VERIFIED | `app/(artist)/dashboard/page.tsx` lines 130-146, 236-254; derived strictly from owner-scoped `projects` query |
| 19 | Dashboard "Your next moves" feed — inclusion rule "is this waiting on you?" across owned + shared-reachable sheets | ✓ VERIFIED (code+unit level) | `buildNextMoves()` 12/12 unit tests pass; wired via a separate `fetchSplitSheetsForUser` query (line 114) distinct from the owner-scoped stat query |
| 20 | Money & signature items pinned above softer items, locked/non-reorderable | ✓ VERIFIED | `pinned` array always rendered before `flexible` (page.tsx lines 191-213); `PINNED_STATUSES` bucket unit-tested |

**Score:** 12/20 truths verified (8 present + wired, behavior-unverified — see above)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/078_project_members.sql` | project_members table + RLS rewrite | ✓ VERIFIED | Present, structurally tested (38 assertions), pushed live per operator |
| `supabase/migrations/079_project_membership_auto.sql` | auto-membership trigger | ✓ VERIFIED | Present, structurally tested (19 assertions), pushed live per operator |
| `lib/vault/membership.ts` | role-capability module | ✓ VERIFIED | 4-role matrix matches SPEC ②, unit-tested |
| `.planning/phases/21-cross-account-collaboration-sheet-sync/21-RLS-SMOKE-CHECKLIST.md` | manual smoke checklist | ✓ VERIFIED (artifact) / ⚠️ NOT EXECUTED | File exists with full role×operation×table matrix; **0/31 checkboxes checked** |
| `components/vault/SharedProjectBadge.tsx` | shared-card badge | ✓ VERIFIED | Present, unit-tested, wired into VaultProjectCard |
| `app/(artist)/vault/page.tsx` (shared lane) | Shared with me section | ✓ VERIFIED | Present, wired, owned query untouched |
| `lib/split-sheets/project-sync.ts` | pure mapping/merge module | ✓ VERIFIED | Present, unit-tested, wired into both PATCH routes |
| `lib/split-sheets/lifecycle.ts` (isSyncActive) | freeze-boundary predicate | ✓ VERIFIED | Present, unit-tested |
| `lib/dashboard/next-moves.ts` | buildNextMoves pinned/flexible derivation | ✓ VERIFIED | Present, unit-tested (12 tests), wired into dashboard |
| `app/(artist)/dashboard/page.tsx` | dashboard rework | ✓ VERIFIED | Avg readiness removed, Closest to ready + Your next moves added |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `project_members.user_id` | `auth.users(id)` | FK | ✓ WIRED | Matches every existing ownership FK, not `user_profiles` |
| `vault_projects`/child-table policies | `is_project_owner`/`project_member_role` | SECURITY DEFINER helper pair | ✓ WIRED (structurally) | Confirmed by migration text; live recursion-free behavior unverified |
| `split_sheet_parties.collaborator_id` | `collaborators.claimed_by` | trigger resolution | ✓ WIRED (structurally) | Confirmed by migration 079 body; live firing unverified |
| PATCH `/api/split-sheets/[id]` | linked project's `tracks.metadata.composers` | forward-sync hook | ✓ WIRED | `mapPartiesToComposers`/`mergeComposers` called after party reinsert, gated on `isSyncActive` |
| PATCH `/api/vault/[projectId]/tracks/[trackId]` | linked living-draft sheet's `split_sheet_parties` | reverse-sync hook | ✓ WIRED | `mapComposersToParties` called after composer write, gated on initiator-only + `isSyncActive` |
| `project_members WHERE user_id = me` | `vault_projects` (+children) | shared-with-me query | ✓ WIRED | RLS from 078 governs visibility; query present in vault/page.tsx |
| `fetchSplitSheetsForUser` | `buildNextMoves()` | dashboard feed | ✓ WIRED | Separate query from owner-scoped stat query, feeds pure derivation |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| Vault page shared lane | `sharedCards` | `project_members` + `vault_projects` join query | Real Supabase query (not static) | ✓ FLOWING |
| Dashboard "Your next moves" | `nextMoves` | `fetchSplitSheetsForUser(supabase, viewerUserId)` | Real Supabase query | ✓ FLOWING |
| Dashboard "Closest to ready" | `closestToReady` | Existing owner-scoped `vault_projects` query | Real Supabase query | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Targeted phase test files pass | `npx jest lib/vault/membership.test.ts __tests__/migration-078.test.ts __tests__/migration-079.test.ts lib/split-sheets/project-sync.test.ts lib/dashboard/next-moves.test.ts components/vault/SharedProjectBadge.test.tsx` | 6 suites / 93 tests passed | ✓ PASS |
| Full repo suite (run once) | `npm test` | 96 suites / 1204 tests passed | ✓ PASS |
| Type-check | `npx tsc --noEmit` | Clean, no output | ✓ PASS |
| "Avg readiness" fully removed | `grep -rn "Avg readiness\|avgScore" app/ components/ lib/` | Only 1 explanatory code comment referencing the removed stat by name; no live string/computation | ✓ PASS |
| RLS smoke checklist completion | `grep -c "\[ \]" / "\[x\]" 21-RLS-SMOKE-CHECKLIST.md` | 31 unchecked, 0 checked | ✗ NOT RUN (see human_verification) |

### Requirements Coverage

This phase uses decision IDs, not numbered REQs (`.planning/REQUIREMENTS.md` has no Phase 21 entries by
design — confirmed by grep). Coverage is via each PLAN's `requirements:` frontmatter field.

| Decision ID | Source Plan(s) | Description | Status | Evidence |
|-------------|-----------------|--------------|--------|----------|
| ①-access-model | 21-01, 21-04 | Shared visibility, owner-controlled editing; no cross-account split path | ⚠️ Code shipped, live RLS unverified | Migrations 078/079 authored + tested; forward/reverse sync single-account guard confirmed in code |
| ②-membership | 21-01, 21-02 | project_members table, 4 roles, auto-membership | ⚠️ Code shipped, live RLS/trigger unverified | Same as above |
| ③-mine-vs-shared | 21-03, 21-05 | Shared lane + scoreboard exclusion | ✓ SATISFIED (code+unit level); live cross-account render unverified | Vault page + dashboard stat derivation confirmed correct and isolated |
| ④-dashboard | 21-05 | Remove Avg readiness, add Closest to ready + Your next moves | ✓ SATISFIED | Dashboard rework confirmed by grep + code read + unit tests |
| identity-dedupe-claim | 21-02 | Claim (verified) distinct from roster dedupe (typed, per-owner) | ✓ SATISFIED (code level) | Migration 079 keys only off `claimed_by`; `lib/collaborators/index.ts` untouched |
| sheet-project-sync | 21-04 | Bidirectional sync while draft, snaps on send-for-signature | ✓ SATISFIED (code+unit level); live end-to-end write unverified | `project-sync.ts` fully unit-tested; both PATCH hooks wired |

No orphaned decision IDs — all six are claimed by exactly one or more plans and all have shipped code.

### Anti-Patterns Found

None. Scanned all files touched by this phase (`lib/vault/membership.ts`, `lib/dashboard/next-moves.ts`,
`lib/split-sheets/project-sync.ts`, `lib/split-sheets/lifecycle.ts`, `components/vault/SharedProjectBadge.tsx`,
`components/vault/VaultProjectCard.tsx`, `app/(artist)/vault/page.tsx`, `app/(artist)/dashboard/page.tsx`,
both PATCH routes, migrations 078/079) for `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`/stub patterns.
The only "placeholder"/"not available" matches found are a legitimate HTML input placeholder attribute
and a legitimate demo-mode guard message — neither is a debt marker or a stub.

### Documented Deliberate Deferrals (not gaps)

Per the task brief and 21-01's Planner Decisions (explicit, not silent):

1. **Editor/co-owner API-route ownership-check audit is deferred.** RLS permits co-owner/editor writes
   at the database layer (migration 078), but `app/api/vault/**`'s `.eq('user_id', user.id)` route-level
   ownership checks have not been rewritten to honor project-membership. Editor/co-owner functional
   editing is not reachable end-to-end through the app yet — tracked as a separate, later task per
   21-01-SUMMARY.md's "Next Phase Readiness."
2. **Guest-list management API deferred.** No `app/api/vault/[projectId]/members/route.ts` exists; the
   only v1 membership-write paths are migration 078's owner backfill and migration 079's auto-membership
   trigger, both SECURITY DEFINER. This is consistent with CONTEXT.md's "rich co-owner/editor promotion
   UX deferred."

### Human Verification Required

1. **Full RLS access-matrix smoke** — run `.planning/phases/21-cross-account-collaboration-sheet-sync/21-RLS-SMOKE-CHECKLIST.md` against two-plus real accounts on the live database.
   - Expected: every cell (owner/co-owner/editor/viewer/non-member × SELECT/UPDATE/DELETE × vault_projects + 4 child tables) matches the expected access pattern.
   - Why human: no live-RLS harness in this repo; checklist currently 0/31 checked despite 21-01-SUMMARY.md's "approved"/"passed" claim, which this verification does not accept as evidence (a service-role query, per the task brief, bypasses RLS and does not validate the policies).

2. **Auto-membership three-ordering + draft-gate + idempotency smoke** (21-02-PLAN.md Task 3 how-to-verify steps 3-4) — against two real accounts.
   - Expected: viewer row appears from claim-then-party and party-then-claim orderings once the sheet is non-draft; no row while draft; no duplicate row on re-fire.
   - Why human: 21-02-SUMMARY.md explicitly records this as "OUTSTANDING... NOT YET SMOKED."

3. **Shared-with-me lane live visual check** — second real account with a viewer `project_members` row, load `/vault`.
   - Expected: shared card renders with correct badge text and no edit CTA; owned grid/counts unaffected.
   - Why human: 21-03-SUMMARY.md D2 flags no seeded shared-membership fixture exists to exercise this live.

4. **Sheet↔project sync live end-to-end check** — as the sheet initiator, edit a linked living-draft sheet's writers, confirm project composers update; edit project composers, confirm sheet parties update; send for signature, confirm sync stops.
   - Expected: bidirectional sync observed live while draft; stops on freeze.
   - Why human: 21-04-SUMMARY.md D3/D4 — no live-DB/session route-test harness exists in this repo.

5. **Dashboard "Your next moves" cross-account live visual check** — second real account with a pending cross-account split-sheet action.
   - Expected: cross-account item appears, pinned tier renders above flexible with amber styling.
   - Why human: 21-05-SUMMARY.md D3 flags this as unexercised in the autonomous execution.

### Gaps Summary

No FAILED truths, no MISSING/STUB artifacts, no NOT_WIRED key links, and no blocker anti-patterns were
found — every artifact this phase claims exists, is substantive, and is wired to its call site, and the
full test suite (1204 tests) plus `tsc --noEmit` are clean. The phase is NOT blocked by code-quality or
completeness gaps.

What blocks a clean `passed` verdict is exclusively the **unexecuted behavioral proof of the
security-critical live RLS/auto-membership surface** this phase itself identified as needing a manual
smoke pass, plus four smaller live cross-account/session checks the individual plan SUMMARYs already
flagged honestly as outstanding. 21-01-SUMMARY.md's narrative that the RLS smoke "passed" and was
"approved" is contradicted by the checklist file's own unchecked state and is not treated as evidence
here — this is exactly the class of claim goal-backward verification exists to catch.

---

*Verified: 2026-08-02T06:13:44Z*
*Verifier: Claude (gsd-verifier)*
