---
phase: 27-artist-invite-only-onboarding
plan: 08
subsystem: api
tags: [nextjs, api-routes, supabase, jest, admin, staff-audit, privilege-split]

# Dependency graph
requires:
  - phase: 27-artist-invite-only-onboarding (27-01)
    provides: "artist_invites/artist_waitlist tables (migration 097), service-role-only"
  - phase: 27-artist-invite-only-onboarding (27-05)
    provides: "artistInviteEmail() / artistSpotOpenedEmail() / artistReopenedEmail() branded templates"
provides:
  - "GET+POST /api/admin/artist-invites — Team Console list + direct-invite issuance (any staff)"
  - "POST /api/admin/artist-invites/[id]/convert — waitlist row → invite (any staff, D-19-aware)"
  - "POST /api/admin/artist-invites/broadcast — Leadership-only idempotent reopen broadcast"
affects: [27-10 (admin UI that calls these three routes), 27-11 (migration-push + launch checkpoint)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Any-staff vs Leadership-only privilege split expressed as requireStaff() (default ALL_STAFF_ROLES) vs requireStaff(['leadership']), never a parallel auth path"
    - "Idempotency-by-skip: a duplicate/already-converted write short-circuits to a 200 { duplicate: true } response without a second insert, mirroring app/api/collaborators/[id]/invite's cooldown-skip convention"
    - "Idempotency-by-stamp: the reopen broadcast marks notified_reopen_at per-recipient immediately after each send attempt so a retry/double-click re-queries zero eligible rows (at-most-once semantics)"

key-files:
  created:
    - app/api/admin/artist-invites/route.ts
    - app/api/admin/artist-invites/route.test.ts
    - app/api/admin/artist-invites/[id]/convert/route.ts
    - app/api/admin/artist-invites/[id]/convert/route.test.ts
    - app/api/admin/artist-invites/broadcast/route.ts
    - app/api/admin/artist-invites/broadcast/route.test.ts
  modified: []

key-decisions:
  - "Idempotent duplicate/already-converted paths in the list+POST and convert routes skip logStaffAction (no actual write occurred) — distinct from grantOrRevokeVerification's 'log even idempotent edits' precedent, which still performs a write; this mirrors app/api/collaborators/[id]/invite's cooldown-skip convention (a true no-op is not an audited action)."
  - "Inviter display name for the direct-invite email (template A) resolves from funun_staff.display_name keyed by the acting staff user's own id — not user_profiles.artist_name (the artist-side lookup 27-06's invite/[token] route uses), since staff accounts don't carry an artist profile."
  - "Broadcast's actionLink points at /signup (not a per-recipient token) — the reopen broadcast tells waitlisters signups are open again; it is not a personal tokened invite (that stays the convert route's job, template B)."
  - "Convert route never reads unsubscribed_at — D-19 makes it structurally impossible for the convert path to suppress a personal invite; only the broadcast route's query filters on that column."

patterns-established:
  - "Team Console admin-mutation routes: requireStaff() (with an explicit allowed-role array when the action isn't any-staff) BEFORE createServiceClient(), unconditional logStaffAction() on every real write, best-effort sendEmail() that never blocks the response."

requirements-completed: [INVITE-03, INVITE-08]

coverage:
  - id: D1
    description: "Any Team Member can list the waitlist/invites and issue an individual invite (GET+POST /api/admin/artist-invites), gated by requireStaff() with no role restriction"
    requirement: "INVITE-03"
    verification:
      - kind: unit
        ref: "app/api/admin/artist-invites/route.test.ts — GET returns both lists / 403 non-staff / 401 unauthenticated; POST creates + sends + audits / 403 non-staff / 400 invalid email"
        status: pass
    human_judgment: false
  - id: D2
    description: "Invites are unlimited — no per-inviter cap or quota is enforced"
    requirement: "INVITE-03"
    verification:
      - kind: unit
        ref: "app/api/admin/artist-invites/route.ts — POST has no quota/count check against invited_by_user_id anywhere in the handler (structural: reviewed against RESEARCH D-07)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Any Team Member can convert a waitlist entry to an invite; a 'spot opened' email sends (D-13a)"
    requirement: "INVITE-08"
    verification:
      - kind: unit
        ref: "app/api/admin/artist-invites/[id]/convert/route.test.ts — creates invite + stamps converted_to_invite_at + sends template B + audits"
        status: pass
    human_judgment: false
  - id: D4
    description: "Convert stays enabled and still sends for an unsubscribed waitlist row (D-19 — personal invites always reach)"
    requirement: "INVITE-08"
    verification:
      - kind: unit
        ref: "app/api/admin/artist-invites/[id]/convert/route.test.ts — 'still sends the email for an unsubscribed row (D-19)'"
        status: pass
    human_judgment: false
  - id: D5
    description: "Only Leadership can trigger the reopen broadcast; AE/BD get 403"
    requirement: "INVITE-08"
    verification:
      - kind: unit
        ref: "app/api/admin/artist-invites/broadcast/route.test.ts — asserts requireStaff(['leadership']) called; AE/BD (mocked Forbidden) -> 403 before service client touched"
        status: pass
    human_judgment: false
  - id: D6
    description: "Reopen broadcast is idempotent (skips already-notified rows) and excludes opted-out recipients"
    requirement: "INVITE-08"
    verification:
      - kind: unit
        ref: "app/api/admin/artist-invites/broadcast/route.test.ts — query filter assertions (unsubscribed_at IS NULL, notified_reopen_at IS NULL); 'a second broadcast (no eligible rows left) sends 0'"
        status: pass
    human_judgment: false
  - id: D7
    description: "Every invite/convert/broadcast action writes through logStaffAction"
    requirement: "INVITE-08"
    verification:
      - kind: unit
        ref: "all three route.test.ts files assert logStaffAction called with the correct action/targetType/changes on every real (non-duplicate/non-idempotent-skip) write"
        status: pass
    human_judgment: false
  - id: D8
    description: "npm run build produces the three route entries in the dynamic route manifest; tsc --noEmit and the full jest suite are clean"
    verification:
      - kind: other
        ref: "npm run build (routes /api/admin/artist-invites, /api/admin/artist-invites/[id]/convert, /api/admin/artist-invites/broadcast all present); npx tsc --noEmit clean; npm test — 160 suites / 1841 tests passing"
        status: pass
    human_judgment: false

# Metrics
duration: ~30min
completed: 2026-08-09
status: complete
---

# Phase 27 Plan 08: Team Console Admin Routes — Waitlist List, Convert-to-Invite, Reopen Broadcast Summary

**Three Team Console backend routes implementing D-06/D-13/D-15's staff surfaces — any-staff list+direct-invite, any-staff waitlist-to-invite conversion (D-19-correct: sends even to unsubscribed rows), and a Leadership-only, idempotent, opt-out-aware reopen broadcast — each gated by `requireStaff()` before any service-role DB access and unconditionally audited via `logStaffAction`.**

## Performance

- **Duration:** ~30 min
- **Completed:** 2026-08-09
- **Tasks:** 3/3
- **Files modified:** 6 (all new)

## Accomplishments
- `GET+POST /api/admin/artist-invites` — any staff can list the full waitlist + invite tables (column-explicit selects, never `select('*')`) and issue a direct tokened invite (`source='staff'`) that sends template A (`artistInviteEmail`) with a "invited by [staff display name]" line resolved best-effort from `funun_staff.display_name`. Duplicate pending invites for the same email are idempotent — no second row, no re-send.
- `POST /api/admin/artist-invites/[id]/convert` — any staff converts a single `artist_waitlist` row into a tokened `artist_invites` row (`source='waitlist_conversion'`), stamps `converted_to_invite_at`, and sends template B (`artistSpotOpenedEmail`) **unconditionally**, including for unsubscribed rows (D-19: a Team-Member conversion is a personal, relationship-based send, not the commercial broadcast). Unknown id → 404; already-converted → idempotent skip (no duplicate invite, no re-send).
- `POST /api/admin/artist-invites/broadcast` — **Leadership only** (`requireStaff(['leadership'])`; AE/BD → 403). Selects `artist_waitlist` rows where `unsubscribed_at IS NULL AND notified_reopen_at IS NULL`, sends template C (`artistReopenedEmail`, with each row's own unsubscribe link built from `unsubscribe_token`) to each, and stamps `notified_reopen_at` per-recipient immediately after the send attempt — so a retry or double-click re-queries zero eligible rows and sends 0 (at-most-once semantics, RESEARCH Pitfall 6 / T-27-14).
- All three routes call `logStaffAction` on every real write (`artist_invite.create` / `artist_invite.convert` / `artist_invite.broadcast`), satisfying the staff-audit precedent (T-27-15) — idempotent no-op/skip paths intentionally do not double-log, since no write actually occurred on those branches.
- 17 new tests across the three route test files, all green; full repo suite (160 suites / 1841 tests) and `npx tsc --noEmit` also verified clean after this plan; `npm run build` lists all three routes in the dynamic route manifest.

## Task Commits

Each task was committed atomically:

1. **Task 1: GET+POST /api/admin/artist-invites — list + issue individual invite (any staff)** - `2daffb0` (feat)
2. **Task 2: POST /api/admin/artist-invites/[id]/convert — waitlist → invite (any staff)** - `062a37b` (feat)
3. **Task 3: POST /api/admin/artist-invites/broadcast — Leadership-only idempotent reopen** - `3673bc1` (feat)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified
- `app/api/admin/artist-invites/route.ts` - GET (list waitlist+invites, any staff) + POST (direct tokened invite, any staff, template A, idempotent on duplicate pending)
- `app/api/admin/artist-invites/route.test.ts` - 7 tests: GET staff/non-staff/unauthenticated, POST create+email+audit, POST duplicate idempotency, POST 403/400
- `app/api/admin/artist-invites/[id]/convert/route.ts` - POST (waitlist → invite, any staff, template B, sends even when unsubscribed per D-19)
- `app/api/admin/artist-invites/[id]/convert/route.test.ts` - 5 tests: convert+stamp+email+audit, unsubscribed-row send, 404 unknown id, idempotent re-convert, 403 non-staff
- `app/api/admin/artist-invites/broadcast/route.ts` - POST (Leadership-only, opt-out+idempotency-filtered bulk send of template C, per-row `notified_reopen_at` stamp)
- `app/api/admin/artist-invites/broadcast/route.test.ts` - 5 tests: eligible-rows send+audit, exclusion-filter query assertions, idempotent second-call sends 0, 403 AE/BD, 401 unauthenticated

## Decisions Made
- **Idempotent skip paths do not call `logStaffAction`.** A duplicate-pending-invite POST and an already-converted convert POST perform no actual database write — they mirror `app/api/collaborators/[id]/invite`'s cooldown-skip convention (`{ ok: true, skipped: true }` without an audit entry) rather than `grantOrRevokeVerification`'s "log even idempotent edits" precedent, which still executes a real `UPDATE` on every call. Since neither skip path here executes any write, there is nothing to audit.
- **Inviter display name resolves from `funun_staff.display_name`, not `user_profiles.artist_name`.** 27-06's `invite/[token]` resolver looks up `user_profiles.artist_name` because collaborator-invite inviters are artists; staff inviters here have no artist profile, so this plan adds a parallel best-effort resolver keyed by `funun_staff.user_id` instead.
- **Broadcast's `actionLink` is a bare `/signup` link, not a per-recipient token.** The reopen broadcast is a "we're open again" announcement (D-13b), not a personal tokened invite — recipients follow the same allowlist/waitlist path any other founder-cohort visitor would. A personal, tokened invite is exactly what the convert route (template B) already provides per-person.
- **Convert never reads or branches on `unsubscribed_at`.** Rather than reading the flag and special-casing "send anyway," the convert route simply never queries that column at all — making D-19's "personal invites always reach" guarantee structurally true (there's no code path that could suppress it) rather than merely tested.

## Deviations from Plan

None — plan executed exactly as written. All three `<action>` specs, `<behavior>` blocks, and `<acceptance_criteria>` bullets are satisfied verbatim; no architectural changes, no missing critical functionality discovered, no blocking issues encountered.

## Threat Model Compliance

- **T-27-06 (Elevation of Privilege, high, mitigate):** Verified — `broadcast/route.ts` calls `requireStaff(['leadership'])`; `route.ts` and `[id]/convert/route.ts` call `requireStaff()` (default `ALL_STAFF_ROLES`). All three call the gate before any `createServiceClient()` reference. Test-asserted: AE/BD get 403 on broadcast; unauthenticated gets 401 on all three.
- **T-27-14 (Denial of Service / Reputation, high, mitigate):** Verified — `notified_reopen_at` is stamped per-recipient immediately after each send attempt; a re-run's query returns zero eligible rows (test: "a second broadcast (no eligible rows left) sends 0").
- **T-27-15 (Repudiation, medium, mitigate):** Verified — `logStaffAction` is called on every real write across all three routes with a descriptive `action` string and `changes` payload.
- **T-27-SC (Tampering via installs, low, accept):** No new packages installed by this plan.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required by this plan. `RESEND_API_KEY`/`RESEND_FROM_EMAIL` (read inside `sendEmail`) and the still-unpushed migrations 097/098 remain 27-11's launch-checkpoint concern, unchanged from prior plans in this phase; these routes degrade gracefully (`emailSent: false` / best-effort no-throw) when email isn't configured, and are pure application code against tables that already exist in this repo's migration history.

## Next Phase Readiness
- All three routes are ready for 27-10's admin UI (`components/admin/ArtistInvitesAdmin.tsx` + `app/(admin)/admin/artist-invites/page.tsx`) to call directly — response shapes (`{ waitlist, invites }`, `{ ok, data, emailSent }`, `{ sent }`) are stable and tested.
- No blockers for 27-09/27-10/27-11.

---
*Phase: 27-artist-invite-only-onboarding*
*Completed: 2026-08-09*

## Self-Check: PASSED

All 6 created files verified present on disk; all 3 task commits (2daffb0, 062a37b, 3673bc1) verified present in `git log`.
