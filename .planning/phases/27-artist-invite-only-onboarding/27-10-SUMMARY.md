---
phase: 27-artist-invite-only-onboarding
plan: 10
subsystem: ui
tags: [nextjs, admin, team-console, fncon, privilege-split]

# Dependency graph
requires:
  - phase: 27-artist-invite-only-onboarding (27-08)
    provides: "GET+POST /api/admin/artist-invites, POST .../[id]/convert, POST .../broadcast"
provides:
  - "Team Console Artist Invites page at /admin/artist-invites (D-14)"
  - "ArtistInvitesAdmin.tsx — waitlist list, live search, any-staff convert, leadership-only broadcast (D-06/D-15/D-19)"
  - "All-staff nav link to Artist Invites"
affects: [27-11 (migration-push + launch checkpoint, live UAT of this surface)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server-resolved isLeadership boolean prop (never CSS-hidden) gates the page-level Reopen & broadcast action, matching AdminLayout's own isLeadership derivation"
    - "Two-step inline destructive confirm (CollaboratorForm delete-confirm pattern) reused verbatim for the one-shot bulk broadcast"
    - "timeAgo() relative-timestamp helper duplicated from CollaboratorCard for the row-level 'Invited Xh ago' chip"

key-files:
  created:
    - app/(admin)/admin/artist-invites/page.tsx
    - components/admin/ArtistInvitesAdmin.tsx
  modified:
    - app/(admin)/layout.tsx

key-decisions:
  - "initialInvites is accepted as a prop (per plan's artifact contract and the page's dual fetch) but the component's per-row 'Invited' chip derives from the waitlist row's own converted_to_invite_at timestamp rather than cross-referencing the separate invites list — simpler, avoids an email-matching join in the client, and the waitlist row is the only place D-19's unsubscribed chip + convert action need to reason about state together."
  - "Search input reuses StaffAdmin's existing bg-[color:var(--panel-2)]/border-[color:var(--border)] input treatment rather than a literal var(--input) token — no such CSS custom property exists anywhere in components/admin/console-theme.ts; the UI-SPEC's 'var(--input) bg' phrasing is descriptive intent, not a literal token name, confirmed by grep against the theme file."
  - "Eligible-broadcast count shown in the two-step confirm ('Send this to {N} people…') is computed client-side by mirroring the broadcast route's own query predicate (unsubscribed_at IS NULL AND notified_reopen_at IS NULL) against the already-fetched waitlist array, rather than a dedicated count endpoint — avoids a second network round-trip for a number the route already enforces server-side."

requirements-completed: [INVITE-08, INVITE-09]

coverage:
  - id: D1
    description: "The Team Console has an Artist Invites page at /admin/artist-invites, reachable from the all-staff nav section"
    requirement: "INVITE-09"
    verification:
      - kind: other
        ref: "npm run build lists /admin/artist-invites in the route manifest; grep confirms the nav link lives in app/(admin)/layout.tsx's all-staff section (outside the isLeadership block)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Any staff sees the waitlist with a per-row Convert to invite action; only Leadership sees the page-level Reopen & broadcast action, gated by a server-resolved isLeadership prop"
    requirement: "INVITE-08"
    verification:
      - kind: other
        ref: "page.tsx passes isLeadership={role === 'leadership'} (server-resolved via getStaffRole); ArtistInvitesAdmin.tsx renders the broadcast block only inside {isLeadership && (...)}, never a CSS class toggle"
        status: pass
    human_judgment: true
  - id: D3
    description: "Opted-out rows show an Unsubscribed chip but keep Convert to invite enabled"
    requirement: "INVITE-08"
    verification:
      - kind: other
        ref: "ArtistInvitesAdmin.tsx row render: isUnsubscribed only adds a rose pill; the Convert button's disabled state is driven solely by isConverting, never by isUnsubscribed"
        status: pass
    human_judgment: true
  - id: D4
    description: "A search filters the waitlist by name+email live; a search-specific empty state shows when nothing matches"
    requirement: "INVITE-09"
    verification:
      - kind: other
        ref: "useMemo filter over `${name} ${email}`.toLowerCase().includes(query); distinct 'No one on the waiting list matches that search.' render path vs. the never-populated empty state"
        status: pass
    human_judgment: true
  - id: D5
    description: "npm run build / tsc --noEmit clean"
    verification:
      - kind: other
        ref: "npx tsc --noEmit: no output (clean); npm run build: /admin/artist-invites + all three /api/admin/artist-invites* routes present in the manifest; npx eslint on all three changed/created files: exit 0"
        status: pass
    human_judgment: false

# Metrics
duration: ~25min
completed: 2026-08-09
status: complete
---

# Phase 27 Plan 10: Team Console Artist Invites UI + Nav Summary

**Team Console `/admin/artist-invites` page + `ArtistInvitesAdmin.tsx` client component delivering UI-SPEC surface 5: live name/email search over the waitlist, an any-staff "Convert to invite" row action, a Leadership-only two-step "Reopen & notify waitlist" broadcast gated by a server-resolved `isLeadership` prop, and an "Unsubscribed" chip on opted-out rows that never disables Convert — plus the all-staff nav link.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-08-09
- **Tasks:** 2/2
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments
- `app/(admin)/admin/artist-invites/page.tsx` — server component mirroring the `team-members` page shell exactly (`force-dynamic`, `createServerClient()` + `getUser()` redirect, `getStaffRole(user)` any-staff gate redirecting only when the visitor has no staff role at all — unlike `team-members`' leadership-only gate). Fetches both `artist_waitlist` and `artist_invites` via `createServiceClient()` with column-explicit selects (never `select('*')`), ordered `created_at desc`, and passes `initialWaitlist`, `initialInvites`, and `isLeadership={role === 'leadership'}` into the client component.
- `components/admin/ArtistInvitesAdmin.tsx` — themed `.fncon` list on `var(--panel)`/`var(--border)` tokens (StaffAdmin's exact row treatment). A live, case-insensitive name+email search filters client-side with a magnifier-glyph input, showing `"N matches"` while searching or `"Showing N of M"` at rest, and a search-specific empty state distinct from the never-populated empty state. Each row shows a small `.fncon-cta` gradient "Convert to invite" button (any staff) that POSTs `/api/admin/artist-invites/[id]/convert` and flips to an `"Invited {timeAgo}"` chip on success (`timeAgo()` ported verbatim from `CollaboratorCard`). Unsubscribed rows (`unsubscribed_at` set) show a small rose "Unsubscribed" pill but the Convert button's disabled state is never coupled to that flag (D-19). The Leadership-only block renders strictly from the `isLeadership` prop and contains a "Reopen & notify waitlist" button that opens a two-step inline confirm — `"Send this to {N} people on the waiting list? This can't be undone."` + solid `bg-rose-500/90 hover:bg-rose-500` "Yes, send" + text-only "Cancel" — mirroring `CollaboratorForm`'s delete-confirm exactly, then POSTs `/api/admin/artist-invites/broadcast` and shows a `"Sent to N people."` success line.
- `app/(admin)/layout.tsx` — added the "Artist Invites" link inside the all-staff nav block (next to "My Client Partners"/"Directory"), explicitly outside the `isLeadership &&` conditional, matching D-06's "any Team Member manages individual invites."
- `npm run build` lists `/admin/artist-invites` (and the three 27-08 API routes) in the route manifest; `npx tsc --noEmit` and `npx eslint` on all three changed/created files are clean.

## Task Commits

Each task was committed atomically:

1. **Task 1: /admin/artist-invites page + all-staff nav link** - `7e89e6b` (feat)
2. **Task 2: ArtistInvitesAdmin.tsx — list, search, convert, unsubscribed chip, leadership broadcast** - `c032ab4` (feat)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified
- `app/(admin)/admin/artist-invites/page.tsx` - new server component page: any-staff gate, dual service-client fetch (waitlist + invites), `isLeadership` prop-through
- `components/admin/ArtistInvitesAdmin.tsx` - new client component: search, waitlist rows, any-staff convert, unsubscribed chip, leadership-only two-step broadcast confirm
- `app/(admin)/layout.tsx` - added the Artist Invites link to the all-staff nav section

## Decisions Made
- **Per-row "Invited" state derives from the waitlist row's own `converted_to_invite_at`, not a join against `initialInvites`.** The component still accepts and types `initialInvites` per the plan's artifact contract (the page fetches both lists via the 27-08-shaped response), but rendering the row-level conversion chip off the waitlist row's own timestamp avoids an email-matching join in the client and keeps the unsubscribed-chip + convert-button state (D-19) reasoning about a single row shape.
- **No literal `var(--input)` CSS token exists in `console-theme.ts`** (confirmed by grep) — the search input reuses the exact `bg-[color:var(--panel-2)]` / `border-[color:var(--border)]` treatment already shipped in `StaffAdmin.tsx`'s inputs, which is what the UI-SPEC's "themed `var(--input)` bg" phrasing was pointing at.
- **The two-step confirm's eligible-count is computed client-side** by mirroring the broadcast route's own `unsubscribed_at IS NULL AND notified_reopen_at IS NULL` predicate against the already-fetched waitlist array, avoiding a dedicated count round-trip for a number the server independently enforces.

## Deviations from Plan

None — plan executed exactly as written. Both tasks' `<action>` specs and `<acceptance_criteria>` bullets are satisfied verbatim; no architectural changes, no missing critical functionality discovered, no blocking issues encountered.

## Threat Model Compliance

- **T-27-06 (Elevation of Privilege, high, mitigate):** Verified — the "Reopen & broadcast" button is rendered only inside `{isLeadership && (...)}` in `ArtistInvitesAdmin.tsx`, where `isLeadership` is a boolean computed server-side in `page.tsx` from `getStaffRole(user) === 'leadership'`; there is no CSS class or `display:none` gating. The broadcast route itself (27-08) independently enforces `requireStaff(['leadership'])`, so this UI gate is defense-in-depth, not the sole boundary.
- **T-27-16 (Elevation of Privilege, non-staff reaching the admin page, high, mitigate):** Verified — `page.tsx` runs its own `getUser()` + `getStaffRole()` redirect (any staff role admitted, non-staff → `/`), on top of the layout's own gate (`app/(admin)/layout.tsx`), matching the `team-members` precedent of not relying on the layout redirect alone.
- **T-27-SC (Tampering via installs, low, accept):** No new packages installed by this plan.

## Issues Encountered

None.

## User Setup Required

None — this plan is pure application code against the already-shipped 27-08 API routes and the already-migrated (but not yet pushed) `artist_invites`/`artist_waitlist` tables. The still-unpushed migrations 097/098 and `RESEND_API_KEY`/`RESEND_FROM_EMAIL` configuration remain 27-11's launch-checkpoint concern, unchanged from prior plans in this phase.

## Next Phase Readiness
- The Team Console surface for D-14/D-06/D-15/D-19 is fully built and wired to the 27-08 routes; ready for 27-11's live UAT checkpoint (exercising convert + the two-step broadcast confirm against a real staff session once migrations 097/098 are pushed).
- No blockers for 27-11.

---
*Phase: 27-artist-invite-only-onboarding*
*Completed: 2026-08-09*

## Self-Check: PASSED

All 3 created/output files verified present on disk; both task commits (7e89e6b, c032ab4) verified present in `git log`.
