---
phase: 06-playlist-curator-pitching
plan: 05
subsystem: api
tags: [nextjs, supabase, magic-link-auth, curator-portal, mass-assignment-protection, idor-mitigation]

# Dependency graph
requires:
  - phase: 06-01
    provides: curators/pitch_history tables (RLS-enabled), claim_token/claim_token_expires_at/claimed_by columns, handle_new_user() curator branch, Curator/PitchHistory/PitchStatus types
  - phase: 06-02
    provides: verifyAdmin() reuse pattern, ADMIN_EDITABLE_FIELDS/CURATOR_SELF_EDITABLE_FIELDS/PLATFORM_VALUES/PLATFORM_LABELS from lib/curators/schema.ts, hasSignificantDrift()
  - phase: 06-04
    provides: generateClaimToken()/CLAIM_TOKEN_EXPIRY_HOURS from lib/curators/tokens.ts, sendEmail() from-override, PitchHistoryList component shape
provides:
  - "Claim-invite issuance (admin PATCH action issue_claim -- 72h claim_token + expiry)"
  - "POST /api/curators/claim/[token] -- token verify, curator-role account creation at createUser() time, magic-link send"
  - "Public /curators/claim/[token] (valid-token CTA) and /curators/claim (bare landing page for the portal's unauthenticated redirect)"
  - "PATCH /api/curators/[id] -- curator self-serve edit, CURATOR_SELF_EDITABLE_FIELDS allowlist + claimed_by ownership scoping + drift recompute"
  - "(curator-portal) route group -- own-layout-gated /portal with profile form + read-only pitches-received view"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Curator magic-link account creation sets app_metadata.role='curator' AT admin.createUser() time (never a post-insert UPDATE) so handle_new_user()'s curator branch (06-01) fires and skips artist_profiles/subscriptions"
    - "Curator-portal auth is layout-only, deliberately absent from middleware.ts isProtected -- a third auth tier (public / artist / curator) alongside the existing admin pattern"
    - "PitchHistoryList gained an optional emptyState override (backward-compatible) so one display component serves both the artist-facing launchpad history and the curator-portal read-only view"

key-files:
  created:
    - app/api/curators/claim/[token]/route.ts
    - app/curators/claim/[token]/page.tsx
    - app/curators/claim/page.tsx
    - components/curators/ClaimButton.tsx
    - app/api/curators/[id]/route.ts
    - app/(curator-portal)/layout.tsx
    - app/(curator-portal)/portal/page.tsx
    - components/curators/CuratorProfileForm.tsx
  modified:
    - app/api/admin/curators/[id]/route.ts
    - components/curators/PitchHistoryList.tsx

key-decisions:
  - "Added components/curators/ClaimButton.tsx (a small client island) so app/curators/claim/[token]/page.tsx could stay an async server component doing the token-validity check, while still supporting the plan's required client-side POST + check-your-email confirmation UX"
  - "Added a bare app/curators/claim/page.tsx landing page so the curator-portal layout's unauthenticated redirect has a real destination instead of 404ing -- the plan's reference pattern names /curators/claim or a curator sign-in path but that bare route did not exist yet"
  - "On an admin.createUser() email conflict (curator's email already belongs to an existing auth.users row, e.g. a prior artist account), the claim route reuses the existing user id for claimed_by via generateLink() rather than failing -- per RESEARCH Open Question 4, it does not touch that account's existing role/profile"

requirements-completed: [PITCH-05, PITCH-04]

coverage:
  - id: D1
    description: "Admin can issue a curator a claim invite (72h claim_token + expiry) without disturbing existing 06-02 PATCH behavior (field edits, drift, resetBaseline, reach refetch)"
    requirement: "PITCH-05"
    verification:
      - kind: unit
        ref: "grep -Eq 'issue_claim|generateClaimToken|claim_token_expires_at' app/api/admin/curators/[id]/route.ts; npm run build -- no type errors"
        status: pass
    human_judgment: false
  - id: D2
    description: "Claiming creates a curator auth account with app_metadata.role='curator' set at createUser() time, sets claimed_by, nulls claim_token, and sends a magic link via lib/email (not Supabase templates); invalid/expired/already-claimed tokens return 404/410"
    requirement: "PITCH-05"
    verification:
      - kind: unit
        ref: "grep -Eq \"app_metadata.*role.*curator\" app/api/curators/claim/[token]/route.ts; grep -q createUser app/api/curators/claim/[token]/route.ts; npm run build -- no type errors"
        status: pass
    human_judgment: true
    rationale: "The critical correctness property -- that a claimed curator's auth.users row does NOT also acquire an artist_profiles/subscriptions row via handle_new_user() -- depends on migration 030's live DB trigger behavior. This sandbox has no Supabase CLI credentials (per 06-01's SUMMARY) to exercise a live claim end-to-end against the real database; the code-level guarantee (app_metadata set at createUser() time, verified by grep + code review) is in place, but the live-DB assertion needs a human to run the claim flow against the deployed database and confirm no artist_profiles row appears."
  - id: D3
    description: "A claimed curator can self-edit only genre_focus/platform/playlist_url/playlist_name/submission_notes on their own row; email_valid/flagged_inactive/reach_signal/claimed_by in the request body are dropped; editing genre_focus recomputes drift_flagged"
    requirement: "PITCH-04"
    verification:
      - kind: unit
        ref: "grep -Eq CURATOR_SELF_EDITABLE_FIELDS app/api/curators/[id]/route.ts; grep -Eq \"role.*curator\" app/api/curators/[id]/route.ts; grep -q claimed_by app/api/curators/[id]/route.ts; grep -q hasSignificantDrift app/api/curators/[id]/route.ts; npm run build -- no type errors"
        status: pass
    human_judgment: false
  - id: D4
    description: "The curator portal has its own layout auth gate (app_metadata.role==='curator'), is not added to middleware.ts's protected list, and an unauthenticated/non-curator visitor is redirected to a curator-specific flow (never the artist /signin)"
    requirement: "PITCH-05"
    verification:
      - kind: unit
        ref: "grep -Eq \"role.*curator\" 'app/(curator-portal)/layout.tsx'; test -z \"$(grep -E 'curator-portal|/portal' middleware.ts)\"; grep -Lq email_valid components/curators/CuratorProfileForm.tsx; grep -q 'No pitches yet' 'app/(curator-portal)/portal/page.tsx'; npm run build -- no type errors"
        status: pass
    human_judgment: true
    rationale: "Build-time route registration, grep-based copy/gate checks, and code review of the redirect targets were verified automatically. A live sign-in as a claimed curator (via a real magic-link session) exercising the /portal profile-edit save round trip and the pitches-received list against the live database was not performed in this sandbox -- no live Supabase session/browser available here."

# Metrics
duration: ~35min
completed: 2026-07-02
status: complete
---

# Phase 06 Plan 05: Curator Claim Flow + Self-Serve Portal Summary

**Curator claim-token issuance and public claim flow that creates a curator-role magic-link Supabase account (app_metadata.role set at createUser() time so handle_new_user() skips artist_profiles), plus a self-serve `(curator-portal)` route group where claimed curators edit an allowlisted subset of their profile and view a read-only pitches-received list**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-07-02T01:45:00Z (approx.)
- **Completed:** 2026-07-02T02:24:55Z
- **Tasks:** 3 (all `type="auto"`)
- **Files modified:** 10 (8 created, 2 modified)

## Accomplishments
- `app/api/admin/curators/[id]/route.ts` gained an `issue_claim` PATCH action: generates a `generateClaimToken()` value, sets `claim_token` + `claim_token_expires_at` (now + `CLAIM_TOKEN_EXPIRY_HOURS` = 72h) without touching `claimed_by`, and returns a shareable `/curators/claim/{token}` URL — all existing 06-02 PATCH behavior (field edits, drift recompute, `resetBaseline`, reach refetch) is untouched
- `app/api/curators/claim/[token]/route.ts` verifies the token (404 invalid, 410 already-claimed, 410 expired), then creates the curator's Supabase auth account via `service.auth.admin.createUser({ email, email_confirm: true, app_metadata: { role: 'curator' } })` — setting `app_metadata.role` **at creation time** so migration 030's `handle_new_user()` curator branch fires and no `artist_profiles`/`subscriptions` row is created (RESEARCH Pitfall 1 / T-06-01), then sets `claimed_by`, nulls the one-time token, and sends the actual sign-in link via `lib/email`'s `sendEmail()` (not Supabase's built-in template) — gracefully reusing an existing `auth.users` row's id on an email conflict rather than failing
- `app/curators/claim/[token]/page.tsx` is a public server component (outside `middleware.ts`'s `isProtected` list) that server-verifies token validity and either renders the "Claim your curator profile" CTA (via a new small client island, `components/curators/ClaimButton.tsx`, for the POST + "check your email" confirmation) or muted expired/used copy with no CTA
- `app/api/curators/[id]/route.ts` is the curator self-serve PATCH: 401 unauthenticated, 403 unless `app_metadata.role === 'curator'`, update object built strictly from `CURATOR_SELF_EDITABLE_FIELDS` (never a body spread — `email_valid`/`flagged_inactive`/`reach_signal`/`claimed_by` are dropped, T-06-06), write scoped with an explicit `.eq('claimed_by', user.id)` on top of the RLS UPDATE policy (T-06-05 IDOR defense-in-depth), and recomputes `drift_flagged` via `hasSignificantDrift()` when `genre_focus` changes
- `app/(curator-portal)/layout.tsx` runs its own `getUser()` + `app_metadata.role === 'curator'` check and is deliberately absent from `middleware.ts`'s `isProtected` array (RESEARCH Pitfall 3 / T-06-14) — an unauthenticated visitor redirects to `/curators/claim`, never the artist `/signin`; a non-curator authenticated user redirects to `/`
- `app/(curator-portal)/portal/page.tsx` re-verifies session + role, loads the caller's own curator row and their received `pitch_history` rows (service client, explicitly scoped to `claimed_by`/`curator_id` — `pitch_history` has no curator-facing RLS SELECT policy), and renders `CuratorProfileForm` + a read-only `PitchHistoryList` with the locked "No pitches yet" / "When artists pitch your playlist, you'll see them here." empty-state copy
- `components/curators/CuratorProfileForm.tsx` exposes only the five allowlisted fields (platform select, playlist name/URL, genre-focus tag input, submission notes) — no input for `email_valid`, `flagged_inactive`, `reach_signal`, or `claimed_by` anywhere in the form (absent, not disabled, per T-06-06/UI-SPEC)

## Task Commits

Each task was committed atomically:

1. **Task 1: Claim-token issuance (admin) + public claim verify/create API + claim page** - `80d15c8` (feat)
2. **Task 2: Curator self-serve PATCH API (allowlist + ownership + drift)** - `c3f8cb3` (feat)
3. **Task 3: Curator portal — layout auth gate + profile form + pitches-received view** - `dc66175` (feat)

**Plan metadata:** committed alongside this SUMMARY (docs: complete plan)

## Files Created/Modified
- `app/api/admin/curators/[id]/route.ts` - added `issue_claim` PATCH action (claim-token issuance)
- `app/api/curators/claim/[token]/route.ts` - claim verify + curator-role account creation + magic-link send
- `app/curators/claim/[token]/page.tsx` - public claim page (server component, token-validity check)
- `app/curators/claim/page.tsx` - bare landing page (portal layout's unauthenticated redirect target)
- `components/curators/ClaimButton.tsx` - client island for the claim POST + confirmation state
- `app/api/curators/[id]/route.ts` - curator self-serve PATCH (allowlist + ownership + drift)
- `app/(curator-portal)/layout.tsx` - own session + role auth gate, deliberately outside middleware.ts
- `app/(curator-portal)/portal/page.tsx` - profile form + read-only pitches-received view
- `components/curators/CuratorProfileForm.tsx` - allowlisted self-edit form
- `components/curators/PitchHistoryList.tsx` - added optional `emptyState` override (backward compatible)

## Decisions Made
- Added `components/curators/ClaimButton.tsx` as a small client island rather than converting the whole claim page to a client component — keeps the token-validity check server-side (never exposes token-existence logic to the client) while still delivering the plan's required "POST then show check-your-email" interaction.
- Added a bare `app/curators/claim/page.tsx` so the curator-portal layout's unauthenticated redirect target actually resolves — without it, `redirect('/curators/claim')` would 404, which is a worse outcome than the artist-`/signin`-redirect problem the plan explicitly warns against (RESEARCH Pitfall 3).
- On an `admin.createUser()` conflict (the curator's email already belongs to an existing `auth.users` row — e.g. a prior artist account), the claim route reuses that existing user's id for `claimed_by` via `generateLink()` rather than failing the claim, per the plan's explicit "do not claim collaborator rows; just link the curator record" instruction (RESEARCH Open Question 4). It does not modify that account's existing role or profile.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added a client-island component (`ClaimButton.tsx`) not in the plan's file list**
- **Found during:** Task 1 (claim page)
- **Issue:** The plan requires `app/curators/claim/[token]/page.tsx` to be "a public server component" that does the token-validity check server-side, but also requires a CTA that "POSTs to /api/curators/claim/[token] then shows a 'check your email' confirmation" — an inherently client-side interaction that an async server component cannot express directly.
- **Fix:** Extracted the interactive piece into a small `'use client'` component (`components/curators/ClaimButton.tsx`) that owns only the POST + confirm/error state; the page itself stays an async server component doing the token lookup and validity check.
- **Files modified:** `components/curators/ClaimButton.tsx` (new), `app/curators/claim/[token]/page.tsx`
- **Verification:** `npm run build` compiles with no type errors; grep confirms the required "Claim your profile" / expired copy is present in `page.tsx`.
- **Committed in:** `80d15c8` (Task 1 commit)

**2. [Rule 3 - Blocking] Added a bare `/curators/claim` landing page not in the plan's file list**
- **Found during:** Task 3 (curator-portal layout)
- **Issue:** The plan's reference implementation (PATTERNS.md) redirects unauthenticated portal visitors to `/curators/signin` or "`/curators/claim` or a dedicated curator magic-link request path" — but no bare (token-less) route existed at that path; only the token-scoped `/curators/claim/[token]` page exists. Redirecting there without a token would 404, which defeats the requirement's intent (never leave a curator at a broken/artist page).
- **Fix:** Added a minimal `app/curators/claim/page.tsx` landing page (reuses the `(auth)` layout shell) explaining that curators sign in via their claim-email link, and pointed the portal layout's unauthenticated redirect at it.
- **Files modified:** `app/curators/claim/page.tsx` (new), `app/(curator-portal)/layout.tsx`
- **Verification:** `npm run build` compiles and registers `/curators/claim` as a static route; grep confirms the portal layout is not added to `middleware.ts`.
- **Committed in:** `dc66175` (Task 3 commit)

**3. [Rule 1 - Bug] Extended `PitchHistoryList` with an optional `emptyState` override instead of duplicating the component**
- **Found during:** Task 3 (curator-portal pitches-received view)
- **Issue:** The plan requires reusing `PitchHistoryList` (06-04) for the curator portal's read-only pitches view, but with different locked empty-state copy ("No pitches yet" / "When artists pitch your playlist, you'll see them here.") than the existing hardcoded artist-facing copy ("No pitches sent yet" / ...).
- **Fix:** Added an optional `emptyState?: { heading, body }` prop to `PitchHistoryList`, defaulting to the exact original artist-facing copy when omitted (zero behavior change for the existing `/launchpad/[projectId]` usage), and passed the portal-specific copy from `app/(curator-portal)/portal/page.tsx`.
- **Files modified:** `components/curators/PitchHistoryList.tsx`
- **Verification:** `npm run build` compiles with no type errors; grep confirms "No pitches yet" appears in `portal/page.tsx`; the existing launchpad usage (`app/(artist)/launchpad/[projectId]/page.tsx`) still compiles unmodified.
- **Committed in:** `dc66175` (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (3 blocking)
**Impact on plan:** All three were necessary to deliver the plan's own locked requirements (client interactivity on a server-component page, a real redirect target instead of a 404, and distinct-but-shared empty-state copy) without breaking any existing behavior. No scope creep — no new tables, no new API surface beyond what the plan specified.

## Issues Encountered
None beyond the three deviations above. `npm run build` compiled cleanly after every task, including full route registration for `/curators/claim`, `/curators/claim/[token]`, and `/portal` alongside the pre-existing `/curators` directory page (no route-tree collision).

## User Setup Required

None new for this plan. `PITCH_FROM_EMAIL` (used indirectly via `lib/email`'s `sendEmail()` for the magic-link send, though the claim route uses the default `RESEND_FROM_EMAIL` path since claim emails are transactional, not cold outreach) and the Supabase project's magic-link email settings are pre-existing configuration surfaces from earlier plans — no new env vars or dashboard steps were introduced here.

## Next Phase Readiness
- The claim → magic-link → self-serve-portal loop is fully wired end-to-end in code; the one open verification gap is a live exercise against the deployed Supabase database (confirming `handle_new_user()`'s curator branch actually prevents an `artist_profiles` row — code-level guarantee is in place per D2's coverage entry, but this sandbox cannot run it live, consistent with 06-01's SUMMARY noting no Supabase CLI credentials here).
- `PitchHistoryList`'s new optional `emptyState` prop is available for any future read-only pitch-history surface.
- No blockers for 06-06 (bounce webhook) — `curators.email_valid` and `do_not_pitch` are already read everywhere pitching happens; nothing in this plan touches those columns.

---
*Phase: 06-playlist-curator-pitching*
*Completed: 2026-07-02*

## Self-Check: PASSED

- FOUND: app/api/curators/claim/[token]/route.ts
- FOUND: app/curators/claim/[token]/page.tsx
- FOUND: app/curators/claim/page.tsx
- FOUND: components/curators/ClaimButton.tsx
- FOUND: app/api/curators/[id]/route.ts
- FOUND: app/(curator-portal)/layout.tsx
- FOUND: app/(curator-portal)/portal/page.tsx
- FOUND: components/curators/CuratorProfileForm.tsx
- FOUND: app/api/admin/curators/[id]/route.ts
- FOUND: commit 80d15c8 (feat(06-05): add curator claim-token issuance + public claim flow)
- FOUND: commit c3f8cb3 (feat(06-05): add curator self-serve PATCH API with allowlist + ownership)
- FOUND: commit dc66175 (feat(06-05): add curator-portal layout, profile form, pitches-received view)
