---
phase: 18-split-sheet-home
plan: 01
subsystem: split-sheets
tags: [nextjs, supabase, react, split-sheets, collaborators, identity, redistribute]

# Dependency graph
requires:
  - phase: 18-split-sheet-home
    provides: "18-05's resolvePartyIdentity() live-identity resolver, migration 066 (collaborators.legal_name/status, artist_profiles.legal_name_locked_at), and the Settings legal-name confirm-and-lock"
provides:
  - "A reachable, editable living-draft surface: /split-sheets list, /split-sheets/[id] detail+edit, /split-sheets/new create — closing the write-only-draft and orphaned-route findings"
  - "lib/split-sheets/redistribute.ts, lib/split-sheets/change-summary.ts, lib/split-sheets/list.ts — three pure, tested modules"
  - "PATCH /api/split-sheets/[id]'s first-ever UI caller"
  - "components/split-sheets/PartyPicker.tsx — a new fast-add collaborator picker, entirely separate from CollaboratorPicker.tsx"
  - "POST /api/split-sheets/[id]/share — a non-formal, read-only draft preview link"
  - "POST /api/approve/[token]'s update_identity action — §7 recipient self-correction"
affects: [18-02]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "redistribute(splits, mode): a zero-valued split entry is read as 'a party with no prior weight' (the one just added), letting one function serve both add (append a 0 placeholder) and remove (pass what's left) through the same code path"
    - "PartyRow kind discriminant ('self' | 'fastAdd' | 'full') driving render branching in SplitSheetBuilder, replacing the old single-shape row + embedded CollaboratorPicker"
    - "Server-computed 'before' (frozen) vs display (live-resolved) party snapshots passed to the client as two disjoint shapes, so summarizePartyChanges() can never see a live-resolved value by construction"
    - "Sibling-component isolation (PartyPicker vs CollaboratorPicker) as the regression-proofing strategy for a shared, differently-testable roster fetch"

key-files:
  created:
    - lib/split-sheets/redistribute.ts
    - lib/split-sheets/redistribute.test.ts
    - lib/split-sheets/change-summary.ts
    - lib/split-sheets/change-summary.test.ts
    - lib/split-sheets/list.ts
    - lib/split-sheets/list.test.ts
    - app/api/split-sheets/[id]/share/route.ts
    - app/(artist)/split-sheets/new/page.tsx
    - "app/(artist)/split-sheets/[id]/page.tsx"
    - components/split-sheets/SplitSheetList.tsx
    - components/split-sheets/PartyPicker.tsx
    - __tests__/approve-token-identity-action.test.ts
  modified:
    - lib/split-sheets/phase.ts
    - lib/split-sheets/phase.test.ts
    - app/api/split-sheets/route.ts
    - "app/(artist)/split-sheets/page.tsx"
    - components/nav/ArtistNav.tsx
    - components/split-sheets/SplitApprovalView.tsx
    - components/split-sheets/SplitSheetBuilder.tsx
    - lib/collaborators/index.ts
    - "app/api/approve/[token]/route.ts"
    - "app/approve/[token]/page.tsx"

key-decisions:
  - "redistribute() treats a zero-valued split as 'unweighted/new' rather than adding a second function for add vs. remove — one pure function, two call shapes"
  - "The initiator's self-row identity in edit mode is ALWAYS re-derived fresh from the CURRENT artist_profiles (same source as create mode), never from the frozen party-1 snapshot — so every edit re-anchors a legacy sheet's party 1 onto the new self-row convention rather than trying to detect/match a pre-existing 'self' row by an unreliable heuristic"
  - "PartyPicker is a wholly separate component from CollaboratorPicker.tsx (option b from RESEARCH Architecture Patterns §1), not a mode prop on the shared component — zero risk to MetadataStudio's untested ComposerEditor caller, confirmed via an empty git diff on both CollaboratorPicker.tsx and MetadataStudio.tsx"
  - "A non-initiator account-holding party visiting /split-sheets/[id] gets a read-only summary, not a disabled/read-only rendering of the full interactive builder — only the initiator can ever PATCH server-side, so a second interactive surface for a viewer who can never save was out of scope for this plan"
  - "[id]/page.tsx authorizes with the session client, then re-fetches full sheet+party data via the SERVICE client — a non-initiator party's own RLS grant ('Party sees own row') would otherwise silently truncate the nested party list down to just their own row before any rendering happens"
  - "The §7 identity-update action is available even after a party has already approved (bypasses the approve/counter 'already used' gate) but is refused once sheet.status is esign_pending/executed (the freeze boundary), per the plan's explicit instruction — this means the disclosure is visually present but inert during the 'sign' phase, since 'sign' by construction only occurs when sheet.status is esign_pending"

patterns-established:
  - "Shared-logic modules extracted to lib/ specifically so a Next.js page/route pair can both consume them without duplicating query shape (lib/split-sheets/list.ts, mirroring lib/contracts/locker-rows.ts's fetchContractRows precedent)"

requirements-completed: [HOME-01, HOME-02, HOME-03, HOME-04, HOME-05]

coverage:
  - id: D1
    description: "redistribute() rebalances splits in even or proportional mode, always totaling exactly 100.000 for 1-12 parties, ratio-preserving on add/remove"
    requirement: "HOME-03"
    verification:
      - kind: unit
        ref: "lib/split-sheets/redistribute.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "summarizePartyChanges() diffs FROZEN party sets only (id/name/split%), never identity fields — a live-linked PRO/IPI update produces no change record (P18-09)"
    requirement: "HOME-05"
    verification:
      - kind: unit
        ref: "lib/split-sheets/change-summary.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "resolvePartyPhase() gains a 'preview' branch — a draft sheet resolves to preview regardless of party approval_status, checked before every other lifecycle branch"
    requirement: "HOME-04"
    verification:
      - kind: unit
        ref: "lib/split-sheets/phase.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "GET /api/split-sheets returns initiated + party-of sheets merged/deduped by id; a draft is returned only to its initiator"
    requirement: "HOME-01"
    verification:
      - kind: unit
        ref: "lib/split-sheets/list.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "/split-sheets list page + nav entry close the orphaned-route and write-only-draft findings; /split-sheets/new + /split-sheets/[id] complete the surface"
    requirement: "HOME-01, HOME-02"
    verification:
      - kind: manual_procedural
        ref: "human-check: save a draft, return to /split-sheets, confirm it lists and opens; share it, confirm read-only preview with no approve/counter and no §7 section"
        status: unknown
    human_judgment: true
    rationale: "Requires a live browser session against a running app with a real Supabase session — not exercisable in this non-interactive execution context."
  - id: D6
    description: "POST /api/split-sheets/[id]/share mints/refreshes party tokens without touching split_sheets.status or approval_status, initiator-only, 409 outside draft/countered, accepts no body field"
    requirement: "HOME-04"
    verification:
      - kind: manual_procedural
        ref: "human-check: share a draft and confirm status stays draft; confirm 409 on a pending_approval sheet"
        status: unknown
    human_judgment: true
    rationale: "Requires a live database/session to exercise the route end-to-end; code-level review (initiator ownership check, 409 branch, no request.json() call) was performed but not substituted for the plan's own designated human-check."
  - id: D7
    description: "SplitSheetBuilder auto-includes the initiator as a read-only, live-linked party 1 on BOTH create and edit; PartyPicker fast-adds a party by email/phone with a pending badge; redistribute() rebalances without retyping; CollaboratorPicker.tsx is untouched"
    requirement: "HOME-02, HOME-03"
    verification:
      - kind: unit
        ref: "git diff confirms zero changes to components/collaborators/CollaboratorPicker.tsx and components/vault/MetadataStudio.tsx"
        status: pass
      - kind: manual_procedural
        ref: "human-check: new sheet shows locked party 1 with live PRO/IPI and no remove control; fast-add by email alone saves with a pending badge and no legal-name error; a 50/30/20 draft gaining a fourth party scales the first three proportionally; an executed sheet renders read-only with the freeze-boundary text; MetadataStudio's composer picker still works"
        status: unknown
    human_judgment: true
    rationale: "The CollaboratorPicker/MetadataStudio non-regression claim is backed by a structural proof (empty diff) rather than a click-through, per this session's execution constraints (no live browser). The remaining builder-behavior human-checks require a live session to exercise."
  - id: D8
    description: "A recipient can self-correct their own identity on /approve/[token] via an optional collapsed section that overwrites only their own party row (and linked collaborator, if any) through a token-scoped, allowlisted, freeze-boundary-guarded action carrying no free text"
    requirement: "HOME-04, HOME-05"
    verification:
      - kind: unit
        ref: "__tests__/approve-token-identity-action.test.ts"
        status: pass
      - kind: manual_procedural
        ref: "human-check: expand Advanced information on the approve phase, correct a PRO, confirm it saves without approving and the initiator sees the corrected value"
        status: unknown
    human_judgment: true
    rationale: "The route-level security/behavior properties (allowlist, token-scoping, freeze-boundary refusal) are unit-tested against a mocked Supabase client; the end-to-end 'initiator now sees the corrected value' claim requires a live session."

# Metrics
duration: ~25min (task execution; additional time spent on upfront research/context reading not reflected in commit timestamps)
completed: 2026-07-22
status: complete
---

# Phase 18 Plan 01: Living-Draft Surface Summary

**A saved split-sheet draft is now reachable, editable, and growable — a new `/split-sheets` list, `/split-sheets/[id]` edit page (PATCH's first-ever UI caller), an auto-included live-linked initiator row, a separate fast-add `PartyPicker`, add-and-redistribute math, a non-formal read-only share, and recipient self-identity-correction on the approval page.**

## Performance

- **Duration:** ~25 min task execution (research/context-loading occurred earlier in the session and isn't reflected in commit timestamps)
- **Tasks:** 4 of 4
- **Files modified:** 22 (12 created, 10 modified)
- **Completed:** 2026-07-22

## Accomplishments

- **Three pure, tested modules** (Task 1): `lib/split-sheets/redistribute.ts` (add/remove-party percentage rebalancer — even or proportional, always totaling exactly 100.000 for 1–12 parties), `lib/split-sheets/change-summary.ts` (`summarizePartyChanges()` diffs FROZEN party sets only — a live-identity update is structurally invisible to it, P18-09), and `lib/split-sheets/phase.ts`'s new `'preview'` branch (a draft sheet always resolves to a read-only preview regardless of the visiting party's own approval_status).
- **The list surface** (Task 2): `GET /api/split-sheets` now returns initiated **and** party-of sheets (via `lib/split-sheets/list.ts`, unit-tested), with drafts held back from non-initiators (P18-11). `/split-sheets` is now the list (grouped by lifecycle state, empty-state CTA); creation moved to `/split-sheets/new`. A previously-orphaned route now has a nav entry, open to industry accounts (D-20). `POST /api/split-sheets/[id]/share` mints read-only preview links without advancing the lifecycle or accepting any text (P18-08/P18-13). `SplitApprovalView` renders a read-only `'preview'` phase with no approve/counter control.
- **The builder rewrite** (Task 3): `SplitSheetBuilder` now auto-includes the initiator as a locked, live-linked party 1 on **both** create and edit — no manual "+ Add party → Use my info" step. A new, wholly separate `PartyPicker` component (roster pick or email/phone-only fast-add with collapsed advanced info and a pending/confirmed badge) replaces the old embedded `CollaboratorPicker`, which is left byte-for-byte untouched. Adding or removing a party calls `redistribute()` so the other rows never need retyping. `/split-sheets/[id]` is a new server component authorizing to the initiator or an account-holding party (404 otherwise), resolving every claimed party's identity live via 18-05's `resolvePartyIdentity()`. The freeze boundary renders its own refusal text; a consensus-resetting save shows the P18-09 change summary.
- **§7 recipient self-correction** (Task 4): `POST /api/approve/[token]` gains a distinct `update_identity` action — token-scoped, allowlisted (legal_name/pro/ipi/publishing_designee/administrator), overwrite-semantics, refused past the freeze boundary, no free text. `SplitApprovalView` gains a collapsed "Advanced information" disclosure in the approve and sign phases.

## Task Commits

1. **Task 1: Redistribution, change-summary, and the preview phase** — `8864efb` (feat)
2. **Task 2: List surface, widened list query, non-formal share, read-only preview** — `72a0e38` (feat)
3. **Task 3: Builder edit mode, auto-included self row, fast-add PartyPicker** — `d0a4b37` (feat)
4. **Task 4: §7 recipient-side advanced info on the approval page** — `c9f608b` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `lib/split-sheets/redistribute.ts` (+test) — even/proportional split rebalancer
- `lib/split-sheets/change-summary.ts` (+test) — P18-09 frozen-snapshot party-set diff, no free text
- `lib/split-sheets/phase.ts` (+test) — `'preview'` phase branch
- `lib/split-sheets/list.ts` (+test) — the initiated+party-of merge, shared by the API route and the list page
- `app/api/split-sheets/route.ts` — GET widened via `fetchSplitSheetsForUser()`
- `app/api/split-sheets/[id]/share/route.ts` — new non-formal share route
- `app/(artist)/split-sheets/page.tsx` — now the list page
- `app/(artist)/split-sheets/new/page.tsx` — creation, moved here
- `app/(artist)/split-sheets/[id]/page.tsx` — new detail/edit page with live-identity resolution
- `components/split-sheets/SplitSheetList.tsx` — new list component
- `components/split-sheets/PartyPicker.tsx` — new fast-add/roster picker, separate from CollaboratorPicker
- `components/split-sheets/SplitSheetBuilder.tsx` — rewritten around the `kind` discriminant, edit mode, redistribute
- `components/split-sheets/SplitApprovalView.tsx` — `'preview'` phase render + §7 `IdentityDisclosure`
- `components/nav/ArtistNav.tsx` — nav entry for `/split-sheets`
- `lib/collaborators/index.ts` — `legal_name`/`status` added to the editable-fields allowlist
- `app/api/approve/[token]/route.ts` — `update_identity` action
- `app/approve/[token]/page.tsx` — passes `partyIdentity` through
- `__tests__/approve-token-identity-action.test.ts` — new route test

## Decisions Made

See `key-decisions` in frontmatter above.

## Deviations from Plan

None — plan executed as written, with the following in-scope judgment calls documented as `key-decisions` above (all within the plan's own stated discretion/open questions, not deviations from its instructions): the self-row re-derivation-not-matching approach for edit mode, the read-only (not full builder) render for non-initiator viewers, and the session-then-service-client authorization pattern in `[id]/page.tsx`.

## Cross-Phase Check (per the plan's verification block)

**T-18-01c finding:** `app/api/split-sheets/[id]/mint-envelope/route.ts` (Phase 17) requires every party to have an email address before minting, but does **not** require a non-empty `legal_name`. A fast-added, not-yet-responded party (placeholder `name` = email/phone, empty `legal_name`) **can** be minted today — the document would render an em-dash for that party's legal name (`displayValue()`'s existing "not yet known" convention), not block minting. This is pre-existing Phase 17 behavior, unmodified by this plan, and is recorded here per the plan's explicit instruction to confirm rather than assume. The narrower T-18-01c concern this plan's own code addresses — that the placeholder `name` (email/phone) itself never reaches `legal_name` — **is** correctly mitigated: `PartyPicker`'s fast-add writes `name` and `legal_name` as distinct fields, and `legal_name` stays empty until supplied.

## Manual Verification Required (not exercised in this session)

This execution ran without a live browser/Supabase session. The following `<human-check>` items from the plan's own verify blocks are **not yet exercised** and should be run before this plan is considered fully verified:

1. Draft round-trip: save a draft, confirm it lists at `/split-sheets` and opens at `/split-sheets/[id]`.
2. Share a draft; confirm the shared link shows splits read-only with no approve/counter control and no §7 section, and the sheet stays in draft.
3. Open the builder as a brand-new sheet; confirm party 1 (self) is present, locked, with live PRO/IPI and no remove control.
4. Fast-add a co-writer by email alone; confirm it saves with a pending badge and no legal-name error.
5. Open a 50/30/20 draft, add a fourth party; confirm the first three scale proportionally to a 100% total.
6. Open an executed sheet; confirm the builder renders read-only with the freeze-boundary's own explanation text.
7. Open Metadata Studio's composer-credit picker for a track; confirm it still shows the full identity form and saves (backed by a structural proof — an empty git diff on `CollaboratorPicker.tsx`/`MetadataStudio.tsx` — but not click-through tested this session).
8. On `/approve/[token]` in the approve phase, expand "Advanced information," correct a PRO, confirm it saves without approving, and confirm the initiator now sees the corrected value on the sheet.

## Issues Encountered

None blocking. The one open design tension worth flagging forward: Task 4's instruction to render the §7 disclosure in both the 'approve' and 'sign' phases means it is visually present but functionally inert during 'sign' (which only occurs when `sheet.status === 'esign_pending'`, and the route correctly refuses `update_identity` writes at that status per the freeze boundary). This was implemented literally per the plan's explicit text rather than "fixed," since the plan is the contract; a future small UX pass could hide the disclosure specifically in 'sign' phase if this inertness is judged confusing in practice.

## Verification

- `npx jest lib/split-sheets/redistribute.test.ts lib/split-sheets/change-summary.test.ts lib/split-sheets/phase.test.ts`: 58/58 passing.
- `npx tsc --noEmit`: clean.
- `npm run lint` (`--max-warnings=0`): clean.
- Full suite: **82 suites / 1005 tests passing** (up from the 73 suites / 871 tests baseline recorded in 18-05's summary — suite/test count rose, per the plan's regression gate).
- `git diff --stat components/collaborators/CollaboratorPicker.tsx components/vault/MetadataStudio.tsx`: empty — confirmed untouched.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- HOME-01 through HOME-05 are structurally complete; REQUIREMENTS.md is updated accordingly (see `requirements-completed`).
- **18-02 (Contract Locker attention-first landing) remains the one outstanding plan in Phase 18** — it can now build against a `/split-sheets/[id]` that actually exists, and against `lib/split-sheets/list.ts`'s merge pattern if it needs a similar initiated+party-of shape. 18-03, 18-04, and 18-05 are already complete (per their own SUMMARYs); this plan (18-01) closes every other plan's dependency on the living-draft surface.
- Confirm phase-level closure after 18-02 ships, in the next `/gsd-verify-work` pass, which should also pick up the eight manual-verification items listed above.

---
*Phase: 18-split-sheet-home*
*Completed: 2026-07-22*

## Self-Check: PASSED

All 12 created files confirmed present on disk; all 4 task commits (`8864efb`, `72a0e38`, `d0a4b37`, `c9f608b`) confirmed in git log. Full suite 82/82 suites, 1005/1005 tests green; `tsc --noEmit` and `npm run lint` clean.
