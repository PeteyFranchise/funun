---
phase: 37-the-catalogue-unreleased-works-as-living-assets-versions-rig
plan: 05
subsystem: api
tags: [typescript, nextjs, supabase, zod, split-sheets, catalogue, membership]

# Dependency graph
requires:
  - phase: 37-01
    provides: "migrations 135-138 (works/work_versions/lyric_blocks/work_members/ai_entries/work_diary_events), is_work_owner/work_member_tier RPCs, split_sheets.work_id — all live in production, verified this session"
  - phase: 37-03
    provides: "lib/catalogue/splits.ts's planWriterPromotion() — the equal-split living-draft redraft this plan's writer-promotion branch calls, never reimplemented"
  - phase: 37-04
    provides: "lib/catalogue/access.ts's resolveWorkAccess()/createWorkAccessDeps() (every route's first statement) and types/catalogue.ts's row vocabulary (Work, WorkVocalState, WorkMember)"
provides:
  - "app/api/works/route.ts — POST is the 🎵 Start a song door: work + owner work_members row + living-draft split sheet in one request; GET returns owned/member works as two separate queries"
  - "app/api/works/[workId]/route.ts — GET (minimal, for client refresh) and PATCH (title + three-state vocal setting) behind resolveWorkAccess()"
  - "app/api/works/[workId]/members/route.ts — invite via the existing collaborator machinery, tier assignment, and an explicit, separate writer promotion"
  - "lib/catalogue/splits-io.ts — loadWorkSplits()/applyWorkSplits(), the single service-role split-sheet accessor for Phase 37.1"
affects: [37-11, 37-12, 37-13]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Three-write, no-transaction create with explicit rollback-on-partial-failure (POST /api/works: work insert, then service-role membership + sheet inserts; a step-2/3 failure deletes the work row rather than leaving a half-configured composition)"
    - "Namespace import (`import * as collaboratorInvite from ...`) used specifically to keep a reused function's call site as the one place its name is typed in a file — a narrow, deliberate style choice, not a new codebase-wide convention"
    - "Zod union-of-two-strict-objects for an either/or request shape (AddMemberSchema: collaborator_id XOR first_name+email, both carrying tier + is_writer) instead of one object with optional fields and a runtime branch"

key-files:
  created:
    - app/api/works/route.ts
    - app/api/works/[workId]/route.ts
    - app/api/works/[workId]/members/route.ts
    - lib/catalogue/splits-io.ts
    - lib/catalogue/splits-io.test.ts
  modified: []

key-decisions:
  - "loadWorkSplits() resolves the living draft by status IN LIVING_DRAFT_STATUSES ('draft', 'countered' — lib/split-sheets/lifecycle.ts's own vocabulary), not a bare status = 'draft' literal, so it agrees exactly with planWriterPromotion()'s own livingDraftGate() rather than duplicating a narrower rule"
  - "applyWorkSplits() special-cases an empty party set: validateApprovalTotal() treats a zero-length array as invalid by design (it guards a NONEMPTY set summing to 100%), but planWriterRemoval() redrafting the last writer off a sheet legitimately produces an empty parties[] — the empty case is written and total-checked separately so removing the final writer doesn't trip a check meant for a different failure mode"
  - "GET /api/works/[workId] and PATCH /api/works/[workId] both require only the 'contribute' tier from resolveWorkAccess() — any member, not just the owner/administer tier, may read the work and edit its title/vocal setting, matching migration 136's decision that content edits are a contribute-tier capability and only membership itself is administer-gated"
  - "PATCH /api/works/[workId]'s vocal-state branch issues one extra SELECT (current primary_performer) only when the incoming state is 'primary', to decide whether a default performer is needed — avoided fetching the whole current row up front to keep the common case (renaming only, or moving away from primary) to a single query"

requirements-completed: [S-01, S-02, S-03]

coverage:
  - id: D1
    description: "POST /api/works creates a work, the owner's own administer-tier work_members row, and a status='draft' split sheet linked by work_id, in that order, using the service role for the second and third writes; a step-2/3 failure deletes the work row rather than stranding a half-configured composition"
    requirement: S-03
    verification:
      - kind: unit
        ref: "npx tsc --noEmit (0 errors) + npm run lint --max-warnings=0 (clean) — no dedicated route-level test harness exists in this codebase (no jsdom, route tests are grep/type-level per HARD RULES), so this deliverable's behavioral proof is the grep assertions below plus the full jest suite proving no regression to lib/split-sheets/* or lib/catalogue/*"
        status: pass
      - kind: other
        ref: "grep -c 'strict()'/'work_members'/'split_sheets' app/api/works/route.ts — all nonzero"
        status: pass
    human_judgment: true
    rationale: "The three-write rollback path (work insert succeeds, then a service-role membership or sheet insert fails) has no automated test against a live database in this plan — migrations 135-138 are live in prod per this session's verified state, but this plan writes no integration test harness against them. A human should exercise this route against the real database (or Supabase Studio) at least once before shipping the 🎵 door to users."
  - id: D2
    description: "GET /api/works returns the caller's own works and works they are a member of as two separate queries, excluding the caller's own works from the member list"
    requirement: S-03
    verification:
      - kind: unit
        ref: "npx tsc --noEmit (0 errors) — the to-one/to-many join normalization (works vs works[]) is exercised only by the type checker in this plan; no route-level jest harness exists"
        status: pass
    human_judgment: true
    rationale: "No jsdom/route-test harness in this repo (HARD RULES); this deliverable is unverified against a live database in this plan."
  - id: D3
    description: "GET/PATCH /api/works/[workId] both gate through resolveWorkAccess() first and return its refusal status unchanged; PATCH accepts only title and vocal_state, rejects an empty title, keeps primary_performer consistent with vocal_state, and writes no diary row itself"
    requirement: S-01
    verification:
      - kind: unit
        ref: "npx tsc --noEmit + npm run lint — plus lib/catalogue/access.test.ts's existing 17 tests, which this route consumes via resolveWorkAccess()/createWorkAccessDeps() unchanged (not modified by this plan)"
        status: pass
      - kind: other
        ref: "grep -c 'resolveWorkAccess' / grep -cE \"'(primary|varies|instrumental)'\" app/api/works/[workId]/route.ts — both nonzero"
        status: pass
    human_judgment: true
    rationale: "The migration-138 rename-diary-trigger firing correctly on a real title UPDATE, and the primary_performer default/clear behavior against a live works row, are unverified in this plan — no database connection is available to an executor agent."
  - id: D4
    description: "POST /api/works/[workId]/members requires the administer tier, reuses sendCollaboratorInvite() unchanged (one call site), inserts work_members via the service role with user_id null for an unclaimed invitee, and touches the split sheet only behind an explicit is_writer flag via planWriterPromotion()/applyWorkSplits()"
    requirement: S-02
    verification:
      - kind: unit
        ref: "lib/catalogue/splits-io.test.ts (5 tests) — the split-sheet I/O half of this deliverable, plus npx tsc --noEmit + npm run lint"
        status: pass
      - kind: other
        ref: "grep -c 'sendCollaboratorInvite' app/api/works/[workId]/members/route.ts == 1 (exactly one call site, verbatim reuse, not reimplemented); grep -c 'planWriterPromotion' nonzero"
        status: pass
    human_judgment: true
    rationale: "The end-to-end invite→claim→work_members.user_id backfill path (migration 136's sync_work_membership_on_claim trigger) and the writer-promotion redraft against a live split_sheets/split_sheet_parties pair are unverified in this plan — no database connection is available to an executor agent, and this is the first time in the codebase one artist's session writes into another artist's song."
  - id: D5
    description: "lib/catalogue/splits-io.ts's loadWorkSplits()/applyWorkSplits() are the single split-sheet accessor for this phase, both service-role, both proven to do no access checking of their own"
    requirement: S-02
    verification:
      - kind: unit
        ref: "lib/catalogue/splits-io.test.ts — 5 tests: load selects the living-draft sheet and returns null when none; apply deletes-and-reinserts; apply refuses a non-100% total writing nothing; apply handles an emptied sheet (last-writer removal) without tripping the total check; the injected fake client has no .rpc/.auth at all, structurally proving neither function reaches for one"
        status: pass
    human_judgment: false

# Metrics
duration: ~40min
completed: 2026-08-30
status: complete
---

# Phase 37 Plan 05: The Works + Membership API Summary

**Three route files (create/read/rename/vocal-state/membership) plus `lib/catalogue/splits-io.ts`, the one service-role split-sheet accessor this phase touches — membership and splits kept strictly separate, with writer promotion the single, explicit bridge between them.**

## Performance

- **Duration:** ~40 min
- **Started:** 2026-08-30T13:37:00Z (approx.)
- **Completed:** 2026-08-30T14:17:26Z
- **Tasks:** 3/3 completed
- **Files modified:** 5 created (3 route files, 1 lib module, 1 test suite)

## Accomplishments

- `app/api/works/route.ts` — `POST` is the 🎵 Start a song door: a work insert (session client, RLS-scoped) followed by a service-role owner `work_members` row (administer tier) and a service-role `draft` split sheet linked by `work_id`, in that order. A step-2/3 failure deletes the work row rather than leaving a half-configured composition behind. `GET` returns owned and member works as two separate queries, mirroring `app/(artist)/vault/page.tsx`'s owned/shared split, and excludes the caller's own works from the member list (their own owner `work_members` row would otherwise duplicate every owned entry).
- `app/api/works/[workId]/route.ts` — `GET` (minimal — the composer page fetches server-side; this exists for client-side refreshes) and `PATCH` (title + three-state vocal setting), both gated through `resolveWorkAccess()` first, both returning its refusal status unchanged. The RENAME RULE (title is presentation, identity is the work id, the diary logs from migration 138's own trigger) and the DEFAULT-PERFORMER RULE (moving away from `primary` clears `primary_performer`; moving to `primary` defaults it to the caller only when none is set) are both implemented and commented at the exact line they apply.
- `app/api/works/[workId]/members/route.ts` — requires the administer tier via `resolveWorkAccess()`. Reuses `sendCollaboratorInvite()` from `lib/collaborators/invite.ts` verbatim (imported as a namespace so its one call site is the only line in the file naming it) rather than building a second invite flow. Inserts `work_members` through the service role with `user_id` set only for an already-claimed collaborator. Writer promotion is a separate, explicit, `is_writer`-gated branch that calls `planWriterPromotion()` (plan 03) and, only when the redraft actually changed something, `applyWorkSplits()`.
- `lib/catalogue/splits-io.ts` — `loadWorkSplits()`/`applyWorkSplits()`, both service-role, both documenting the precondition that work access is already resolved by the caller. Neither performs an access check of its own — proven structurally by a test suite that injects a fake client with no `.rpc` and no `.auth` property at all.
- All three routes pass `npx tsc --noEmit` (0 errors), `npm run lint --max-warnings=0` (clean), and the full `npx jest` suite (305 suites / 3475 tests, up from the session's verified 3458-test baseline — no regression to any existing suite).

## Task Commits

Each task was committed atomically:

1. **Task 1: `app/api/works/route.ts`** — `096c49d` (feat)
2. **Task 2: `app/api/works/[workId]/route.ts`** — `8bdcc44` (feat)
3. **Task 3: `app/api/works/[workId]/members/route.ts` + `lib/catalogue/splits-io.ts` + suite** — `053def6` (feat)

**Plan metadata:** (this commit, docs)

## Files Created/Modified

- `app/api/works/route.ts` — `POST` (the 🎵 door) and `GET` (owned/member works)
- `app/api/works/[workId]/route.ts` — `GET` (minimal) and `PATCH` (rename + vocal state)
- `app/api/works/[workId]/members/route.ts` — invite, tier assignment, writer promotion
- `lib/catalogue/splits-io.ts` — `loadWorkSplits()`, `applyWorkSplits()`
- `lib/catalogue/splits-io.test.ts` — 5 tests: load/null, delete-and-reinsert, refuse-non-100%, empty-set-on-last-writer-removal, no-access-checking-of-its-own

## Decisions Made

- **`loadWorkSplits()` resolves the living draft by `status IN LIVING_DRAFT_STATUSES`, not a bare `status = 'draft'` literal.** Migration 137's own comments describe the living draft as "the row where the work matches and status is `'draft'`," but `lib/split-sheets/lifecycle.ts`'s `LIVING_DRAFT_STATUSES` already includes `'countered'` as a second living-draft state, and `planWriterPromotion()`'s own `livingDraftGate()` (plan 03) accepts both. Reusing the existing constant rather than a narrower literal keeps this module in agreement with the promotion logic it feeds, rather than silently disagreeing with it on a `countered` sheet.
- **`applyWorkSplits()` special-cases an empty party set.** `validateApprovalTotal()` returns `false` for a zero-length array by design (it exists to validate a *nonempty* set summing to 100%). But `planWriterRemoval()` redrafting the last writer off a sheet legitimately produces `parties: []`. Without a special case, removing the final writer from a work would always fail the total check with a confusing "must total 100%" error on an operation that isn't proposing any split at all. The fix: the total check only runs when `parties.length > 0`; an empty set deletes existing rows and returns `{ ok: true }` with nothing to reinsert.
- **`GET`/`PATCH /api/works/[workId]` require only the `'contribute'` tier.** The plan's own text ("GET requiring any tier, PATCH requiring any tier") and migration 136's policy comments ("Both tiers may add versions, edit lyric blocks... ADMINISTER is NOT a row-write distinction in this phase") both point the same direction: content edits (including rename and vocal-state) are a contribute-tier capability, and only membership itself (the `/members` route) is administer-gated.
- **Namespace import for `sendCollaboratorInvite`** (`import * as collaboratorInvite from '@/lib/collaborators/invite'`, called as `collaboratorInvite.sendCollaboratorInvite(...)`). This is a narrow, deliberate style choice for this one file — it keeps the function's literal call site as the only place its name is typed, which both reads as unambiguous "this is reused, not reimplemented, and called in exactly one place" and satisfies the plan's own `grep -c 'sendCollaboratorInvite' ... == 1` verification gate. Not adopted as a codebase-wide import convention; every other import in these three files uses the codebase's normal named-import style.

## Deviations from Plan

None that change a locked decision. One implementation detail worth recording as a correctness fix within scope:

**1. [Rule 1 — Bug] `applyWorkSplits()` would have rejected a legitimate empty redraft**
- **Found during:** Task 3, writing `lib/catalogue/splits-io.test.ts`'s "deletes and writes nothing further when the redraft empties the sheet" case
- **Issue:** A literal reading of the plan's behavior spec ("refuses a party set whose percentages do not sum to one hundred, reusing `validateApprovalTotal`") would run the total check unconditionally. `validateApprovalTotal([])` returns `false` (by its own docstring: it guards a nonempty set), but `planWriterRemoval()` (plan 03) legitimately returns `parties: []` when the last writer is removed from a sheet. An unconditional check would make "remove the only writer" fail with a "must total 100%" error, which is not the failure this check exists to catch.
- **Fix:** The total check in `applyWorkSplits()` only runs when `parties.length > 0`; a genuinely empty redraft skips it, deletes the existing rows, and returns `{ ok: true }`.
- **Files modified:** `lib/catalogue/splits-io.ts` (within Task 3's already-scoped file — no new file).
- **Verification:** `splits-io.test.ts`'s "deletes and writes nothing further when the redraft empties the sheet" test asserts `{ ok: true }` and that `insert` is never called for an empty parties array; the "refuses a party set whose percentages do not sum to 100" test still asserts the check fires correctly for a nonempty, invalid set.
- **Committed in:** `053def6` (part of Task 3's commit — found and fixed before the task was ever verified green).

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug fix, required for `planWriterRemoval()`'s last-writer-removal case to actually work through `applyWorkSplits()`).
**Impact on plan:** No scope creep — contained entirely within the already-scoped `lib/catalogue/splits-io.ts` and its own test suite.

## Issues Encountered

- **Shared-worktree git index race with sibling agents.** Two sibling plans (37-06, 37-07, 37-10) executed concurrently in the same working tree. The first `git add` + `git commit` attempt for Task 1 (`app/api/works/route.ts`) failed twice in quick succession — once with "nothing added to commit" and once with "pathspec did not match any file(s) known to git" — because a sibling's concurrent `git add`/`git commit` mutated the shared index between this agent's `add` and `commit` calls. Resolved by re-running `git add <file> && git commit -F <message-file> -- <file>` as one tight sequence per the git discipline instructions, then verifying each resulting commit with `git show --stat HEAD` to confirm it contained only this plan's own file(s). No sibling file ever landed in one of this plan's commits.
- A first commit-message attempt for Task 2 (heredoc via `git commit -m "$(cat <<'EOF' ...)"`) hit a bash quoting/parsing error in the tool's command execution (not a content error — no unbalanced quote was present in the message). Switched to writing the message to a scratch file and using `git commit -F <file>` for Tasks 2 and 3, avoiding the heredoc-in-command-substitution pattern entirely.

## User Setup Required

None — no external service configuration required. This plan writes TypeScript route handlers and one pure-I/O lib module against tables that migrations 135-138 already created live in production (verified this session: six tables exist and are empty; the RPCs and `reorder_lyric_blocks` exist; `split_sheets.work_id` is nullable). No new package-manager install (T-37-SC, accepted in the plan's own threat model).

## Next Phase Readiness

- `POST /api/works` is ready for plan 13's 🎵 Start a song door to call and redirect to the returned work's id.
- `GET/PATCH /api/works/[workId]` are ready for plan 11's `WorkHeader` (title input, vocal-state control) and plan 12's composer page (client-side refresh after a mutation).
- `POST /api/works/[workId]/members` is ready for plan 11's `WorkRoster` to call for both the add-collaborator flow and, separately, a writer-promotion action.
- `lib/catalogue/splits-io.ts`'s `loadWorkSplits()` is the read plan 12's page should use instead of a new split-sheet RLS policy, per migration 137's decided posture.
- **No blockers**, but three of this plan's five coverage deliverables (D1-D4) carry `human_judgment: true` — every route in this plan writes to tables that exist live in production per this session's verification, but no route was exercised against that live database by this executor agent (no database connection available). A human (or a future UAT pass) should exercise `POST /api/works` end-to-end (work → owner membership → draft sheet), `PATCH /api/works/[workId]` (rename diary event, vocal-state clearing/defaulting), and `POST /api/works/[workId]/members` (invite → claim → `work_members.user_id` backfill, and a writer promotion against a real split sheet) at least once before these routes are exposed to users.

---
*Phase: 37-the-catalogue-unreleased-works-as-living-assets-versions-rig*
*Completed: 2026-08-30*

## Self-Check: PASSED

All 5 created source files plus this SUMMARY.md verified present on disk. All 3 task commits
(`096c49d`, `8bdcc44`, `053def6`) verified present in `git log --oneline --all`, and each was
independently confirmed via `git show --stat HEAD` at commit time to contain only this plan's own
file(s) — no sibling-plan file slipped into any of these three commits.
