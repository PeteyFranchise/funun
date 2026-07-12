---
phase: 09-rich-member-profile
plan: 04
subsystem: ui
tags: [react, nextjs, tailwind, web-share-api, zod, supabase]

# Dependency graph
requires:
  - phase: 09-01b
    provides: PATCH /api/profile allowlist + sanitize() branches for roles/open_to/featured_project_id/allow_resharing, sanitizeProfileRoles()/filterOpenTo()/isFeaturableProjectRow() validators, migration 043 (allow_resharing column, live on remote)
provides:
  - ShareButton component (Web-Share-first, clipboard fallback) exporting a reusable shareOrCopy() helper
  - ProfileMoreMenu component (visitor "Copy profile link" menu, Phase 13 insertion point)
  - FeaturedPicker component (owner-only, public-releases-only picker for featured_project_id)
  - ProfileForm roles/open-to/resharing editors wired to the existing PATCH /api/profile submission
  - ArtistProfile.allow_resharing added to the shared type (was missing despite the live DB column)
affects: [09-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Web Share API called synchronously as the first statement of a non-async helper (shareOrCopy), falling through to navigator.clipboard.writeText() + a 1500ms label-swap — no toast library"
    - "Lead-role-as-array-index-0 convention extended into the settings editor (Set as lead moves an entry to index 0, no is_lead/lead_role schema field)"

key-files:
  created:
    - components/profile/ShareButton.tsx
    - components/profile/ProfileMoreMenu.tsx
    - components/profile/FeaturedPicker.tsx
  modified:
    - components/profile/ProfileForm.tsx
    - app/(artist)/settings/page.tsx
    - types/index.ts
    - lib/profile/load.ts

key-decisions:
  - "ShareButton exports a shareOrCopy(url, caption, onCopied) helper (not just an internal handler) so ProfileMoreMenu's Copy-profile-link item reuses the exact same Web-Share/clipboard mechanism instead of re-implementing it"
  - "Open-to editor maps 'Brand deals' to the existing 'management' OpenTo slug — there is no dedicated brand_deals member in the OpenTo union and the plan explicitly authorized using the closest existing slug with a note"
  - "Added ArtistProfile.allow_resharing: boolean to types/index.ts — migration 043 added the live DB column and 09-01b's API allowlist already reads/writes it, but the shared type was never extended, which would have blocked ProfileForm from typing profile.allow_resharing"

patterns-established:
  - "Roles editor: preset toggle chips control membership; a separate ordered 'current badges' row (mirroring ProfileView.tsx's rendering exactly) exposes Set-as-lead/remove; array order IS the lead-role signal, matching the pre-existing ProfileView.tsx i===0 convention"

requirements-completed: [PROFILE-02, PROFILE-04, PROFILE-05, PROFILE-08]

coverage:
  - id: D1
    description: "ShareButton calls navigator.share() synchronously (no leading await) with AbortError swallowed, falling back to clipboard copy + 'Link copied!' label swap"
    requirement: "PROFILE-08"
    verification:
      - kind: unit
        ref: "grep -c 'navigator.share' components/profile/ShareButton.tsx (3 matches) && grep -c 'window.location.origin' (0 matches) && npx tsc --noEmit"
        status: pass
    human_judgment: true
    rationale: "Actual OS share-sheet behavior and Safari's user-gesture-window rejection can only be confirmed in a real browser (RESEARCH.md: manual-only, no Playwright/Cypress in this project)"
  - id: D2
    description: "ProfileMoreMenu ships exactly one functional item (Copy profile link) with a Phase 13 insertion-point comment for Report/Block — no non-functional stub"
    requirement: "PROFILE-08"
    verification:
      - kind: unit
        ref: "grep -c 'Phase 13' components/profile/ProfileMoreMenu.tsx (2 matches, both legitimate) && npx tsc --noEmit"
        status: pass
    human_judgment: false
  - id: D3
    description: "FeaturedPicker lists only the owner's public releases (never private drafts) and PATCHes featured_project_id (or null to unpin) via /api/profile"
    requirement: "PROFILE-05"
    verification:
      - kind: unit
        ref: "grep -c 'featured_project_id' components/profile/FeaturedPicker.tsx (2) && grep -Ec 'isPublic|is_public' (3) && npx tsc --noEmit"
        status: pass
    human_judgment: true
    rationale: "Visual dropdown behavior and the pinned-release reflecting correctly in the UI needs a human click-through per 09-VALIDATION.md; no E2E runner in this project"
  - id: D4
    description: "Settings roles editor (preset+custom, max 6, min 1, Set-as-lead, remove), open-to chip editor, and resharing toggle persist through PATCH /api/profile; no is_lead/lead_role field introduced"
    requirement: "PROFILE-02"
    verification:
      - kind: unit
        ref: "grep -Ec 'is_lead|lead_role' components/profile/ProfileForm.tsx (0 matches) && npx tsc --noEmit && npm run build"
        status: pass
    human_judgment: true
    rationale: "Persist-on-reload behavior for roles/open-to/resharing requires a signed-in manual click-through per 09-VALIDATION.md; this project has no API-route integration test harness"

# Metrics
duration: 25min
completed: 2026-07-12
status: complete
---

# Phase 9 Plan 04: Owner Edit Surfaces & Share/Menu/Picker Components Summary

**ShareButton (Web-Share-first + clipboard fallback), visitor ProfileMoreMenu, owner-only FeaturedPicker, and settings roles/open-to/resharing editors — all standalone, ready for Plan 05 to mount into ProfileView.tsx**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-07-12
- **Tasks:** 3
- **Files modified:** 7 (3 created, 4 modified)

## Accomplishments
- `ShareButton.tsx`: reusable Web Share API + clipboard-fallback component; exports a `shareOrCopy()` helper so other components share the exact same synchronous-first-call mechanism
- `ProfileMoreMenu.tsx`: visitor "more options" dropdown shipping exactly one item ("Copy profile link"), with a Phase 13 insertion-point comment for the future Report/Block items (SAFETY-01/02)
- `FeaturedPicker.tsx`: owner-only picker that filters to public releases only, PATCHes `featured_project_id`, and surfaces the API's friendly pre-check error in warn (amber) tone
- `ProfileForm.tsx`: new "Profile Badges & Availability" section — role-badge editor (preset multi-select + custom title, Set-as-lead, remove, min 1/max 6), open-to chip editor, and a resharing toggle, all persisting through the existing PATCH `/api/profile` submission
- Closed a type gap: `ArtistProfile.allow_resharing` was missing from `types/index.ts` despite the live migration-043 column and 09-01b's API allowlist already handling it

## Task Commits

Each task was committed atomically:

1. **Task 1: ShareButton + ProfileMoreMenu** - `9be3509` (feat)
2. **Task 2: FeaturedPicker** - `e1ea0a1` (feat)
3. **Task 3: Settings roles/open-to/resharing editors** - `c4fd9d6` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `components/profile/ShareButton.tsx` - Web-Share-first share button; exports `shareOrCopy()`
- `components/profile/ProfileMoreMenu.tsx` - visitor more-options menu, one item, Phase 13 comment
- `components/profile/FeaturedPicker.tsx` - owner-only public-releases-only featured picker
- `components/profile/ProfileForm.tsx` - roles/open-to/resharing editors added
- `app/(artist)/settings/page.tsx` - `DEMO_PROFILE` literal extended with `allow_resharing: true`
- `types/index.ts` - `ArtistProfile.allow_resharing: boolean` added
- `lib/profile/load.ts` - `DEMO_PROFILE` literal extended with `allow_resharing: true`

## Decisions Made
- `shareOrCopy()` extracted as an exported helper (not duplicated) so `ProfileMoreMenu`'s "Copy profile link" item and `ShareButton` share one implementation of the Pitfall-5 synchronous-call rule.
- "Brand deals" in the open-to editor maps to the existing `management` `OpenTo` slug (no dedicated `brand_deals` slug exists) — per the plan's explicit discretion clause.
- Roles editor combines a preset toggle-chip picker (adds/removes preset entries) with a separate ordered "current badges" row (Set-as-lead / remove / add-custom) that mirrors `ProfileView.tsx`'s exact rendering, so the two stay visually and structurally consistent.
- Added `allow_resharing` to the shared `ArtistProfile` type rather than working around it locally — this is a small, correctness-only gap-close (Rule 3), not new scope.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `ArtistProfile.allow_resharing` missing from the shared type**
- **Found during:** Task 3 (ProfileForm roles/open-to/resharing editors)
- **Issue:** Migration 043 added `artist_profiles.allow_resharing` and 09-01b's `/api/profile` PATCH allowlist already reads/writes it, but `types/index.ts`'s `ArtistProfile` type was never extended — `profile.allow_resharing` would not type-check in `ProfileForm.tsx`.
- **Fix:** Added `allow_resharing: boolean` to `ArtistProfile`; updated both `DEMO_PROFILE` literals (`app/(artist)/settings/page.tsx`, `lib/profile/load.ts`) to satisfy the now-required field.
- **Files modified:** `types/index.ts`, `app/(artist)/settings/page.tsx`, `lib/profile/load.ts`
- **Verification:** `npx tsc --noEmit` clean; `npm run build` succeeds.
- **Committed in:** `c4fd9d6` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to make Task 3 type-check; no scope creep — the field already existed in the DB and API layer, only the shared type lagged behind.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All three new components (`ShareButton`, `ProfileMoreMenu`, `FeaturedPicker`) are self-contained and ready for Plan 05 to import and mount into `ProfileView.tsx` (owner Share button wiring, visitor `⋯` menu, owner Featured-pin control).
- Settings now round-trips `roles`, `open_to`, and `allow_resharing` end-to-end through the existing PATCH `/api/profile` allowlist (09-01b) — no further API work needed for these three fields.
- Manual verification (per 09-VALIDATION.md) still pending: sign in as owner, exercise roles/open-to/resharing edits and confirm persistence on reload; confirm FeaturedPicker never surfaces a private draft; confirm ShareButton/ProfileMoreMenu behavior in a real browser (Web Share sheet vs. clipboard fallback).

---
*Phase: 09-rich-member-profile*
*Completed: 2026-07-12*

## Self-Check: PASSED

All created/modified files verified present on disk; all 3 task commit hashes (`9be3509`, `e1ea0a1`, `c4fd9d6`) confirmed in `git log --oneline --all`.
