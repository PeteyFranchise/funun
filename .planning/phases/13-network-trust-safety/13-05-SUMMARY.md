---
phase: 13-network-trust-safety
plan: 05
subsystem: api
tags: [trust-safety, verification, privacy, admin, supabase, rls, nextjs]

requires:
  - phase: 13-network-trust-safety
    plan: 01
    provides: ProfileVisibility/OpenToVisibility/VerificationAdminAction contracts and isProfileVisibleTo/isOpenToVisibleTo helpers (lib/trust-safety/contracts.ts), migration 058 (profile_visibility/open_to_visibility/verified_at columns, verification_audit_log table — applied to live DB)
  - phase: 13-network-trust-safety
    plan: 04
    provides: verifyAdmin() admin-route gate pattern, app/(admin)/admin/* page + components/admin/* UI convention
provides:
  - Admin-only verified-badge grant/revoke (GET/PATCH /api/admin/verification[/:id]) with a full verification_audit_log trail
  - /admin/verification admin page + VerificationAdmin UI
  - Owner-facing profile/open-to visibility settings (PATCH /api/profile/visibility) plus a Privacy section in ProfileForm
  - Server-side enforcement of profile_visibility/open_to_visibility on the public profile route and People Search
affects: [13-VERIFICATION (phase-level goal-backward check)]

tech-stack:
  added: []
  patterns:
    - "Verification admin lib (lib/trust-safety/verification.ts) mirrors lib/trust-safety/admin-reports.ts's split: the route runs verifyAdmin(), the lib assumes an already-authorized service client and never re-checks auth itself"
    - "Owner-writable-but-not-authenticated-UPDATE-granted columns (profile_visibility/open_to_visibility) get their OWN dedicated API route (app/api/profile/visibility/route.ts) rather than joining the main /api/profile EDITABLE_FIELDS allowlist — mirrors the existing precedent for legal/PII fields that also route through the service client after an ownership check"
    - "Visibility enforcement reuses the SAME pure decision helpers (isProfileVisibleTo/isOpenToVisibleTo from 13-01's contracts) at every read surface (public profile route, People Search) instead of re-deriving the rule per surface — one privacy doctrine, multiple call sites"

key-files:
  created:
    - lib/trust-safety/verification.ts
    - lib/trust-safety/visibility.ts
    - app/api/admin/verification/route.ts
    - app/api/admin/verification/[id]/route.ts
    - app/api/profile/visibility/route.ts
    - components/admin/VerificationAdmin.tsx
    - app/(admin)/admin/verification/page.tsx
    - __tests__/verification-admin-api.test.ts
    - __tests__/profile-privacy-api.test.ts
  modified:
    - types/index.ts
    - lib/profile/load.ts
    - app/(artist)/settings/page.tsx
    - app/(admin)/layout.tsx
    - app/api/profile/route.ts
    - app/u/[handle]/page.tsx
    - lib/green-room/discover.ts
    - components/profile/ProfileForm.tsx
    - __tests__/green-room-discover.test.ts

key-decisions:
  - "Every verification grant/revoke writes a verification_audit_log row unconditionally, even when the action is idempotent (re-granting an already-verified profile) — an admin's explicit action is audited every time it's taken, not only on state transitions, since a single verified_at column can't capture repeated actions on its own (mirrors 13-01's rationale for the audit table's existence)"
  - "types/index.ts's ArtistProfile gained profile_visibility/open_to_visibility/verified_at as inlined literal unions rather than importing ProfileVisibility/OpenToVisibility from lib/trust-safety/contracts.ts — this file has no imports today and stays self-contained by existing convention; the value sets are kept in lockstep by hand"
  - "A connections_only profile 404s identically to a private/nonexistent one for any non-owner, non-connection viewer on the public profile route — no distinguishable 'this profile is connections-only' teaser, since 13-UI-SPEC.md defines no teaser state for this"
  - "open_to_visibility hides the field from the RENDERED data only (a shallow-copied profile with open_to: [] passed into buildProfileData) — the stored value on the row is never touched, so turning visibility back on restores the prior selections exactly, matching 13-VALIDATION.md scenario 9 ('settings retain values')"
  - "People Search (lib/green-room/discover.ts) excludes connections_only profiles from results ENTIRELY for non-connections (not just a blanked field) — mirrors the public-profile route's notFound() gate one level up, per 13-VALIDATION.md scenario 8. A hidden open_to that only matched the DB-level `.contains('open_to', ...)` filter is also excluded from results, not just blanked, so a hidden field can never be inferred by filtering on it"
  - "profile_visibility/open_to_visibility are deliberately kept OUT of app/api/profile/route.ts's EDITABLE_FIELDS mass-assignment allowlist (same treatment as verified/verified_at/verified_by) — migration 058 gives these two columns no authenticated UPDATE grant at all, so a dedicated service-role-backed route (app/api/profile/visibility/route.ts) is required regardless"

patterns-established:
  - "Trust/safety enforcement surfaces (public profile route, People Search) hoist their viewer<->owner relationship derivation ABOVE any visibility gate so the SAME query result gates both `notFound()`/exclusion decisions and downstream UI state, instead of querying relationship twice"

requirements-completed: [SAFETY-03, SAFETY-04]

coverage:
  - id: D1
    description: "Only an admin-gated route (verifyAdmin()) can grant or revoke a profile's verified badge; every action appends a verification_audit_log row (action, actor_id)"
    requirement: "SAFETY-03"
    verification:
      - kind: unit
        ref: "__tests__/verification-admin-api.test.ts (grantOrRevokeVerification, PATCH /api/admin/verification/[id] describe blocks)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The member-owned profile update route (PATCH /api/profile) silently drops verified/verified_at/verified_by from the request body even when present — never reaches the update"
    requirement: "SAFETY-03"
    verification:
      - kind: unit
        ref: "__tests__/profile-privacy-api.test.ts ('PATCH /api/profile — member-owned route cannot modify verification/visibility fields')"
        status: pass
    human_judgment: false
  - id: D3
    description: "Admin has a reachable UI (not API-only) to search members and grant/revoke verification"
    requirement: "SAFETY-03"
    verification: []
    human_judgment: true
    rationale: "No component-level render test exists for VerificationAdmin.tsx, matching this codebase's established precedent (ReportsAdmin/PlacementAdmin have no RTL render tests — no RTL setup exists in this Jest config). Visual/interaction confirmation of the search box, member rows, and grant/revoke buttons in the browser is a manual UAT item."
  - id: D4
    description: "Member can set profile visibility to public or connections_only, and open_to visibility to public/connections/hidden, via a dedicated owner-only route; the settings persist independently of each other"
    requirement: "SAFETY-04"
    verification:
      - kind: unit
        ref: "__tests__/profile-privacy-api.test.ts (validateProfileVisibilityUpdate, PATCH /api/profile/visibility describe blocks)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Public profile route (app/u/[handle]/page.tsx) enforces profile_visibility server-side: a connections_only profile 404s for non-owner/non-connection viewers with no distinguishable teaser; open_to is blanked from rendered data (not deleted from storage) per open_to_visibility"
    requirement: "SAFETY-04"
    verification: []
    human_judgment: true
    rationale: "app/u/[handle]/page.tsx is a Next.js server component with no existing render-test precedent anywhere in this codebase (confirmed: no page-level test file exists for any app/**/page.tsx). The underlying decision helpers (isProfileVisibleTo/isOpenToVisibleTo) are unit-tested in 13-01's trust-safety-contracts.test.ts, and this plan's discover.ts changes exercise the SAME helpers against a live query builder — but the page's own control flow (notFound() timing, hoisted connection-state reuse) needs a live-DB three-account exercise per 13-VALIDATION.md scenario 8, which is manual UAT, not this plan's job to close."
  - id: D6
    description: "People Search (lib/green-room/discover.ts) enforces both settings server-side: connections_only profiles are excluded from results for non-connections; a hidden open_to is blanked from the result card AND cannot be inferred by matching an openTo filter"
    requirement: "SAFETY-04"
    verification:
      - kind: unit
        ref: "__tests__/profile-privacy-api.test.ts (isDiscoverRowVisible, loadDiscoverResults — SAFETY-04 visibility filtering describe blocks)"
        status: pass
    human_judgment: false

duration: ~35min
completed: 2026-07-18
status: complete
---

# Phase 13 Plan 05: Verification & Profile Visibility Controls Summary

**Admin-only verified-badge grant/revoke with a full audit trail, plus owner-facing profile/open-to visibility settings enforced server-side on the public profile route and People Search — closing out SAFETY-03 and SAFETY-04, the last two requirements of Phase 13.**

## Performance

- **Duration:** ~35 min
- **Completed:** 2026-07-18
- **Tasks:** 2 completed
- **Files:** 9 created, 9 modified

## Accomplishments

- `lib/trust-safety/verification.ts` + `app/api/admin/verification[/:id]/route.ts`: admin-gated (`verifyAdmin()`) grant/revoke of `artist_profiles.verified`/`verified_at`, with every action — including idempotent re-grants — appending a row to `verification_audit_log` (`action`, `actor_id`). Never `select('*')` on `artist_profiles`; uses an explicit `VERIFICATION_MEMBER_COLUMNS` projection throughout.
- `app/(admin)/admin/verification/page.tsx` + `components/admin/VerificationAdmin.tsx`: a searchable admin queue for grant/revoke, mirroring `ReportsAdmin`/`PlacementAdmin`'s established filter-box/action-button pattern, plus a sidebar link.
- Confirmed (and documented + tested) that `app/api/profile/route.ts`'s pre-existing `EDITABLE_FIELDS` allowlist already made `verified`/`verified_at`/`verified_by` unreachable from the member-owned route — no code change was needed there beyond an explanatory comment and a regression test.
- `lib/trust-safety/visibility.ts` + `app/api/profile/visibility/route.ts`: owner-only PATCH for `profile_visibility` (`public`/`connections_only`) and `open_to_visibility` (`public`/`connections`/`hidden`), kept as a dedicated service-role-backed route since migration 058 gives these columns no authenticated `UPDATE` grant at all.
- `app/u/[handle]/page.tsx`: hoisted the existing connection-state derivation above the `is_public` gate so its result can also decide `isProfileVisibleTo`/`isOpenToVisibleTo` (13-01 contracts) before any further data loads — a `connections_only` profile 404s identically to a private one for non-owner/non-connection viewers; a hidden `open_to` is blanked from the rendered data without touching the stored row.
- `lib/green-room/discover.ts`: People Search now excludes `connections_only` profiles entirely for non-connections and blanks/excludes a hidden `open_to` from both the result card and any `openTo` filter match — reusing the exact same `isProfileVisibleTo`/`isOpenToVisibleTo` helpers as the public profile route.
- `components/profile/ProfileForm.tsx`: new "Privacy" section with the two visibility selects, copy per `13-UI-SPEC.md`, saving through the dedicated visibility route.
- 29 new unit tests across `__tests__/verification-admin-api.test.ts` and `__tests__/profile-privacy-api.test.ts`; fixed a false-positive PII-substring assertion in `__tests__/green-room-discover.test.ts` that the new `profile_visibility` column name (containing "pro") tripped.

## Task Commits

1. **Task 1: Add verification admin workflow** - `79cc9c7` (feat)
2. **Task 2: Add profile visibility settings** - `a121640` (feat)

**Plan metadata:** _pending — see final commit below_

## Files Created/Modified

- `lib/trust-safety/verification.ts` - Validation, admin-queue loading, and grant/revoke + audit-log write
- `lib/trust-safety/visibility.ts` - PATCH body validation for profile_visibility/open_to_visibility
- `app/api/admin/verification/route.ts` - GET admin member queue (optional `q` search)
- `app/api/admin/verification/[id]/route.ts` - PATCH grant/revoke
- `app/api/profile/visibility/route.ts` - PATCH owner-only visibility settings
- `components/admin/VerificationAdmin.tsx` - Search box + member rows + grant/revoke buttons
- `app/(admin)/admin/verification/page.tsx` - Admin verification page shell
- `app/(admin)/layout.tsx` - Added Verification nav link
- `app/api/profile/route.ts` - Documented (no functional change) why verified*/visibility fields are excluded from EDITABLE_FIELDS
- `types/index.ts` - Added profile_visibility/open_to_visibility/verified_at to ArtistProfile
- `lib/profile/load.ts`, `app/(artist)/settings/page.tsx` - Updated DEMO_PROFILE literals for the new required fields
- `app/u/[handle]/page.tsx` - Server-side profile_visibility/open_to_visibility enforcement
- `lib/green-room/discover.ts` - People Search visibility enforcement
- `components/profile/ProfileForm.tsx` - New Privacy settings section
- `__tests__/verification-admin-api.test.ts`, `__tests__/profile-privacy-api.test.ts` - New test suites
- `__tests__/green-room-discover.test.ts` - Fixed PII-substring false positive

## Decisions Made

See `key-decisions` in frontmatter — summarized:
- Every verification action is audited unconditionally, even idempotent re-grants/re-revokes.
- `ArtistProfile`'s new fields are inlined literal unions (no new import), matching `types/index.ts`'s existing self-contained convention.
- Connections-only profiles get the exact same `notFound()` as private/nonexistent ones — no teaser state.
- Hidden `open_to` blanks the rendered/returned data only; the stored setting is untouched.
- People Search excludes connections-only profiles from results entirely (not just blanks a field), matching the public profile route's severity, and never lets a hidden `open_to` leak via filter-matching.
- `profile_visibility`/`open_to_visibility` get their own dedicated route rather than joining `/api/profile`'s allowlist, since migration 058 gives them no authenticated `UPDATE` grant.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed a false-positive PII-substring test in `__tests__/green-room-discover.test.ts`**
- **Found during:** Task 2, running the full Jest suite after adding `profile_visibility`/`open_to_visibility` to `DISCOVER_PUBLIC_COLUMNS`
- **Issue:** The pre-existing `'never selects private / PII columns'` test used `expect(DISCOVER_PUBLIC_COLUMNS).not.toContain('pro')` — a substring check. `profile_visibility` legitimately contains the substring `"pro"` (from "profile"), so the test failed even though no PII column was actually added.
- **Fix:** Changed the assertion to split the column list into exact tokens and check set membership instead of substring containment — same intent (no private/PII column present), no longer fragile against unrelated column names that happen to contain a forbidden substring.
- **Files modified:** `__tests__/green-room-discover.test.ts`
- **Verification:** Full suite green (45 suites / 426 tests) after the fix.
- **Committed in:** `a121640` (Task 2 commit)

No other deviations — both tasks matched their acceptance criteria without requiring architectural changes or scope expansion. `verified`/`verified_at`/`verified_by` exclusion from the member-owned profile route required documentation + a regression test only (Rule 2 territory, but the underlying behavior already existed correctly from prior work — nothing to "fix").

## Issues Encountered

None beyond the PII-substring test fix above.

## User Setup Required

None. Migration 058 (the columns/table this plan writes to and reads from) was already confirmed applied to both local and remote databases per this plan's assignment — no DB push checkpoint is outstanding for this plan.

## Next Phase Readiness

- **SAFETY-03 is functionally satisfied:** verified-badge grant/revoke is admin-only, fully audited, and unreachable from the member-owned profile route (enforced by the pre-existing `EDITABLE_FIELDS` allowlist, now documented and regression-tested).
- **SAFETY-04 is functionally satisfied:** members control profile/open-to visibility independently via a dedicated route; both settings are enforced server-side on the two read surfaces that exist today (public profile route, People Search).
- **Live-DB / manual UAT still outstanding** (not this plan's job to close): 13-VALIDATION.md scenarios 7, 8, and 9 (admin grants verified to A and confirms A cannot self-grant; A sets connections-only and confirms exclusion from public route + search; A hides open_to and confirms it's omitted while settings retain values) require a real multi-account exercise against the live database, per this plan's `human_judgment: true` coverage entries (D3, D5).
- **13-03 (Hard Block Enforcement) remains unexecuted** and out of this plan's scope — this plan's visibility enforcement is independent of blocking; nothing here depends on or blocks 13-03.
- **Phase 13 has all five plans executed** (13-01 through 13-05). Per the assignment, this plan does NOT mark the phase itself complete in ROADMAP.md/STATE.md beyond ticking its own row — phase-level verification (13-VERIFICATION.md / goal-backward check across all five plans, including the still-unexecuted 13-03) is a separate orchestrator step.

---
*Phase: 13-network-trust-safety*
*Completed: 2026-07-18*

## Self-Check: PASSED

All created files confirmed present on disk; both task commits (`79cc9c7`, `a121640`) confirmed present in `git log --oneline --all`.
