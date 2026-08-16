---
phase: 31-ae-client-workspace-selects-my-client-partners-client-partne
plan: 11
subsystem: ui
tags: [nextjs, react, admin, crate-requests, r10, demand-inbox]

# Dependency graph
requires:
  - phase: 31-ae-client-workspace-selects-my-client-partners-client-partne
    provides: "31-07 — lib/crate-requests/ranking.ts (pure intent ranker) + GET /api/admin/crate-requests (own-book-scoped feed route)"
  - phase: 31-ae-client-workspace-selects-my-client-partners-client-partne
    provides: "31-10 — NewSelectsForm's ?orgId=/?briefId= deep-link contract (Build Selects handoff target)"
provides:
  - "components/admin/CrateRequestsFeed.tsx — the ranked demand-inbox feed component"
  - "app/(admin)/admin/crate-requests/page.tsx — the Crate Requests room"
  - "app/(admin)/admin/lead-engine/page.tsx — retired, now redirects to Crate Requests"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Client component self-fetches its own API route (fetch('/api/admin/crate-requests') in useEffect) rather than the page doing an SSR read-side twin — avoids duplicating the route's normalize/dedupe/guest-fetch logic a second time in page.tsx, matching the plan's explicit 'reuse, do not reimplement' instruction for the 31-07 dependency."
    - "A route.ts-local response type (RowAction) exported and imported as a type-only import into a client component (mirrors 31-10's SelectsCatalogTrackHit precedent) so the feed's row type stays byte-identical to the route's actual response shape instead of a parallel, drift-prone redeclaration."
    - "Accent-gradient CTA reserved for exactly one row (the top-ranked, still-unactioned item) per the UI-SPEC's one-CTA-per-screen accent rule — every other row's action renders as a plain outlined button, even when its action type is also 'Build Selects'."

key-files:
  created:
    - components/admin/CrateRequestsFeed.tsx
    - app/(admin)/admin/crate-requests/page.tsx
  modified:
    - app/(admin)/admin/lead-engine/page.tsx
    - app/api/admin/crate-requests/route.ts
    - components/admin/NewSelectsForm.tsx

key-decisions:
  - "Exported RowAction from app/api/admin/crate-requests/route.ts (was a local, unexported type) so CrateRequestsFeed can type its fetched rows against the route's exact response shape rather than reimplementing it — additive, zero behavior change to the route."
  - "Hot/Warm/New-lead chip thresholds (Claude's discretion per UI-SPEC): New-lead always overrides (isNewLead flag); Hot = a brief or repeat-search-weight row (weight >= 3) OR any row with a deadline/budget present; Warm = everything else. Chosen to match the mockup's Hot=briefs/urgent-searches, Warm=re-opens/browsing split rather than a flat weight>=some-number cut."
  - "Only the #1-ranked, still-unactioned row gets the reserved --grad gradient CTA treatment (fncon-cta); every other row (including other 'Build Selects' rows) renders a plain outlined button — enforces the UI-SPEC's 'never more than one CTA per screen' accent rule literally, matching the mockup where only row 1 uses .btn.grad."
  - "'See lead' renders as an inline expand/collapse panel under the row (client-side toggle) instead of a modal or a second page — a minimal, consent-first surface (what happened + when + 'we don't fingerprint or buy data' + a 'check who you last shared this link with' nudge), no new modal infrastructure needed."
  - "NewSelectsForm now opens pre-filled when ?orgId= is present (was previously read into state but the form stayed collapsed behind an extra click) — a Rule 1 fix so the 'Build Selects' one-click hand-off from Crate Requests actually lands on an open, ready-to-name form instead of a closed toggle button."

patterns-established:
  - "A route.ts type export (not just a route.ts's already-established type-only-import precedent) is a sanctioned way to share a response contract with a client component that fetches that exact route — extends 31-10's SelectsCatalogTrackHit precedent from 'importable type that already existed' to 'export a previously-local type specifically so a caller can reuse it.'"

requirements-completed: [R10, R5]

coverage:
  - id: D1
    description: "Each row shows the client tag, an intent chip, and exactly one dominant action button (not four); guest signals render as visible New-lead rows with a muted avatar; Hot uses the fuchsia-tinted treatment, not the health-rose"
    requirement: R10
    verification:
      - kind: manual_procedural
        ref: "npx tsc --noEmit clean; npm run build compiles (only the pre-existing, unrelated Phase 32 cron/health route-type failures remain); code inspection of CrateRequestsFeed's IntentChip/ActionButton/ClientAvatar against the UI-SPEC's Hot=fuchsia/Warm=amber/New-lead=outlined-neutral contract"
        status: pass
    human_judgment: true
    rationale: "No test framework exists in this project (CLAUDE.md: 'No test framework in dependencies'); the exact chip color rendering and one-button-per-row layout need a human click-through against the live UI to confirm pixel-level compliance, not just a type-check."
  - id: D2
    description: "The room is own-book-scoped (feed comes from the own-book 31-07 route); the old read-only Lead Engine is retired/redirected to this room, not left as a parallel surface"
    requirement: R10
    verification:
      - kind: automated
        ref: "grep -q 'redirect' app/(admin)/admin/lead-engine/page.tsx"
        status: pass
      - kind: manual_procedural
        ref: "code inspection: page.tsx does its own staff gate (redirect if unauthenticated/non-staff) then renders CrateRequestsFeed, which fetches GET /api/admin/crate-requests — the same own-book-scoped route 31-07 built (non-leadership scoped to ae_user_id, leadership unscoped); no second, parallel client-list read was added"
        status: pass
    human_judgment: false
  - id: D3
    description: "The Build Selects action hands off to the 31-10 builder for that client, pre-targeting the row's client"
    requirement: R5
    verification:
      - kind: manual_procedural
        ref: "code inspection: build_selects action renders a Link to /admin/selects?orgId={buyerOrgId}&briefId={briefId}, matching NewSelectsForm's existing ?orgId=/?briefId= read contract (31-10); NewSelectsForm's open state now defaults to Boolean(defaultOrgId) so the deep link opens pre-filled instead of a closed toggle button"
        status: pass
    human_judgment: true
    rationale: "The end-to-end hand-off (click Build Selects -> land on a pre-filled, open Selects form -> name it -> create -> open the builder) is best confirmed with a live click-through; no test framework exists to assert this automatically."

# Metrics
duration: 40min
completed: 2026-08-16
status: complete
---

# Phase 31 Plan 11: Crate Requests Demand Inbox Summary

**The AE's ranked, own-book, guest-aware demand inbox (R10) — CrateRequestsFeed renders the 31-07 intent-ranked feed as scannable rows with Hot/Warm/New-lead chips and one dominant one-click action each; the read-only Lead Engine now redirects here.**

## Performance

- **Duration:** ~40 min
- **Completed:** 2026-08-16T03:51:00Z
- **Tasks:** 2
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments
- `components/admin/CrateRequestsFeed.tsx`: a client component that self-fetches the own-book 31-07 feed and renders each ranked item as a row — activity-type icon (brief/Selects glyph), client avatar or a muted guest glyph, a Hot (fuchsia-tinted)/Warm (amber)/New-lead (outlined neutral) intent chip, and a single dominant action button (Build Selects / Follow up / See lead)
- Guest signals (a selects_reactions row with no logged-in reactor) render as visible New-lead rows, never hidden or de-emphasized; clicking "See lead" opens an inline, consent-first panel — what happened and when, an explicit "we never fingerprint or buy data" statement, and a "check who you last shared this link with" nudge (T-31-26)
- `app/(admin)/admin/crate-requests/page.tsx`: staff-gated room chrome (own per-page auth check, project convention) rendering the feed — data itself flows through the 31-07 route, not a second parallel read
- `app/(admin)/admin/lead-engine/page.tsx`: retired to a `redirect('/admin/crate-requests')` — no parallel read-only feed remains
- Only the top-ranked, still-unactioned row gets the reserved brand-gradient CTA treatment (per the UI-SPEC's one-CTA-per-screen accent rule); every other action renders as a plain outlined button

## Task Commits

Each task was committed atomically:

1. **Task 1: CrateRequestsFeed component — ranked rows, intent chips, one-click actions, guest leads** - `3b4bd5c` (feat)
2. **Task 2: Crate Requests room page + retire Lead Engine** - `41c1ffa` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `components/admin/CrateRequestsFeed.tsx` - the ranked demand-inbox feed component (client component, self-fetching)
- `app/(admin)/admin/crate-requests/page.tsx` - the Crate Requests room (staff-gated chrome)
- `app/(admin)/admin/lead-engine/page.tsx` - retired, now a redirect to `/admin/crate-requests`
- `app/api/admin/crate-requests/route.ts` - exported `RowAction` (was local-only) so the feed can reuse the route's exact response type (deviation)
- `components/admin/NewSelectsForm.tsx` - opens pre-filled when deep-linked with `?orgId=` instead of staying collapsed (deviation, Rule 1)

## Decisions Made
- The feed is a self-fetching client component rather than page.tsx doing a second SSR read-side twin of the 31-07 route's own-book/normalize/guest-fetch logic — this was the most direct way to honor the plan's explicit "read and reuse them, do not reimplement" instruction for the 31-07 dependency, at the cost of one extra client-side round trip (acceptable for a demand-inbox room, not a hot render path).
- Hot/Warm/New-lead thresholds are Claude's-discretion labeling over the ranker's raw `weight`, as the UI-SPEC explicitly calls out — see key-decisions above for the exact rule.
- The brand gradient CTA is reserved for exactly one row on the whole screen (the top-ranked, unactioned item), even though multiple rows could independently be "Build Selects" — this is a stricter reading of the UI-SPEC's "never more than one CTA per screen" accent rule than the plan's mockup literally required, chosen because the color contract's language is unambiguous ("Never used for... more than one CTA per screen").

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Exported RowAction from the 31-07 route**
- **Found during:** Task 1 (CrateRequestsFeed component)
- **Issue:** The plan instructs reusing the 31-07 route rather than reimplementing its logic, but the route's per-row action union (`RowAction`) was a local, unexported type — there was no way for a consuming component to type its fetched rows against the route's real response shape without redeclaring a parallel type that could silently drift from the route.
- **Fix:** Added `export` to `RowAction` in `app/api/admin/crate-requests/route.ts` (one-line, additive, zero behavior change) and imported it as a type-only import into `CrateRequestsFeed.tsx`, mirroring 31-10's existing `SelectsCatalogTrackHit` type-import precedent.
- **Files modified:** `app/api/admin/crate-requests/route.ts`
- **Verification:** `npx tsc --noEmit` clean; `npm run build` compiles.
- **Committed in:** `3b4bd5c` (Task 1 commit)

**2. [Rule 1 - Bug] NewSelectsForm now opens pre-filled when deep-linked**
- **Found during:** Task 2 (Crate Requests room page)
- **Issue:** `NewSelectsForm` already read `?orgId=`/`?briefId=` from `useSearchParams()` into its `orgId`/`briefId` state (31-10 built this specifically as the future "Build Selects" deep-link contract), but its `open` state defaulted to `false` unconditionally — so a deep link from Crate Requests would land on the Selects list page with the create form still collapsed behind a "+ Build Selects" toggle button, silently defeating the one-click hand-off this plan's must_haves require.
- **Fix:** Changed `const [open, setOpen] = useState(false)` to `useState(Boolean(defaultOrgId))` — a one-line change, no other behavior affected (a visit to `/admin/selects` with no `orgId` param is unchanged).
- **Files modified:** `components/admin/NewSelectsForm.tsx`
- **Verification:** `npx tsc --noEmit` clean; `npm run build` compiles; `npx eslint` clean.
- **Committed in:** `41c1ffa` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 Rule 3 — blocking, 1 Rule 1 — bug)
**Impact on plan:** Both were necessary for the plan's own acceptance criteria to be achievable (typed reuse of the 31-07 route without reimplementation; a functional, actually-one-click "Build Selects" hand-off). No scope creep beyond what Task 1/Task 2 required to work end-to-end.

## Issues Encountered

**Known gap, explicitly out of this plan's scope (not fixed here):** `app/(admin)/layout.tsx` still renders a standalone "Lead Engine" nav link (`/admin/lead-engine`) alongside the new "Crate Requests" link (added by 31-08). Since `/admin/lead-engine` now redirects to `/admin/crate-requests`, the sidebar currently shows two entries for what is functionally one room. This plan's instructions explicitly say "do not touch layout.tsx here," so the stale nav link was left in place — flagging it for a follow-up (likely a one-line removal in a future plan or a fast-follow) rather than silently fixing a file outside this plan's stated boundary.

## User Setup Required
None - no external service configuration required.

## Known Stubs
None. Every row action in `CrateRequestsFeed.tsx` is wired to a live route: `build_selects` links into the real 31-10 builder deep-link, `follow_up` links into the real `/admin/client-partners/{orgId}` workspace, and `see_lead` renders real signal data (kind/timestamp/count) from the 31-07 feed — no hardcoded/placeholder rows ship in this plan.

## Threat Flags

None. Both threats this plan's `<threat_model>` assigned a `mitigate` disposition to (T-31-25 feed scope, T-31-26 guest "See lead" panel) are addressed as designed: the feed never queries beyond the own-book 31-07 route (T-31-25), and the "See lead" panel renders only the route's already-anonymized signal data plus static consent-first copy — no new identity-resolution surface was introduced (T-31-26).

## Next Phase Readiness
- Every AE/BD/leadership staff role now has a live, reachable demand inbox at `/admin/crate-requests`, fed by the real own-book 31-07 route with no stub data.
- The "Build Selects" one-click action is a fully working end-to-end hand-off into the 31-10 builder (pre-filled, pre-opened form).
- The stale `/admin/lead-engine` nav link (see Issues Encountered) is a small, low-risk cleanup item for whichever plan next touches `app/(admin)/layout.tsx`.
- This closes out Slice 1's `R10` demand-inbox surface; the richer cross-client List/Board pipeline hub described in the UI-SPEC (funnel strip, next-best-action coaching, "Questions to ask") remains explicitly Phase 31.1 scope, not this plan's.

---
*Phase: 31-ae-client-workspace-selects-my-client-partners-client-partne*
*Completed: 2026-08-16*

## Self-Check: PASSED

All 5 claimed files verified present via direct filesystem check; both task commit hashes (3b4bd5c, 41c1ffa) verified present via `git cat-file -e`.
