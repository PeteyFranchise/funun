---
phase: 38-member-organization-team-workspaces
plan: 09
subsystem: auth
tags: [typescript, nextjs, api-routes, zod, supabase, workspaces, grants, permissions, audit]

# Dependency graph
requires:
  - phase: 38-member-organization-team-workspaces
    provides: "38-01's lib/workspaces/grants.ts (isSubsetGrant, filterGrantableByAuthority, assertGrantIsIssuable) and lib/workspaces/permissions.ts (WorkspacePermission catalogue, tiers, bundle exclusion, structural exclusion); 38-02's lib/workspaces/roster.ts (isWorkspaceAccessLive) and lib/workspaces/evidence.ts (resolveAuthorityTier, compute-on-read); 38-05's requireWorkspaceAccess/requireWorkspaceRole gate and logWorkspaceAction audit write-through; 38-07's lib/workspaces/roster-service.ts (loadRelationshipTier — the mandatory tier-resolution call site); 38-08's authored (not-yet-live) migration 184 schema contract for workspace_grants / workspace_permission_bundles"
provides:
  - "lib/workspaces/grant-service.ts -- resolveEffectivePermissions (the single use-time authority every later surface must call instead of reading workspace_grants directly), assertMayExercise, assertGrantIssuable, SENSITIVE_USE_LOG_REQUIRED, mustLogUse"
  - "lib/workspaces/acting.ts -- formatActingAttribution, buildActingContext, ActingContext -- attribution-only acting-on-behalf, no impersonation primitive"
  - "app/api/workspaces/[workspaceId]/grants/route.ts -- POST issue (subset+tier checked at issue time, bundle expansion from DB, sensitive permissions individual-only), GET list (RLS-scoped, grouped by relationship/project), DELETE revoke (sets revoked_at, never deletes)"
affects: [38-11, 38-12, 38-13, "Phase 38.1 UX"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Use-time authority with zero caching: resolveEffectivePermissions performs a full re-derivation (active membership -> live relationship -> compute-on-read tier -> unrevoked grants -> tier-filtered result) on every call, proven by two dedicated tests that mutate stubbed state between two sequential calls and assert the second result differs"
    - "assertGrantIssuable reuses resolveEffectivePermissions for the granter's own effective set rather than a second read path, so the grant-time and use-time checks can never drift apart — both ultimately bottom out in the same isSubsetGrant/assertGrantIsIssuable implementation from 38-01"
    - "Bundle expansion always reads workspace_permission_bundles from the database (workspace-specific row takes precedence over the system preset of the same key); a client-supplied permissions array is never accepted as a bundle's expansion, and a bundle-excluded permission surfacing in the expansion refuses the whole request with 400 rather than silently dropping it"
    - "Idempotent grant re-issuance via the partial unique index: insert first, and a 23505 unique-violation is treated as an already-granted no-op rather than an error, matching the house error.code convention used across app/api/admin/*, app/api/connections/route.ts, etc."

key-files:
  created:
    - lib/workspaces/grant-service.ts
    - lib/workspaces/grant-service.test.ts
    - lib/workspaces/acting.ts
    - lib/workspaces/acting.test.ts
    - app/api/workspaces/[workspaceId]/grants/route.ts
  modified: []

key-decisions:
  - "resolveEffectivePermissions's actorUserId gate is meaningful even though workspace_grants rows are not actor-scoped: it forces the specific caller (whether checking their own exercise rights or acting as a granter) to hold a currently-active workspace_members row, which is what makes 'the granter's own effective set' in assertGrantIssuable re-derive per-caller rather than per-workspace"
  - "assertGrantIssuable loads the relationship row by relationshipId directly (rather than re-deriving it from workspaceId+subjectMemberId a second time) purely to resolve the tier via loadRelationshipTier — the granter's PERMISSION set still comes from a full resolveEffectivePermissions call, so the tier lookup and the permission lookup never disagree about which relationship they describe"
  - "The grants route's POST loop inserts and logs per-permission (not in a single batched insert) so a partial success — some permissions already granted, one is new — is handled uniformly via the 23505 idempotency path, and so a future reviewer can see the exact 1:1 relationship between issued permissions and audit rows the plan's D-50 requirement describes"
  - "SENSITIVE_USE_LOG_REQUIRED is a small local Set duplicating the three D-40 permission names rather than importing permissions.ts's private BUNDLE_EXCLUDED_PERMISSIONS constant (which is not exported) — this is a distinct concept (log-on-every-use, a use-time obligation grant-service.ts owns) from bundle-exclusion (permissions.ts owns), even though the three names happen to coincide by design"

patterns-established:
  - "resolveEffectivePermissions is now the mandatory single use-time authority — no future plan (workspace catalogue, Appears-on shelf, Phase 38.1 UX) may read workspace_grants directly; a code review finding a direct read is a defect per this plan's key_links"

requirements-completed: [WS-08, WS-24, WS-30]

coverage:
  - id: D1
    description: "resolveEffectivePermissions re-derives active membership, live roster relationship, compute-on-read authority tier, and unrevoked grant rows on every call, returning an empty set at the first failing step and never caching across calls"
    requirement: "WS-08"
    verification:
      - kind: unit
        ref: "lib/workspaces/grant-service.test.ts#resolveEffectivePermissions"
        status: pass
    human_judgment: false
  - id: D2
    description: "A grant exceeding the granter's own resolved access is refused by assertGrantIssuable with a reason naming the offending permission, and a grant's continued validity is proven to be re-derived (not cached) across two sequential calls with changed stubbed state — both D-49 clauses covered by dedicated named tests"
    requirement: "WS-08"
    verification:
      - kind: unit
        ref: "lib/workspaces/grant-service.test.ts#assertGrantIssuable"
        status: pass
    human_judgment: false
  - id: D3
    description: "assertMayExercise refuses an unknown or structurally excluded permission name before any query, and otherwise succeeds or fails based on the re-derived effective set"
    requirement: "WS-08"
    verification:
      - kind: unit
        ref: "lib/workspaces/grant-service.test.ts#assertMayExercise"
        status: pass
    human_judgment: false
  - id: D4
    description: "Acting-on-behalf is attribution-only: formatActingAttribution renders actor+workspace+optional on-behalf clause (omitted when subject is null), and buildActingContext refuses when actorUserId equals subjectMemberId with a non-null permissionReliedOn; no session-substitution primitive exists anywhere in the module (comment-stripped grep confirms zero executable matches)"
    requirement: "WS-30"
    verification:
      - kind: unit
        ref: "lib/workspaces/acting.test.ts"
        status: pass
      - kind: manual_procedural
        ref: "grep -v '^\\s*//' lib/workspaces/acting.ts | grep -ci 'impersonat\\|view.as\\|login.as\\|actAs\\|sessionStorage\\|setSession' -> 0"
        status: pass
    human_judgment: false
  - id: D5
    description: "The grants route issues only a subset of what the granter holds (assertGrantIssuable called before any insert, refusal reason returned verbatim to the client), expands bundles from the database only, refuses a bundle-excluded permission arriving via bundleKey with 400, never deletes a workspace_grants row on revoke, and logs each issued/revoked permission individually"
    requirement: "WS-24"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit; npx next lint on the route file"
        status: pass
      - kind: manual_procedural
        ref: "Grep-based structural assertions: .delete() count 0, logWorkspaceAction 2 real call sites (POST loop, DELETE loop); bundle-expansion branch reads workspace_permission_bundles and rejects a request supplying both permissions and bundleKey via the Zod .refine"
        status: pass
    human_judgment: false

# Metrics
duration: 42min
completed: 2026-09-05
status: complete
---

# Phase 38 Plan 09: Grant Issuance, Use-Time Re-Check, Attributed Acting-on-Behalf Summary

**A single uncached `resolveEffectivePermissions` resolver re-derives membership, roster liveness, and authority tier on every call so a grant stops working the moment the granter's access is reduced (D-49's harder clause), plus an attribution-only `acting.ts` helper and a grants API route that refuses (never trims) an over-broad issuance request.**

## Performance

- **Duration:** ~42 min
- **Tasks:** 3
- **Files modified:** 5 (all new)

## Accomplishments
- `lib/workspaces/grant-service.ts` — `resolveEffectivePermissions` (the one use-time authority: active membership → live roster relationship → compute-on-read authority tier → unrevoked, project-scoped grant rows → tier-filtered result, re-derived fresh on every call with a header comment stating why nothing may ever be cached here), `assertMayExercise` (fails closed before any query for an unknown or structurally excluded permission name), `assertGrantIssuable` (resolves the granter's own effective set plus the relationship tier, then delegates entirely to plan 38-01's `assertGrantIsIssuable`), `SENSITIVE_USE_LOG_REQUIRED` / `mustLogUse` — 19 unit tests against a stubbed Supabase client whose handler functions are mutated mid-test to prove re-derivation, zero live-DB dependency, zero storage/signed-URL import
- `lib/workspaces/acting.ts` — `formatActingAttribution` (actor + workspace + optional "on behalf of" subject clause, omitted for workspace-administrative actions), `buildActingContext` (maps one-to-one onto `logWorkspaceAction`'s arguments; refuses when the actor and subject collapse to the same identity under a non-null `permissionReliedOn`), a header comment naming every impersonation-shaped mechanism this module deliberately does not contain — 6 unit tests, comment-stripped grep confirms zero executable matches for any forbidden term, zero Supabase import (pure, zero-I/O)
- `app/api/workspaces/[workspaceId]/grants/route.ts` — `POST` issues grants (Zod enforces exactly one of `permissions`/`bundleKey`; bundle expansion always reads `workspace_permission_bundles` from the database, workspace-specific row preferred over system preset; a bundle-excluded permission surfacing via `bundleKey` is refused with 400; `assertGrantIssuable` runs before any insert and its refusal reaches the client verbatim; insertion relies on the partial unique index for idempotency; one `logWorkspaceAction` call per issued permission using `buildActingContext`), `GET` lists unrevoked grants through the RLS-scoped session client grouped by relationship/project, `DELETE` revokes by setting `revoked_at`/`revoked_by` (never a `.delete()` call) with one `logWorkspaceAction` call per revoked permission

## Task Commits

Each task was committed atomically:

1. **Task 1: Use-time permission resolver and issuance guard** - `7146831a` (feat, TDD)
2. **Task 2: Attributed acting-on-behalf helper** - `d26476d9` (feat, TDD)
3. **Task 3: Grants API route with subset check at issue time** - `1fd3cfec` (feat)

**Plan metadata:** committed with this SUMMARY (worktree mode — orchestrator finalizes STATE.md/ROADMAP.md after merge)

## Files Created/Modified
- `lib/workspaces/grant-service.ts` — the single use-time authority plus the grant-time issuance gate
- `lib/workspaces/grant-service.test.ts` — 19 tests, including D-49-named and D-39-named cases and two dedicated no-caching proofs (one on `resolveEffectivePermissions`, one on `assertGrantIssuable`)
- `lib/workspaces/acting.ts` — attribution-only acting-on-behalf, zero I/O
- `lib/workspaces/acting.test.ts` — 6 tests covering every behavior bullet
- `app/api/workspaces/[workspaceId]/grants/route.ts` — `POST`/`GET`/`DELETE` handlers

## Decisions Made
See `key-decisions` in the frontmatter above for the full list, most notably:
- The granter's "own effective set" in `assertGrantIssuable` is computed via the same `resolveEffectivePermissions` call used for use-time re-checks (never a second implementation), which is what structurally prevents the grant-time and use-time halves of D-49 from ever drifting apart
- `SENSITIVE_USE_LOG_REQUIRED` intentionally re-lists the three D-40 permission names locally rather than importing a private constant from `permissions.ts` — a distinct axis (log-on-use vs. bundle-exclusion) that happens to share the same three names by design

## Deviations from Plan

### Acceptance-criteria sanity note (no code change made)

**Task 3's literal acceptance criterion `grep -c "assertGrantIssuable" ... returns 1` is unsatisfiable by idiomatic code.**
- **Issue:** The route necessarily contains the identifier `assertGrantIssuable` three times: the `import` statement, one explanatory mention in the file's header comment (documenting that this route is the grant-time half of D-49), and the single actual call site immediately before any insert. Removing the import line or aliasing it, or stripping the header-comment mention, would either break the code or remove exactly the loud cross-reference comment Task 3's own action text explicitly requires ("Add a comment ... recording that this route is the grant-time half of D-49 ... and a future reviewer removing one has removed the guarantee").
- **Resolution:** Per the acceptance-criteria sanity rule, left the code idiomatic (import + documenting comment + one call site, called before any insert) rather than contorting it to hit a literal count of 1. The functional intent of the criterion — "`assertGrantIssuable` is called before any insert, exactly once per request" — is true and verified by reading the code; only the literal grep count is unsatisfiable.
- **Files affected:** `app/api/workspaces/[workspaceId]/grants/route.ts` (no change made in response to this — flagging only).

### None beyond the above
Every other `<behavior>`/`<action>` instruction across all three tasks was implemented as written and is covered by a passing unit test or a verified acceptance-criteria grep.

## Issues Encountered

None beyond the acceptance-criteria sanity note above. `npx tsc --noEmit`, `npx jest lib/workspaces` (11 suites, 174 tests, including this plan's 25 new tests), and `npx next lint` on the route file were clean on first pass.

## Known Stubs

None. `resolveEffectivePermissions`, `assertMayExercise`, `assertGrantIssuable`, `formatActingAttribution`, `buildActingContext`, and every route handler are fully wired against migration 184's authored schema (not yet live — see below) with no placeholder data paths and no hardcoded empty return standing in for a real query.

## Threat Flags

None beyond this plan's own `<threat_model>` (T-38-09-01 through T-38-09-08), all mitigated:
- T-38-09-01 (grant exceeding the granter's own access) — mitigated: `assertGrantIssuable` runs before any insert; refusal returned, never trimmed.
- T-38-09-02 (grant outliving reduced access/relationship) — mitigated: `resolveEffectivePermissions` re-derives on every call; two dedicated tests prove no caching.
- T-38-09-03 (resolver becoming a path-signing accessor) — mitigated: zero storage/signed-URL import (`grep -c "from '@/lib/storage\|createSignedUrl\|signedUrl" lib/workspaces/grant-service.ts` = 0); the resolver returns permission names only.
- T-38-09-04 (sensitive permission smuggled via bundle) — mitigated: bundle expansion reads the DB row only; a bundle-excluded permission in the expansion is a 400; explicit-array rows are `source: 'individual'`.
- T-38-09-05 (authority-tier permission surviving document expiry) — mitigated: `filterGrantableByAuthority` applied inside the resolver using the compute-on-read tier from `loadRelationshipTier`/`resolveAuthorityTier`.
- T-38-09-06 (acting-on-behalf degenerating into impersonation) — mitigated: `lib/workspaces/acting.ts` is attribution-only; comment-stripped grep confirms zero executable matches for any session-substitution term.
- T-38-09-07 (sensitive permission exercised with no log entry) — mitigated: `mustLogUse`/`SENSITIVE_USE_LOG_REQUIRED` name the three permissions; the issuance route logs per permission with `permissionReliedOn` populated. (Use-time logging at the point of exercise is the responsibility of the plans that consume `assertMayExercise` — 38-12/38-13 — not this plan's own scope.)
- T-38-09-08 (npm/pip/cargo installs) — accepted, no new package.

## User Setup Required

None — no external service configuration required. This plan writes application code only; it performs no database migration of its own.

**IMPORTANT — schema is not yet live:** Every function and route in this plan targets `workspace_grants`, `workspace_permission_bundles` (migration 184) and `workspace_roster_relationships`/`workspace_agreement_evidence` (migration 183). Per this plan's `CRITICAL_SCHEMA_STATE` briefing, migrations 183–185 are authored and text-tested but batched into a single owner push before Wave 6. `app/api/workspaces/[workspaceId]/grants/route.ts` will 500 against a live database until that push happens — expected, matching every other Wave 5 plan's posture toward the same unshipped migrations. All tests in this plan are unit-level against a stubbed Supabase client with zero live-DB dependency, per this plan's explicit instruction.

## Next Phase Readiness

- `resolveEffectivePermissions` is now the mandatory single use-time authority (`key_links`): the workspace catalogue (38-12), the Appears-on shelf (38-13), and Phase 38.1's UX must all call it rather than reading `workspace_grants` directly — a code review finding a direct read anywhere downstream is a defect.
- `buildActingContext`/`formatActingAttribution` are ready for any route that performs a delegated action; both are pure and zero-I/O, callable from any server context without new plumbing.
- This plan touched only the five files declared in its frontmatter (`lib/workspaces/grant-service.ts`, `grant-service.test.ts`, `lib/workspaces/acting.ts`, `acting.test.ts`, `app/api/workspaces/[workspaceId]/grants/route.ts`), verified via `git diff --stat` against the plan's base commit (`230783f5`).
- One acceptance-criteria sanity note flagged above (Task 3's `assertGrantIssuable` grep count) — no functional issue, documented for the orchestrator/reviewer.
- STATE.md, ROADMAP.md, and REQUIREMENTS.md are deliberately untouched by this plan per its explicit worktree-mode instructions — the orchestrator owns those writes after merge.

## Self-Check: PASSED

All five created files (`lib/workspaces/grant-service.ts`, `grant-service.test.ts`, `lib/workspaces/acting.ts`, `acting.test.ts`, `app/api/workspaces/[workspaceId]/grants/route.ts`) verified present on disk. All three task commit hashes (`7146831a`, `d26476d9`, `1fd3cfec`) verified present in `git log`.

---
*Phase: 38-member-organization-team-workspaces*
*Completed: 2026-09-05*
