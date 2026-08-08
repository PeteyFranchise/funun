---
phase: 26-sync-library-inclusion
plan: 07
subsystem: ui
tags: [nextjs, react, tailwind, docuseal, supabase, sync-library, e-sign]

# Dependency graph
requires:
  - phase: 26-sync-library-inclusion (26-03)
    provides: POST /api/sync-library/submit (ownership-checked, ungated self-apply submit route)
  - phase: 26-sync-library-inclusion (26-04)
    provides: POST /api/sync-library/mint-agreement (sign-once blanket-agreement mint) + lib/sync-library/agreement.ts (versioned agreement content) + lib/vault/pdf/blanket-agreement.tsx (PDF renderer)
provides:
  - "\"+ Sync Library\" owner-scoped row action + status chips in TrackList.tsx, wired to POST /api/sync-library/submit"
  - "Per-track sync_listings + hasSignedBlanketAgreement fetch in the Vault project detail page, passed to TrackList"
  - "BlanketAgreementSigningEmbed component (copies SplitSheetSigningEmbed's shell) for the single-signer blanket agreement"
  - "/sync-library/agreement signing page (server) — get-or-creates the artist's one blanket agreement and renders the embed or the completion state"
  - "lib/sync-library/mint-agreement.ts — mint-or-get core extracted out of the API route, reusable by both the route and the signing page"
affects: [26-08 (nav + hub gating, per 26-UI-SPEC.md Screen A/E), the future Sync Library hub page]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Sync-library status chip cell (SyncLibraryCell in TrackList.tsx) mirrors DocumentCard.tsx's STATUS_META / VaultProjectCard.tsx's CHIP idiom — dot + pill border, never solid fill; the pre-signed states (applied/invited/agreement_pending) get the one documented gradient exception as an interactive Link chip."
    - "Server pages call shared lib functions directly instead of self-fetching their own API route from a React Server Component (lib/sync-library/mint-agreement.ts extracted from the mint-agreement route for exactly this)."

key-files:
  created:
    - components/sync-library/BlanketAgreementSigningEmbed.tsx
    - app/(artist)/sync-library/agreement/page.tsx
    - lib/sync-library/mint-agreement.ts
  modified:
    - components/vault/TrackList.tsx
    - app/(artist)/vault/[projectId]/page.tsx
    - app/api/sync-library/mint-agreement/route.ts
    - lib/sync-library/agreement.ts

key-decisions:
  - "Gated the new TrackList row cluster on the existing canManage prop (already owner-scoped at this file's only call site) rather than adding a second prop — matches this file's existing ownership convention exactly, per plan instruction."
  - "Extracted the mint-agreement route's core logic into lib/sync-library/mint-agreement.ts so the signing page reads/mints server-side directly (no same-origin HTTP self-call with manual cookie forwarding from a Server Component) — response shapes and status codes are unchanged, and the existing route test suite (10 suites, 102 tests) still passes unmodified against the thinned route."
  - "'Covered by your Sync Library agreement' indicator keys off status === 'pending_admit' && hasSignedBlanketAgreement rather than the per-listing blanket_agreement_document_id column, because the already-signed submit path (submit/route.ts's initialStatusForEntry) inserts straight into pending_admit without ever setting that column — the boolean is the reliable signal for both paths into pending_admit."

patterns-established:
  - "SyncLibraryCell(listing, hasSignedBlanketAgreement, submitting, onSubmit) — a single component owning all sync-listing status rendering for a track row; future callers (e.g. the Sync Library hub's 'In progress' section) can reuse the same status->chip mapping instead of re-deriving it."

requirements-completed: [SYNCLIB-03, SYNCLIB-11, SYNCLIB-06]

coverage:
  - id: D1
    description: "Vault song row exposes an owner-scoped '+ Sync Library' self-apply action (ghost pill, mirrors AudioSlot) that POSTs to /api/sync-library/submit and reflects the returned listing as a status chip; non-owner viewers never see the cluster."
    requirement: SYNCLIB-03
    verification:
      - kind: unit
        ref: "app/api/sync-library/submit/route.test.ts (backing endpoint, unchanged)"
        status: pass
      - kind: other
        ref: "npx tsc --noEmit"
        status: pass
    human_judgment: true
    rationale: "UI rendering + click-to-submit interaction; no automated component/render test exists for TrackList.tsx in this codebase (matches its pre-existing test coverage gap). Verified statically (tsc, eslint) and via the backing API route's existing test suite; the row action itself needs visual/interaction confirmation."
  - id: D2
    description: "Status chips map every sync_listings status per 26-CONTEXT.md's DB-authoritative state machine (applied/invited/agreement_pending -> gradient sign chip; pending_admit -> amber 'In review' + 'Covered by your Sync Library agreement' indicator when already signed; admitted -> emerald 'Live in Sync Library'; rejected -> muted rose + optional staff reason; withdrawn/removed -> muted)."
    requirement: SYNCLIB-11
    verification:
      - kind: other
        ref: "npx tsc --noEmit"
        status: pass
    human_judgment: true
    rationale: "Status->chip visual mapping and the covered-by-agreement indicator are UI rendering logic with no automated test; needs human/UAT confirmation against 26-UI-SPEC.md's Status Chip Semantics table."
  - id: D3
    description: "Blanket-agreement signing page (/sync-library/agreement) get-or-creates the artist's one blanket agreement server-side and renders the reused Phase-17 signing shell (BlanketAgreementSigningEmbed); an already-signed artist sees the completion state directly, never a second mint."
    requirement: SYNCLIB-06
    verification:
      - kind: integration
        ref: "app/api/sync-library/mint-agreement/route.test.ts (now exercising lib/sync-library/mint-agreement.ts's extracted core — all 6 cases still pass)"
        status: pass
      - kind: other
        ref: "npx tsc --noEmit"
        status: pass
    human_judgment: true
    rationale: "The signing embed is a live DocuSeal iframe (visual/interactive) reused from SplitSheetSigningEmbed's precedent; automated coverage only reaches the underlying mint-or-get server logic, not the rendered signing/completion UI. Needs human UAT: submit a song, sign via the embed, confirm the completion panel and later Vault chip."

duration: 11min
completed: 2026-08-08
status: complete
---

# Phase 26 Plan 07: Vault Sync Library Self-Apply Surface + Signing Page Summary

**Owner-scoped "+ Sync Library" row action, status chips (including the covered-by-agreement indicator), and a reused Phase-17-shell blanket-agreement signing page at /sync-library/agreement.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-08-08T01:29:00-04:00
- **Completed:** 2026-08-08T01:40:00-04:00
- **Tasks:** 2
- **Files modified:** 7 (4 planned + 3 deviation-driven: lib/sync-library/agreement.ts, lib/sync-library/mint-agreement.ts, app/api/sync-library/mint-agreement/route.ts)

## Accomplishments
- The Vault song row now has the only pre-admission door for an uninvited artist: a ghost-pill "+ Sync Library" action (owner-scoped, mirrors the existing `AudioSlot` idiom) that submits the track and reflects its live sync-library status as a chip in place.
- Status chips cover the full DB-authoritative state machine — the pre-signed states get the documented gradient "Sign agreement"/"Continue signing" exception (links to the new signing page); pending_admit/admitted/rejected/withdrawn/removed get the dot+pill-border static chip idiom from `DocumentCard`/`VaultProjectCard`, never solid fill.
- The "Covered by your Sync Library agreement" indicator (decision #4) renders under a pending_admit chip whenever the artist already has a signed blanket agreement — covering both the "sign now, then land in pending_admit" and "already signed, skip straight to pending_admit" paths.
- `/sync-library/agreement` reuses `SplitSheetSigningEmbed`'s shell wholesale via the new `BlanketAgreementSigningEmbed`, get-or-creating the artist's one blanket agreement server-side and showing the emerald completion state directly for an already-signed artist (no second mint, no wasted DocuSeal call).

## Task Commits

Each task was committed atomically:

1. **Task 1: TrackList "+ Sync Library" row action + status chips + covered-by-agreement indicator** - `8cde2b5` (feat)
2. **Task 2: BlanketAgreementSigningEmbed + /sync-library/agreement signing page** - `acaefaf` (feat)

**Plan metadata:** (this commit) `docs(26-07): complete Vault Sync Library plan`

## Files Created/Modified
- `components/vault/TrackList.tsx` - Adds `TrackSyncStatus` type, `SyncLibraryCell` component, and the submit handler; renders the new owner-only cluster in each track row.
- `app/(artist)/vault/[projectId]/page.tsx` - Fetches this owner's own `sync_listings` rows (by track) and whether they have a signed `blanket_agreement` `vault_documents` row, passes both to `TrackList`.
- `components/sync-library/BlanketAgreementSigningEmbed.tsx` - New — copies `SplitSheetSigningEmbed`'s shell (white embed card, review prompt, emerald completion panel) for the single-signer blanket agreement.
- `app/(artist)/sync-library/agreement/page.tsx` - New — auth-gated server page; calls `mintOrGetBlanketAgreement`, renders the embed or the completion state.
- `lib/sync-library/mint-agreement.ts` - New — the mint-or-get core extracted out of the API route (see Deviations).
- `app/api/sync-library/mint-agreement/route.ts` - Thinned to an auth-gate + `NextResponse` wrapper around the extracted core; behavior/response shapes unchanged (existing route test suite passes unmodified).
- `lib/sync-library/agreement.ts` - Added the signing-surface UI copy constants (`BLANKET_AGREEMENT_REVIEW_PROMPT`, `BLANKET_AGREEMENT_SIGNED_HEADING`, `BLANKET_AGREEMENT_SIGNED_BODY`) from 26-UI-SPEC.md Screen D, alongside the existing agreement-content constants.

## Decisions Made
- Reused the existing `canManage` prop (already hardcoded owner-only at TrackList's only call site) to gate the new sync cluster, rather than inventing a second ownership prop — matches the plan's explicit instruction to follow this file's existing convention.
- The "Covered by your Sync Library agreement" indicator is driven by `status === 'pending_admit' && hasSignedBlanketAgreement`, not the per-listing `blanket_agreement_document_id` column, because the already-signed self-apply path (`submit/route.ts`'s `initialStatusForEntry`) writes straight to `pending_admit` without ever populating that column.
- Extracted `mintOrGetBlanketAgreement` out of the API route into `lib/sync-library/mint-agreement.ts` so the server page can call it directly rather than issuing a same-origin HTTP fetch back to its own API route with hand-forwarded cookies — see Deviations below.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Extracted mint-agreement's core logic into a shared lib function**
- **Found during:** Task 2 (signing page implementation)
- **Issue:** The plan's read_first pointed at `app/api/sync-library/mint-agreement/route.ts` (26-04) as what the signing page "calls" to get-or-create the agreement. A literal same-origin HTTP self-call from a React Server Component would require reconstructing an absolute URL and manually forwarding the session cookie header — fragile, and out of step with this codebase's server-first architecture ("pages fetch data server-side" per CLAUDE.md), which has no existing precedent for a server component fetching its own API route.
- **Fix:** Extracted the route's mint-or-get logic (sign-once idempotency check, gates-before-spend, PDF render, DocuSeal mint, persistence, cohort advance) into `lib/sync-library/mint-agreement.ts` as `mintOrGetBlanketAgreement(userId, userEmail)`, returning the same response shapes/status codes. `app/api/sync-library/mint-agreement/route.ts` is now a thin auth-gate wrapper around it; `app/(artist)/sync-library/agreement/page.tsx` calls the same function directly server-side.
- **Files modified:** `lib/sync-library/mint-agreement.ts` (new), `app/api/sync-library/mint-agreement/route.ts` (modified, not in this plan's `files_modified`).
- **Verification:** `npx tsc --noEmit` clean; the existing `app/api/sync-library/mint-agreement/route.test.ts` suite (6 tests covering 401/signed/pending/409/first-mint/no-esign-envelopes) passes unmodified against the thinned route, confirming behavior parity.
- **Committed in:** `acaefaf` (Task 2 commit)

**2. [Rule 3 - Blocking] Added signing-surface copy constants to lib/sync-library/agreement.ts**
- **Found during:** Task 2 (BlanketAgreementSigningEmbed / signing page)
- **Issue:** 26-UI-SPEC.md Screen D specifies exact copy (review prompt, completion heading/body) that needs a single source of truth, per this file's own header comment ("this file is the ONLY place the agreement's copy lives") and `SplitSheetSigningEmbed`'s precedent of importing `PRE_SIGNATURE_REVIEW_PROMPT` from a lib module rather than hardcoding strings in the component.
- **Fix:** Added `BLANKET_AGREEMENT_REVIEW_PROMPT`, `BLANKET_AGREEMENT_SIGNED_HEADING`, `BLANKET_AGREEMENT_SIGNED_BODY` exports to `lib/sync-library/agreement.ts`, imported by both `BlanketAgreementSigningEmbed.tsx` and the signing page's server-rendered already-signed branch.
- **Files modified:** `lib/sync-library/agreement.ts` (modified, not in this plan's `files_modified`).
- **Verification:** `npx tsc --noEmit` clean; existing `lib/sync-library/agreement.test.ts` suite passes unmodified.
- **Committed in:** `acaefaf` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 3 - blocking, both minimal/behavior-preserving extractions)
**Impact on plan:** No scope creep — both deviations were necessary to implement the page the plan specified without a fragile self-fetch pattern or copy duplication. No architecture changed; the API route's public contract (request/response shape, status codes) is byte-identical, confirmed by its unmodified test suite still passing.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required (DocuSeal wiring was already established in 26-04; this plan only consumes it).

## Next Phase Readiness
- `/sync-library/agreement` and the Vault row chips are ready for manual UAT: submit a song from the Vault, sign via the embed, confirm the chip advances after the webhook fires, and confirm a second submission after signing shows the covered-by-agreement indicator without a re-sign prompt.
- The Sync Library hub (`/sync-library`), nav item + gating, and admin curation queue are explicitly out of this plan's scope (26-08+) — the "Live in Sync Library" and "Sign agreement" chip links point at routes owned by later plans.
- Requirements SYNCLIB-03/06/11 remain provisional per the plan's own note — register in REQUIREMENTS.md before phase close (not done here per this plan's constraint that the orchestrator owns STATE/ROADMAP/REQUIREMENTS updates).

---
*Phase: 26-sync-library-inclusion*
*Completed: 2026-08-08*

## Self-Check: PASSED

All 7 code files + this SUMMARY.md confirmed present on disk; both task commits (`8cde2b5`, `acaefaf`) confirmed in `git log`.
