---
phase: 27-artist-invite-only-onboarding
plan: 09
subsystem: auth
tags: [nextjs, react, client-state-machine, turnstile, enumeration-mitigation, deep-link]

# Dependency graph
requires:
  - phase: 27-artist-invite-only-onboarding (plan 06)
    provides: "POST /api/signup/check-invite ({allowed, existingAccount}) + GET /api/signup/invite/[token] ({email, inviterName, expired})"
  - phase: 27-artist-invite-only-onboarding (plan 07)
    provides: "POST /api/waitlist ({ok:true}, Turnstile-protected, D-19 auto-resubscribe) + POST /api/waitlist/resubscribe ({ok:true}, token-scoped)"
provides:
  - "app/(auth)/signup/page.tsx — gate -> checking -> allowed | existing-account | denied->waitlist client state machine (D-10/D-11), deep-link landing (D-09), self-serve signUp() unchanged (D-01)"
  - "app/unsubscribe/page.tsx — broadcast-only unsubscribe/resubscribe landing (D-19, surface 7)"
affects: [27-11-migration-push-checkpoint]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Client-side gate state machine as UX layer only — every admission branch (plain check, deep-link resolve) round-trips through the same POST /api/signup/check-invite call; no path treats a resolved token as itself sufficient to admit (D-02)"
    - "Cloudflare Turnstile explicit-render integration via next/script + a callback ref, no npm package — first Turnstile usage in this codebase"

key-files:
  created:
    - app/unsubscribe/page.tsx
  modified:
    - app/(auth)/signup/page.tsx

key-decisions:
  - "Deep-link resolution (?invite=token) always re-runs check-invite with the server-resolved email before rendering the allowed/credential-creation state — the invite/[token] resolver's response is treated as pre-fill data only, never as admission, matching 27-06's explicit 'never admit by token' contract."
  - "Editing the pre-filled email away from the deep-link's resolved email transitions the state machine back to the plain 'form' gate state (deepLink cleared) rather than merely hiding the inviter framing — this satisfies D-09's 'silently falls back to the generic gate' requirement structurally, not just cosmetically."
  - "Turnstile is integrated with no new npm dependency (matches 27-PATTERNS' 'no direct analog' note): the vendor script is loaded via next/script only when the denied/waitlist form is rendered, and the widget renders through a memoized callback ref plus the script's onLoad handler, guarded by a ref flag so it only ever renders once regardless of which of the two triggers fires first."
  - "When NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset (pre-27-11 provisioning), the waitlist form still renders with the fixed-height slot reserved (no layout shift) but sends an empty turnstileToken — the server route (27-07) already fails closed in that case, so the missing key degrades safely rather than needing a client-side special case."

patterns-established:
  - "Public-facing signup/waitlist pages must never let the client decide admission — always route through the corresponding check-invite/resolve API and use its response to select the rendered state, even on paths (deep-link) that feel like they should shortcut."

requirements-completed: [INVITE-06, INVITE-12]

coverage:
  - id: D1
    description: "The signup page leads with the invite-only gate ('Have an invite? Enter your email') before any credential form, with a founding-member heading (D-10)"
    requirement: "INVITE-06"
    verification:
      - kind: automated_ui
        ref: "npm run build — /signup renders as a static route (○), page compiles with the gate as the default rendered state (gateState initial value 'form', no deepLink)"
        status: pass
    human_judgment: true
    rationale: "Visual/copy verification (heading tone, layout, button state transitions) requires a human to view the running page — automated build/compile checks confirm the code path exists and is default-rendered but cannot confirm visual correctness."
  - id: D2
    description: "check-invite response branches the client into allowed (unmodified self-serve signUp(), D-01) | existing-account (/signin?email=... link) | denied (inline waitlist, no redirect, D-11)"
    requirement: "INVITE-06"
    verification:
      - kind: other
        ref: "tsc --noEmit clean; npx eslint app/(auth)/signup/page.tsx clean; manual code trace of checkInvite() branching on {allowed, existingAccount} from POST /api/signup/check-invite"
        status: pass
    human_judgment: true
    rationale: "Full state-machine transition correctness (network round-trip, three-way branch, in-place rendering) is a live end-to-end concern deferred to 27-11's human-gated smoke test after migrations are pushed and Turnstile/keys are provisioned."
  - id: D3
    description: "Denial copy is generic regardless of reason (enumeration mitigation, T-27-02) — the denied render path never differs based on why an email was rejected"
    requirement: "INVITE-06"
    verification:
      - kind: other
        ref: "manual code trace — renderDenied's copy is a single static string with no branching on a rejection reason; the underlying check-invite route (27-06) already returns an identical response shape for all denial causes"
        status: pass
    human_judgment: false
  - id: D4
    description: "Deep-link (?invite=token) pre-fills the email + frames 'invited by [name]'; editing the email falls back to the generic gate; the flow still round-trips through check-invite (no client-side admission)"
    requirement: "INVITE-06"
    verification:
      - kind: other
        ref: "manual code trace — useEffect resolves GET /api/signup/invite/[token], sets deepLink + email, then unconditionally calls checkInvite(data.email); handleAllowedEmailChange clears deepLink and resets gateState to 'form' when the edited email no longer matches deepLink.email"
        status: pass
    human_judgment: true
    rationale: "Live deep-link behavior (real token resolution, expiry, inviter-name display) requires the migrated database and a real token — deferred to 27-11's live smoke test."
  - id: D5
    description: "The waitlist form renders a Turnstile widget from NEXT_PUBLIC_TURNSTILE_SITE_KEY in a fixed-height slot above submit and posts the token to POST /api/waitlist"
    requirement: "INVITE-12"
    verification:
      - kind: other
        ref: "npm run build clean with the Turnstile Script + attachTurnstile callback ref present in the compiled /signup bundle; handleWaitlistSubmit posts {email, name, note, turnstileToken} to /api/waitlist"
        status: pass
    human_judgment: true
    rationale: "Live Turnstile rendering/verification requires NEXT_PUBLIC_TURNSTILE_SITE_KEY / TURNSTILE_SECRET_KEY, provisioned at the 27-11 checkpoint — not testable until then."
  - id: D6
    description: "The unsubscribe page states the broadcast-only scope + reassurance box and offers Resubscribe (POST /api/waitlist/resubscribe) + a rejoin-the-waiting-list link (D-19, INVITE-12)"
    requirement: "INVITE-12"
    verification:
      - kind: automated_ui
        ref: "npm run build — /unsubscribe renders as a static route (○); manual code trace confirms the reassurance-box copy, Resubscribe button posting {token} to /api/waitlist/resubscribe, and the /signup secondary link are all present in the landing state"
        status: pass
    human_judgment: true
    rationale: "Visual verification of the card layout and copy tone is deferred to human review; the 27-11 live smoke test exercises the real resubscribe round-trip against a migrated database."
  - id: D7
    description: "npm run build and tsc --noEmit are clean with both pages present in the route manifest"
    verification:
      - kind: other
        ref: "npx tsc --noEmit (clean, no output); npm run build (clean, /signup and /unsubscribe both listed as static ○ routes)"
        status: pass
    human_judgment: false

# Metrics
duration: ~20min
completed: 2026-08-09
status: complete
---

# Phase 27 Plan 09: Signup Invite-Gate State Machine + Deep-Link + Unsubscribe Page Summary

**Extended `app/(auth)/signup/page.tsx` into a `gate → checking → allowed | existing-account | denied→waitlist` client state machine (D-10/D-11) with deep-link pre-fill (D-09) and a Turnstile-protected inline waitlist, plus a new `app/unsubscribe/page.tsx` broadcast-only unsubscribe/resubscribe landing (D-19) — the front door for Phase 27's invite-only artist onboarding.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-08-09T07:19:00Z (approx)
- **Completed:** 2026-08-09T07:39:05Z
- **Tasks:** 2/2
- **Files modified:** 1 modified, 1 created

## Accomplishments
- `app/(auth)/signup/page.tsx` now leads with the D-10 invite-only gate ("Funūn is invite-only — for now." / "Have an invite? Enter your email") before any credential form, driven by a `gate` (internally `'form'`) → `checking` → `allowed | existing-account | denied` client state machine that posts to `/api/signup/check-invite` (27-06) and never itself decides admission.
- `allowed` renders the pre-existing, byte-unmodified `supabase.auth.signUp()` credential form (D-01 — artist still sets their own password), with either a generic "You're invited ✓" line or, for deep-link arrivals, the "[Inviter name] invited you to Funūn" framing above it.
- `existing-account` shows a short message with a same-origin `/signin?email=…` link (no new enumeration surface — a normal "already registered" branch).
- `denied` replaces the card contents **in place** (D-11, no redirect) with the generic, enumeration-safe denial copy plus an inline waitlist form (email/name/optional note, `resize-none` textarea per `CollaboratorForm`'s pattern) that posts `{email, name, note, turnstileToken}` to `/api/waitlist` (27-07) and swaps in place to the "You're on the list" success copy.
- Deep-link landing (`/signup?invite=token`, surface 2): on mount resolves `GET /api/signup/invite/[token]` (27-06), pre-fills the email + inviter framing, then unconditionally re-runs the same `check-invite` call before rendering `allowed` — the token resolver is treated as pre-fill data only, never admission. Editing the pre-filled email away from the resolved value clears the deep-link context and falls back to the plain gate, matching the "silent fallback, no error" requirement structurally. An expired token renders a dedicated re-request state with a button that routes straight into the waitlist form.
- Turnstile (D-12) is wired with no new npm dependency: a `next/script` tag loads the vendor script only when the waitlist form is visible, and a memoized callback ref renders the widget into a fixed-height slot (`min-h-[65px]`, no layout shift) — guarded so it only renders once regardless of whether the script or the DOM node is ready first. A missing `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (pre-27-11 provisioning) degrades safely: the slot still reserves its space and the empty token is sent, which the server route already fails closed on.
- New `app/unsubscribe/page.tsx` (surface 7, D-19): a dark auth-style centered card (reproducing `AuthLayout`'s wordmark + centering shell directly, since the route lives outside the `(auth)` group) states the broadcast-only scope with a reassurance box, offers a "Resubscribe" button that posts `{token}` to `/api/waitlist/resubscribe` (27-07) and swaps in place to the resubscribed confirmation, plus a secondary "rejoin the waiting list" link to `/signup`. A missing/invalid `?token=` renders a generic error card.

## Task Commits

Each task was committed atomically:

1. **Task 1: Signup page — invite-gate state machine + inline waitlist + deep-link** - `fa6c763` (feat)
2. **Task 2: Unsubscribe/resubscribe landing page (surface 7)** - `a6a8514` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `app/(auth)/signup/page.tsx` - invite-gate state machine, deep-link resolver, inline Turnstile-protected waitlist; self-serve `signUp()` call unchanged
- `app/unsubscribe/page.tsx` - new broadcast-only unsubscribe/resubscribe landing page

## Decisions Made
- **Deep-link resolution never itself admits.** `useEffect` resolves the token via `GET /api/signup/invite/[token]`, sets `deepLink` + `email` from the response, then unconditionally calls the same `checkInvite()` used by the plain gate path — there is no code path where a resolved token alone transitions the state to `allowed`.
- **Editing the deep-link email is a structural fallback, not a cosmetic one.** `handleAllowedEmailChange` compares the normalized (trim+lowercase) edited value against `deepLink.email`; on mismatch it clears `deepLink` and resets `gateState` to `'form'`, so the visitor lands back in the exact same plain-gate render path a fresh visitor would see — not a variant of the allowed screen with the header removed.
- **No new npm dependency for Turnstile.** Following 27-PATTERNS' "no direct analog" note, the vendor script is loaded via `next/script` conditionally (only inside the `denied` render branch) and the widget is rendered through a `useCallback`-memoized ref plus the script's `onLoad` handler, with a `useRef` flag preventing a double-render race between the two trigger paths.
- **`app/unsubscribe/page.tsx` reproduces `AuthLayout`'s shell directly** rather than being placed under `app/(auth)/` — the route is intentionally outside that group (it's a public link-target, not part of the sign-in/sign-up flow), so the centering wrapper + wordmark header are duplicated inline to get the identical dark auth-style presentation the plan calls for.

## Deviations from Plan

None - plan executed exactly as written. Both files match the `<action>` sections and `must_haves.truths` verbatim: the gate leads before any credential form, the three-way branch (allowed/existing-account/denied) is in place with no redirect, the deep-link pre-fill + fallback behavior is implemented, the unsubscribe page states the broadcast-only scope + Resubscribe + rejoin link, and the credential-creation step's `signUp()` call is byte-identical to the pre-existing implementation.

## Issues Encountered
None. `npx tsc --noEmit` and `npx eslint` were both clean on first pass for both files; `npm run build` completed cleanly with `/signup` and `/unsubscribe` both listed as static (`○`) routes in the route manifest.

## User Setup Required
None triggered directly by this plan. `NEXT_PUBLIC_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` provisioning (already flagged by 27-06/27-07) remains deferred to the 27-11 human-gated checkpoint — until then the waitlist form renders correctly but Turnstile verification (and therefore all waitlist submissions) fails closed server-side, which is the intended safe default.

## Next Phase Readiness
- Both pages are pure client-side consumers of the 27-06/27-07 routes with no server-side coupling of their own — no further route work is needed for the D-09/D-10/D-11/D-12/D-19 surfaces this plan covers.
- Live end-to-end verification (invited→admitted, uninvited→waitlist, deep-link pre-fill with a real token, unsubscribe→resubscribe against a migrated database) is exercised at the 27-11 live smoke checkpoint after migrations are pushed and Turnstile keys are provisioned — unchanged from 27-06/27-07's stated status.
- No regressions introduced; no new dependencies added; `npm run build` and `tsc --noEmit` both clean.

---
*Phase: 27-artist-invite-only-onboarding*
*Completed: 2026-08-09*

## Self-Check: PASSED

Both created/modified files verified present on disk; both task commits (`fa6c763`, `a6a8514`) verified present in `git log`.
