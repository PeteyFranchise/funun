---
phase: 37-the-catalogue-unreleased-works-as-living-assets-versions-rig
plan: 11
subsystem: ui
tags: [react, tailwind, catalogue, membership, splits, renderToStaticMarkup, sketch-001, sketch-006]

requires:
  - phase: 37-04
    provides: "types/catalogue.ts's WorkVocalState/PerformerRef, and lib/catalogue/membership.ts's WorkTier/WORK_TIER_LABELS/canManageMembership() — the capability predicate this plan gates every membership control behind"
  - phase: 37-05
    provides: "PATCH /api/works/[workId] (title + vocal-state) and POST /api/works/[workId]/members (invite + tier + inline writer promotion) — the two routes this plan's components call directly"

provides:
  - "components/catalogue/WorkHeader.tsx — the live debounced title input, the three-state vocal control (primary/varies/instrumental), the identity chips, and the splits-status chip"
  - "components/catalogue/WorkRoster.tsx — membership and the split sheet rendered as two honest, separate groupings, the quick-invite-shaped add form, and the separate writer-promotion action"
  - "app/api/works/[workId]/members/[memberId]/promote/route.ts — the missing writer-promotion route for a member ALREADY on the roster (see Deviations)"

affects: [37-12]

tech-stack:
  added: []
  patterns:
    - "Component-owns-its-own-fetch, matching components/vault/* (DistributorPicker.tsx, DocumentStage.tsx) rather than ComposerCard.tsx's pure-callback shape — both WorkHeader and WorkRoster are persistent settings surfaces with their own PATCH/POST calls, not verb dispatchers a parent page drives."
    - "Presentational id-resolution boundary: WorkHeader accepts primaryPerformerLabel (a pre-resolved display string) rather than resolving a PerformerRef's collaborator/user id itself — id-to-name lookups stay the server page's job, matching DiaryFeed.tsx's precedent (plan 10) of accepting page-supplied display fields with no home in the underlying row type."

key-files:
  created:
    - components/catalogue/WorkHeader.tsx
    - components/catalogue/WorkHeader.test.tsx
    - components/catalogue/WorkRoster.tsx
    - components/catalogue/WorkRoster.test.tsx
    - app/api/works/[workId]/members/[memberId]/promote/route.ts
  modified: []

key-decisions:
  - "WorkHeader's vocal-state guardrail prose (a default fills the plan never the record; an AI vocal can never hide under the default) is folded behind LearnWhy, but the STATE FACT itself (what instrumental/varies/primary each mean) is printed as its own always-visible line per state — the plan's verify bullet requires each state to render 'its own affordance' distinctly on first paint, which a fully-collapsed guardrail would have hidden along with the prose it was meant to hide."
  - "WorkRoster conflates the pad's '✍ writer' badge with 'is currently a split-sheet party' for THIS surface, rather than trying to derive it from per-block authorship (which this component has no data for). The PERFORMER RULE's own wording — '✍ writer (automatic: whoever typed; moves splits)' — already ties the writer badge to the exact event this roster's promote action performs, so this is a direct application of the existing rule, not a new one. The 🎤 singer badge is accepted as an optional, caller-supplied flag (defaults to false) since no version/block-level performer data is wired to any page yet."
  - "The add-collaborator form in WorkRoster renders inline and always-open (no closed/toggle state), unlike QuickInviteModal's modal-behind-a-button pattern. WorkRoster is a persistent panel within the composer page, not a standalone modal flow — an always-visible inline form keeps the surface's two facts (roster, sheet) and its one available action (add) all in one static view, and was the only shape directly verifiable by this plan's renderToStaticMarkup suite (no jsdom, no click simulation available)."

patterns-established: []

requirements-completed: [S-02, S-01]

coverage:
  - id: D1
    description: "WorkHeader renders a live, debounced title input (RENAME RULE) that PATCHes plan 05's route; identity and title-is-presentation is documented at the exact implementation line"
    requirement: S-01
    verification:
      - kind: unit
        ref: "components/catalogue/WorkHeader.test.tsx#WorkHeader — renders the title as an input carrying the current value"
        status: pass
    human_judgment: false
  - id: D2
    description: "The three vocal states (primary/varies/instrumental) each render their own distinct affordance and description line; the 'sections inherit unless tagged' line appears only for the primary state; instrumental's real consequences (who-sings prompts gone, Crate check passes by construction, DDEX omits vocal roles) are stated, not just labeled"
    requirement: S-01
    verification:
      - kind: unit
        ref: "components/catalogue/WorkHeader.test.tsx (5 tests: primary/varies/instrumental rendering + the three-way distinctness assertion)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The two inheritance guardrails are folded behind LearnWhy and collapsed on first paint; the splits chip and every contributor/owner chip render a state word or a plain name only — no percent character, ever, next to a name"
    requirement: S-02
    verification:
      - kind: unit
        ref: "components/catalogue/WorkHeader.test.tsx#WorkHeader — collapses the LearnWhy guardrail content on first paint / renders the splits chip.../ renders the contributor and owner chips..."
        status: pass
    human_judgment: false
  - id: D4
    description: "WorkRoster renders membership and the split sheet as two separate groupings carrying the plain-words doctrine line, gated behind canManageMembership() from lib/catalogue/membership.ts (not reimplemented)"
    requirement: S-02
    verification:
      - kind: unit
        ref: "components/catalogue/WorkRoster.test.tsx#WorkRoster — renders the two groupings.../ hides the add form and the promote control from a contribute-tier..."
        status: pass
    human_judgment: false
  - id: D5
    description: "The add-collaborator form carries exactly a name field, an email field and a tier choice (the quick-invite field shape plus the tier this route requires); writer promotion is a separate control outside the add form and reports its outcome in words, never a number; no percentage input exists anywhere in either component"
    requirement: S-02
    verification:
      - kind: unit
        ref: "components/catalogue/WorkRoster.test.tsx (renders the add form.../ places writer promotion outside the add form / contains no percentage input or percentage figure anywhere)"
        status: pass
    human_judgment: false
  - id: D6
    description: "The new promote route (deviation) requires the administer tier via resolveWorkAccess(), reuses planWriterPromotion/loadWorkSplits/applyWorkSplits unchanged, and never writes to work_members"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit (0 errors) + npm run lint --max-warnings=0 (clean) — no dedicated route-level test harness exists in this codebase (HARD RULES; no jsdom), matching every sibling route in this phase (plan 05's own routes carry the same coverage shape)"
        status: pass
    human_judgment: true
    rationale: "Same posture as plan 05's own D1/D3/D4: this route writes to tables live in production (migrations 135-138), but no database connection is available to an executor agent, so the end-to-end promote → split_sheet_parties redraft path is unverified against a real database in this plan. A human (or a future UAT pass) should exercise it at least once."

duration: ~25min
completed: 2026-08-30
status: complete
---

# Phase 37 Plan 11: The Work Header and Roster Summary

**`WorkHeader.tsx` (live title + three-state vocal control + chips) and `WorkRoster.tsx` (membership vs. splits as two honest groupings, quick-invite-shaped add form, separate writer promotion) — plus a small new promote route that closes a gap plan 05's API surface left for promoting an existing member.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 2/2 completed
- **Files modified:** 5 created (2 components, 2 test suites, 1 new API route)

## Accomplishments

- `components/catalogue/WorkHeader.tsx` — a live, debounced title input that PATCHes `/api/works/[workId]` (RENAME RULE: identity is the work id, the title is presentation, so renaming is free and the diary logs it via migration 138's own trigger); a three-state vocal control (primary/varies/instrumental) where each state renders its own distinct line stating what it actually does, with "sections inherit unless tagged" appearing only for the primary state; the two inheritance guardrails folded behind `LearnWhy`; identity chips (owner handle + contributor names) and a splits-status chip that is a state word only — no percent character sits beside a name anywhere in this file (CAT-Q1a).
- `components/catalogue/WorkRoster.tsx` — membership and the living split sheet rendered as two separate groupings with the doctrine stated in plain words ("being on the work means you can add to it; being on the sheet means you own part of it" — Pitfall 3); an add-collaborator form matching the existing quick-invite field shape (first name + email) plus the tier choice the route requires, always surfacing the returned invite link with a copy control; writer promotion as a separate control on an existing member, outside the add form, reporting its outcome in words ("redrafted to equal shares") and never a number; every membership control gated behind `canManageMembership()` (`lib/catalogue/membership.ts`, not reimplemented).
- `app/api/works/[workId]/members/[memberId]/promote/route.ts` — a small new route (deviation, see below) that fills a real gap: plan 05's members route can only ever create a new `work_members` row, so it has no path for promoting someone already on the roster.
- All five files pass `npx tsc --noEmit` (0 errors), `npm run lint --max-warnings=0` (clean), and the full `npx jest` suite (313 suites / 3530 tests, up from the session's 3475-test baseline — no regression to any existing suite).

## Task Commits

Each task was committed atomically:

1. **Task 1: `components/catalogue/WorkHeader.tsx`** — `8ad490a` (feat)
2. **Task 2: `components/catalogue/WorkRoster.tsx` + the promote route deviation** — `c68405b` (feat)

## Files Created/Modified

- `components/catalogue/WorkHeader.tsx` — live title input, three-state vocal control, identity/splits chips
- `components/catalogue/WorkHeader.test.tsx` — 10 tests
- `components/catalogue/WorkRoster.tsx` — membership/splits groupings, add form, writer promotion
- `components/catalogue/WorkRoster.test.tsx` — 9 tests
- `app/api/works/[workId]/members/[memberId]/promote/route.ts` — the writer-promotion route for an existing member

## Decisions Made

- **WorkHeader prints each vocal state's real-world consequence as an always-visible line, not folded behind LearnWhy.** Only the two inheritance *guardrails* (prose explaining why the default is safe) collapse behind `LearnWhy` — the state's own fact ("Instrumental — no vocals. Every who-sings prompt disappears, and this song passes the Crate vocal check by definition") stays visible, because the plan's own verify bullet requires each of the three states to render "its own affordance" distinctly on first paint. Collapsing that too would have hidden the very thing the test (and the doctrine) requires to be visible.
- **WorkRoster's `✍` writer badge is set from `isOnSheet`**, not derived from any per-block authorship data (which this component doesn't have). The PERFORMER RULE's own text — "✍ writer (automatic: whoever typed; moves splits)" — already defines the writer badge as the thing that moves splits, which is exactly what this roster's promote action does. `🎤` stays an optional, caller-supplied flag (default `false`) pending per-version performer data that no page wires up yet.
- **The add-collaborator form is inline and always rendered** (for a canManage viewer), not behind an open/close toggle like `QuickInviteModal`. `WorkRoster` is a persistent panel inside the composer page, not a modal flow — an always-visible form keeps the whole surface (both groupings, the add path, and the promote action) verifiable as one static render, which matters directly given this repo's `renderToStaticMarkup`-only test constraint (no jsdom, no click simulation).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Added `POST /api/works/[workId]/members/[memberId]/promote` — the missing route for promoting an EXISTING member**
- **Found during:** Task 2, while implementing WorkRoster's "mark someone a writer as a separate action on an existing member" requirement
- **Issue:** Plan 05's `POST /api/works/[workId]/members` route only ever `.insert()`s a brand-new `work_members` row (optionally promoting that *same new row* to the split sheet within the same request, via `is_writer: true`). It has no path for promoting a member who is **already** on the roster — calling that route a second time with the same `collaborator_id` would collide with migration 136's partial unique indexes (`idx_work_members_unique_collab` / `idx_work_members_unique_user`) and fail. Migration 136's own header comment ("that promotion happens only when someone is marked a WRITER, in plan 05's route") reflects the assumption, written during wave 1, that promotion always happens at add-time — but plan 11's own task text explicitly requires a later, separate action on an existing member, which the wave-2 API surface cannot serve without this addition.
- **Fix:** Added `app/api/works/[workId]/members/[memberId]/promote/route.ts` — gated by `resolveWorkAccess()` requiring the administer tier (same gate as the sibling route), resolving the target member's name via its `collaborator_id`, then calling the exact same, already-tested primitives plan 05's route already calls for its own inline promotion branch: `loadWorkSplits()` → `planWriterPromotion()` → `applyWorkSplits()` (all from `lib/catalogue/splits.ts` / `lib/catalogue/splits-io.ts`, unchanged). The new route contains no `.insert()`, `.update()`, or `.delete()` against `work_members` anywhere in its body — promotion moves the split sheet only, never the guest list, structurally matching Pitfall 3.
- **Files modified:** `app/api/works/[workId]/members/[memberId]/promote/route.ts` (new file — no existing route file was touched; plan 05's own route is untouched, per the "consume, never reimplement" instruction).
- **Verification:** `npx tsc --noEmit` (0 errors), `npm run lint --max-warnings=0` (clean), full `npx jest` (no regression). No dedicated route-level test exists for this file, matching every sibling route in this phase (no jsdom / no live-database test harness in this codebase — see plan 05's own summary for the same posture on its three routes).
- **Committed in:** `c68405b` (Task 2's commit)

---

**Total deviations:** 1 auto-fixed (Rule 3 — blocking; required for the plan's own explicit "separate action on an existing member" behavior to be reachable at all).
**Impact on plan:** No scope creep beyond the one new, minimal route file. No existing route, migration, or lib module was modified.

## Issues Encountered

- Two sibling plans (37-08/37-09/37-10 in this shared wave) landed commits on the branch concurrently while this plan was executing. The first `git commit -m "$(cat <<'EOF' ...)"` heredoc-via-command-substitution attempt for Task 1 hit a Bash-tool quoting/parsing error (the message body was split across multiple mis-parsed pathspec arguments) — not a content error. Verified via `git log`/`git status` that nothing had actually committed, then switched to `git commit -F <scratch-file>` for both tasks. Each resulting commit was verified with `git show --stat HEAD` to contain only this plan's own files before proceeding — no sibling file slipped into either commit.

## User Setup Required

None — no external service configuration required. Both components call existing (or, for the one deviation, newly added but equally unconfigured) API routes against tables that migrations 135-138 already created live in production.

## Next Phase Readiness

- `WorkHeader` and `WorkRoster` are ready for plan 12's composer page to mount, passing resolved props (owner handle, contributor names, splits status word, primary-performer display label, and the roster array with its per-member tier/pending/on-sheet facts) from its own server-side data load.
- `WorkRoster`'s `onMemberAdded`/`onWriterPromoted` callbacks are ready for plan 12 to hook into its own diary-refresh logic after a mutation.
- The new promote route is ready for any future surface that needs to promote an existing member — no other plan in this phase currently calls it besides `WorkRoster`.
- **No blockers**, but the new promote route's D6 deliverable carries `human_judgment: true` — it writes to tables live in production but was not exercised against that live database by this executor agent (no database connection available). A human (or a future UAT pass) should exercise the add → promote round trip at least once before this surface reaches users.

---
*Phase: 37-the-catalogue-unreleased-works-as-living-assets-versions-rig*
*Completed: 2026-08-30*

## Self-Check: PASSED

All 5 created source files plus this SUMMARY.md verified present on disk. Both task commits
(`8ad490a`, `c68405b`) verified present in `git log --oneline --all`, and each was independently
confirmed via `git show --stat HEAD` at commit time to contain only this plan's own file(s) — no
sibling-plan file slipped into either commit.
