---
phase: 36-account-identity-mandatory-handle-for-user-accounts-artist-d
plan: 05
subsystem: api
tags: [nextjs, supabase, rpc, handles, redirect, app-router]

# Dependency graph
requires:
  - phase: 36-account-identity-mandatory-handle-for-user-accounts-artist-d
    provides: "migration 133's resolve_profile_by_handle(TEXT) RPC (plan 02) — case-insensitive lookup + retired-handle fallback, granted to anon"
provides:
  - "lib/handles/resolve.ts — resolveHandle(client, raw), a pure resolver wrapping the RPC with an injected structural client type"
  - "app/u/[handle]/page.tsx — the public profile route resolves case-insensitively and permanently redirects retired handles instead of 404ing"
affects: [36-06, 36-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Injected structural client type (HandleResolverClient with just an rpc method typed PromiseLike, not the full SupabaseClient) so a pure resolver function is testable with a plain jest-mocked object literal — no jsdom, no Supabase test harness"

key-files:
  created:
    - lib/handles/resolve.ts
    - lib/handles/resolve.test.ts
  modified:
    - app/u/[handle]/page.tsx

key-decisions:
  - "HandleResolverClient.rpc is typed to return PromiseLike<...>, not Promise<...> — supabase-js's PostgrestFilterBuilder is a thenable (implements `then`) but not a native Promise (no catch/finally/Symbol.toStringTag), so the stricter Promise signature failed tsc against the real client while a hand-rolled test double satisfied it. PromiseLike is the correct structural bound for both."
  - "The redirect branch runs BEFORE the profile SELECT, the is_public gate, getUser(), and the bidirectional block check — a retired handle exposes only the current handle string via the 301 Location header, never any profile row. This preserves the plan's non-disturbance requirement for the privacy/block ordering on the current-handle path, since that whole block is untouched."

patterns-established:
  - "Public read paths that need a lower(col)=lower($1) comparison PostgREST cannot express go through a SECURITY DEFINER RPC, never a pattern-match filter — noted here because an underscore is both a legal handle character (D-05) and a LIKE wildcard."

requirements-completed: [D-04, D-07]

coverage:
  - id: D1
    description: "A mixed-case URL segment for a live handle resolves to the same profile as its stored-case spelling (D-04)"
    requirement: "D-04"
    verification:
      - kind: unit
        ref: "lib/handles/resolve.test.ts#resolves a live handle in different casing to kind: current, with the STORED casing (not the URL casing)"
        status: pass
    human_judgment: false
  - id: D2
    description: "A retired handle permanently redirects (301) to its owner's current handle instead of 404ing (D-07)"
    requirement: "D-07"
    verification:
      - kind: unit
        ref: "lib/handles/resolve.test.ts#resolves a retired handle to kind: redirect, carrying the owner's CURRENT handle"
        status: pass
      - kind: manual_procedural
        ref: "Code review of app/u/[handle]/page.tsx — permanentRedirect() called outside try/catch, query string preserved, called before any profile/privacy read"
        status: pass
    human_judgment: true
    rationale: "The 301 status and live redirect behavior against a real handle_history row require the pushed migration 133 and a retired handle in the database — not exercisable by a unit test in this repo (no jsdom, no live Supabase in CI)."
  - id: D3
    description: "A handle matching neither a live nor retired profile still 404s, identically to today"
    requirement: "D-04"
    verification:
      - kind: unit
        ref: "lib/handles/resolve.test.ts#resolves an unmatched handle to kind: none"
        status: pass
    human_judgment: false
  - id: D4
    description: "Empty, whitespace-only, and >64-char segments short-circuit to kind: none without ever calling the RPC"
    verification:
      - kind: unit
        ref: "lib/handles/resolve.test.ts#returns kind: none for an empty segment and never calls the RPC"
        status: pass
      - kind: unit
        ref: "lib/handles/resolve.test.ts#returns kind: none for a whitespace-only segment and never calls the RPC"
        status: pass
      - kind: unit
        ref: "lib/handles/resolve.test.ts#returns kind: none for a segment longer than 64 characters and never calls the RPC"
        status: pass
    human_judgment: false
  - id: D5
    description: "The exact-case .eq('handle', handle) filter is gone from the page; the explicit public column projection and the privacy/block-check ordering are unchanged"
    verification:
      - kind: unit
        ref: "grep -c \"eq('handle'\" app/u/[handle]/page.tsx -> 0"
        status: pass
      - kind: unit
        ref: "npx tsc --noEmit -> 0 errors"
        status: pass
      - kind: unit
        ref: "npx jest (full suite) -> 3100 passed, 285 suites"
        status: pass
    human_judgment: false

# Metrics
duration: ~7min
completed: 2026-08-30
status: complete
---

# Phase 36 Plan 05: Case-Insensitive Handle Resolution + Old-URL Redirects Summary

Fixed a pre-existing defect where `/u/MayaReyes` 404'd despite `maya-reyes` existing (D-04), and gave
retired handles a permanent redirect to their owner's current handle (D-07) — both through one call
to migration 133's `resolve_profile_by_handle()` RPC.

## Performance

- **Duration:** ~7 min (00d2f4b to d94f318)
- **Started:** 2026-08-30T01:45:38-04:00
- **Completed:** 2026-08-30T01:51:38-04:00
- **Tasks:** 2/2
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments
- `lib/handles/resolve.ts` — pure `resolveHandle(client, raw)` wrapping the RPC, returning a
  `{ kind: 'none' | 'current' | 'redirect' }` discriminated union; short-circuits empty/oversized
  segments before spending a round trip.
- `app/u/[handle]/page.tsx` — the exact-case `.eq('handle', handle)` filter is gone. The route now
  resolves through `resolveHandle()`, 404s on no match, `permanentRedirect()`s a retired handle
  (preserving the query string), and otherwise runs the unchanged profile SELECT keyed on the
  resolved `profileId` instead of the raw URL segment.

## Task Commits

Each task was committed atomically:

1. **Task 1: lib/handles/resolve.ts — one resolver for live and retired handles** - `00d2f4b` (feat) — plus a follow-up correction `c623ecc` (fix), see Deviations.
2. **Task 2: Wire the resolver into the public profile route** - `d94f318` (feat)

_Note: `c623ecc` is not a plan task — it corrects a cross-agent index collision, see Deviations below._

## Files Created/Modified
- `lib/handles/resolve.ts` - `resolveHandle()` + `HandleResolution` union + injected `HandleResolverClient` structural type
- `lib/handles/resolve.test.ts` - 10 jest assertions covering every behavior line in the plan
- `app/u/[handle]/page.tsx` - resolver wiring, `permanentRedirect()` for retired handles, profile SELECT keyed on `profileId`

## Decisions Made
- `HandleResolverClient.rpc` returns `PromiseLike<...>`, not `Promise<...>` — see key-decisions in frontmatter. Caught by `npx tsc --noEmit` against the real `SupabaseClient`, not by the hand-rolled test double (which satisfied either signature).
- Query-string preservation on the redirect target is built from the page's own `searchParams` prop (added to the function signature) rather than parsing anything off `handle`, since App Router pages receive query params as a separate prop, not as part of `params`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Cross-agent git index collision — a concurrent Wave 2 agent's file landed in this plan's Task 1 commit**
- **Found during:** Task 1, immediately after committing
- **Issue:** This project's Wave 2 plans (36-03, 36-04, 36-05) all executed against the SAME working directory / git index (not isolated worktrees). Between `git add lib/handles/resolve.ts lib/handles/resolve.test.ts` and `git commit` (with no pathspec), the 36-04 agent's already-staged `lib/handles/availability.ts` was swept into my commit (`00d2f4b`) alongside my own two files. A prior even-earlier version of this race had also briefly pulled my files into a 36-03 commit before that commit was amended by its own author.
- **Fix:** `git rm --cached lib/handles/availability.ts` followed by a new commit (`c623ecc`, not amend) that untracks the file without touching its content on disk — the 36-04 agent's file is back to `??` untracked, exactly as if my commit had never touched it, and its content was never lost or altered. For Task 2's commit I switched to `git commit -m ... -- <exact paths>`, restricting the commit to specified pathspecs regardless of what else is staged in the shared index, which avoided a repeat.
- **Files modified:** `lib/handles/availability.ts` (untracked, not edited)
- **Verification:** `git show --stat c623ecc` shows only that one file, as a pure deletion from the index; `ls -la lib/handles/availability.ts` confirms the file is still present on disk afterward, byte-identical.
- **Committed in:** `c623ecc`

**2. [Rule 3 - Blocking] Automated verify check `grep -c 'resolveHandle' ... | grep -qx 1` is unsatisfiable together with the plan's own `<action>` instructions**
- **Found during:** Task 2 verification
- **Issue:** The plan's Task 2 verify step asserts the literal string `resolveHandle` appears on exactly 1 line of `app/u/[handle]/page.tsx`. Following the plan's own action text — `import { resolveHandle } from '@/lib/handles/resolve'` plus one call site `const resolution = await resolveHandle(supabase, handle)` — necessarily produces 2 matching lines (the import and the call). There is no way to import and call a named export without the identifier appearing at least twice in a TypeScript file.
- **Fix:** None applied to the code — the underlying behavioral requirement ("the resolver is called once") is satisfied and verified: `grep -n 'resolveHandle' "app/u/[handle]/page.tsx"` shows exactly one call site (line 156) plus the necessary import (line 3). Treating this as a plan-authoring imprecision in the automated check rather than a defect in the implementation.
- **Files modified:** none
- **Verification:** `grep -n 'resolveHandle' "app/u/[handle]/page.tsx"` → 2 lines total, 1 of which is the import and 1 the single call. `grep -c "eq('handle'" "app/u/[handle]/page.tsx"` → 0 (this check passes as specified).
- **Committed in:** n/a (no code change)

---

**Total deviations:** 2 auto-fixed (2 blocking — one a shared-index race between concurrent agents, one an unsatisfiable automated check in the plan itself)
**Impact on plan:** No scope creep, no data loss, no architectural change. The git-index collision was caught and corrected within the same task before Task 2 began. The grep-count discrepancy is documented for the record; the actual behavior it was meant to verify (single resolver call) holds.

## Issues Encountered
- This repo's Wave 2 plans (36-03/36-04/36-05) ran concurrently in the same working directory rather than isolated git worktrees, which produced the index race described above. Worth flagging to the orchestrator for future waves: either isolate Wave 2 plans in per-agent worktrees, or accept that `git commit -- <pathspec>` (never a bare `git commit` after `git add`) is mandatory discipline whenever multiple agents share one working directory and index.

## User Setup Required
None - no external service configuration required. Migration 133 (the RPC this plan depends on) was already pushed to production per plan 02's blocking checkpoint.

## Next Phase Readiness
- `resolveHandle()` and the redirect wiring are in place and fully covered by unit tests; the full jest suite (3100 tests, 285 suites) and `tsc --noEmit` are both green at HEAD.
- D-07's redirect behavior against a real retired handle in production data was not independently verified in this session (no live handle_history row was exercised) — flagged as `human_judgment: true` in the coverage block (D2) for the verifier.
- No blockers for 36-06/36-07.

---
*Phase: 36-account-identity-mandatory-handle-for-user-accounts-artist-d*
*Completed: 2026-08-30*

## Self-Check: PASSED

- FOUND: lib/handles/resolve.ts
- FOUND: lib/handles/resolve.test.ts
- FOUND: app/u/[handle]/page.tsx
- FOUND commit: 00d2f4b
- FOUND commit: c623ecc
- FOUND commit: d94f318
