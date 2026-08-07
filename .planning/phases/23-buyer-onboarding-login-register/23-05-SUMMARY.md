---
phase: 23-buyer-onboarding-login-register
plan: 05
subsystem: auth
tags: [supabase-auth, recovery-link, password-auth, role-aware-redirect]

# Dependency graph
requires:
  - phase: 23-buyer-onboarding-login-register (23-02)
    provides: buyer-facing /sync/catalog route and buyer_orgs/buyer_members substrate the buyer branch redirects into
provides:
  - Role-aware post-auth destination resolver (postSignInPath) with a buyer branch to /sync/catalog
  - Role-aware recovery/callback redirects (no more artist-/vault hardcode on password set/reset)
  - Recovery-style buyer invite link (password path, not magic-link) with a working redirectTo into the role-aware flow
affects: [23-07 (Login/Register modal — can now use signInWithPassword for buyers), 23-08 (live smoke test of buyer recovery → set password → /sync/catalog)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single role-aware post-auth resolver (postSignInPath) reused by sign-in, /auth/callback, and /update-password — no second redirect resolver"
    - "Recovery-style generateLink + explicit redirectTo, mirroring forgot-password/page.tsx's own recovery redirectTo exactly"

key-files:
  created: []
  modified:
    - lib/auth/postSignInPath.ts
    - lib/auth/postSignInPath.test.ts
    - app/auth/callback/route.ts
    - app/(auth)/update-password/page.tsx
    - lib/buyers/createBuyerAccount.ts
    - lib/email/buyerInvite.ts

key-decisions:
  - "Buyer branch (app_metadata.role === 'buyer') checked before staff/default resolution in postSignInPath, after the explicit safeNext short-circuit — a buyer is never staff, but the plan's stated precedence is followed literally"
  - "app/auth/callback/route.ts must NOT default `next` to '/vault' before calling postSignInPath — doing so would make the explicit-next branch always win and defeat role-based fallback for buyer/staff callbacks with no explicit next param; the raw (possibly null) next is passed through instead"
  - "createBuyerAccount's generateLink call gained an explicit options.redirectTo (/auth/callback?next=/update-password) alongside the type:'recovery' swap — without it the recovery action_link would fall back to the Supabase project's default Site URL, not the role-aware /update-password step the task requires"
  - "buyerInvite.ts email copy changed from 'Sign in to Funūn' to 'Set your password to get started' — plan Task 3 explicitly required this if the copy referenced magic-link framing"

requirements-completed: [SYNC-08]

coverage:
  - id: D1
    description: "postSignInPath resolves a buyer to /sync/catalog; staff/artist/next behavior unchanged; open-redirect guard still rejects crafted next for a buyer"
    requirement: "SYNC-08"
    verification:
      - kind: unit
        ref: "lib/auth/postSignInPath.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "app/auth/callback/route.ts resolves its success redirect via postSignInPath instead of a bare next-or-/vault fallback"
    requirement: "SYNC-08"
    verification:
      - kind: other
        ref: "grep -q postSignInPath app/auth/callback/route.ts (plan's own automated verify command)"
        status: pass
    human_judgment: false
  - id: D3
    description: "app/(auth)/update-password/page.tsx pushes to a role-aware destination instead of hardcoded /vault"
    requirement: "SYNC-08"
    verification:
      - kind: other
        ref: "! grep -q \"push('/vault')\" app/(auth)/update-password/page.tsx (plan's own automated verify command)"
        status: pass
    human_judgment: false
  - id: D4
    description: "createBuyerAccount issues a recovery-style link (not magiclink) for password setup; rest of the atomic-create contract (phantom-row cleanup, buyer_members insert, no-op-safe sendEmail) unchanged; buyer test suite still green"
    requirement: "SYNC-08"
    verification:
      - kind: unit
        ref: "npm test -- lib/buyers (24/24 passing, unchanged)"
        status: pass
    human_judgment: false
  - id: D5
    description: "A buyer recovery link → set password → lands on /sync/catalog, not /vault (end-to-end live behavior)"
    verification: []
    human_judgment: true
    rationale: "Requires a live Supabase environment with a real buyer account and a real recovery-link click-through; explicitly deferred to the 23-08 human-gated smoke test per this plan's own <verification> section. Resend is also not configured in prod, so the invite/reset email itself will no-op until the owner sets RESEND_API_KEY/RESEND_FROM_EMAIL — out-of-band link delivery may be required for that smoke test."

# Metrics
duration: ~20min
completed: 2026-08-07
status: complete
---

# Phase 23 Plan 05: Buyer Password Auth Mechanism Summary

**Role-aware post-auth routing (postSignInPath buyer branch → /sync/catalog) plus a recovery-style buyer invite link, replacing the /vault-hardcoded recovery flow and magic-link-only invite with the locked password path.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-08-07
- **Tasks:** 3
- **Files modified:** 6 (5 planned + 1 deviation: `lib/email/buyerInvite.ts`)

## Accomplishments
- `postSignInPath()` gained a `BUYER_HOME = '/sync/catalog'` branch, checked after the explicit `?next=` short-circuit and before staff/default resolution — staff, artist, and open-redirect-guard behavior all unchanged and re-verified in tests
- `app/auth/callback/route.ts` and `app/(auth)/update-password/page.tsx` no longer hardcode `/vault` on success — both now resolve their landing destination through the single `postSignInPath()` authority, closing RESEARCH Pitfall 2
- `createBuyerAccount()` now issues a `type: 'recovery'` link (was `magiclink`) with an explicit `redirectTo` into `/auth/callback?next=/update-password`, landing a newly invited buyer on the role-aware "set your password" step instead of an immediate passwordless session — a one-line `type` swap (plus dropping `redirectTo`) is still the entire diff required to revert to magic-link-only

## Task Commits

Each task was committed atomically:

1. **Task 1: Role-aware post-auth destination for buyers** - `051b4ce` (feat)
2. **Task 2: Make the recovery/callback redirects role-aware** - `721207f` (fix)
3. **Task 3: Recovery-style buyer invite for password setup** - `f17c661` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `lib/auth/postSignInPath.ts` - Added `BUYER_HOME` export and the buyer `app_metadata.role === 'buyer'` branch, ahead of staff/default resolution
- `lib/auth/postSignInPath.test.ts` - Added buyer-routing, crafted-next-rejection, and explicit-next cases alongside the existing staff/artist/open-redirect suite
- `app/auth/callback/route.ts` - Success redirect now resolved via `postSignInPath({ user, next: rawNext })`; the raw (un-defaulted) `next` param is threaded through so role-based fallback still applies when no explicit `next` is present
- `app/(auth)/update-password/page.tsx` - Reads the just-updated session's user via `getUser()` and pushes to `postSignInPath({ user })` instead of a hardcoded `/vault`; confirmation copy generalized ("Taking you in…" instead of "Taking you to your vault…")
- `lib/buyers/createBuyerAccount.ts` - `generateLink` call switched from `type: 'magiclink'` to `type: 'recovery'` with an added `options.redirectTo` pointing at `/auth/callback?next=/update-password`
- `lib/email/buyerInvite.ts` - CTA copy changed from "Sign in to Funūn" to "Set your password to get started" to match the recovery-link framing

## Decisions Made
- Buyer branch ordering in `postSignInPath` follows the plan's literal instruction (buyer checked before staff/default resolution) even though a buyer role would independently never match `getStaffRole()` — documented as a comment rather than left implicit
- `app/auth/callback/route.ts` intentionally passes the *raw* `next` search param (not pre-defaulted to `/vault`) into `postSignInPath` — pre-defaulting would make the explicit-`next` branch always win and silently defeat role-based routing for every buyer/staff magic-link or recovery callback that omits `next`
- Added `options.redirectTo` to the `generateLink({ type: 'recovery' })` call (not explicitly named in the plan's action text but required to satisfy the task's own done criteria — "lands the new buyer on the set your password step") — mirrors `forgot-password/page.tsx`'s existing recovery `redirectTo` pattern exactly, so no new redirect convention was introduced

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added `options.redirectTo` to the recovery `generateLink` call**
- **Found during:** Task 3 (recovery-style buyer invite)
- **Issue:** The plan's action text only said to swap `type: 'magiclink'` → `type: 'recovery'`. Without an explicit `redirectTo`, Supabase's admin-generated recovery link falls back to the project's default Site URL — not `/auth/callback?next=/update-password` — meaning the buyer would NOT reliably land on the role-aware set-password step the task itself requires ("lands the new buyer on the 'set your password' step").
- **Fix:** Added `options: { redirectTo: \`${appUrl}/auth/callback?next=/update-password\` }`, using the same `NEXT_PUBLIC_APP_URL` env-var convention already used by `lib/split-sheets/esign-invite.ts` and mirroring `forgot-password/page.tsx`'s own recovery `redirectTo` construction exactly.
- **Files modified:** `lib/buyers/createBuyerAccount.ts`
- **Verification:** `npm test -- lib/buyers` (24/24 passing), `npx tsc --noEmit` clean, `npm run build` clean
- **Committed in:** `f17c661` (Task 3 commit)

**2. [Rule 2 - Missing Critical] Generalized the update-password confirmation copy**
- **Found during:** Task 2 (role-aware recovery/callback redirects)
- **Issue:** The post-update confirmation text said "Taking you to your vault…" unconditionally — now stale/wrong for a buyer who is about to be routed to `/sync/catalog`, not `/vault`.
- **Fix:** Changed the copy to the role-neutral "Taking you in…".
- **Files modified:** `app/(auth)/update-password/page.tsx`
- **Verification:** Visual inspection; no test coverage exists for this copy string (pre-existing gap, not introduced here)
- **Committed in:** `721207f` (Task 2 commit)

**3. [Rule 2 - Missing Critical] Updated `lib/email/buyerInvite.ts` copy (file not in plan's `files_modified` list)**
- **Found during:** Task 3 — the plan's own action text explicitly instructed: "Update the buyerInvite email copy/subject if it references a magic-link so it matches 'set your password' framing," but `lib/email/buyerInvite.ts` was not listed in the plan frontmatter's `files_modified`.
- **Issue:** The email CTA said "Sign in to Funūn," which no longer matches a recovery link that requires the buyer to set a password first.
- **Fix:** Changed the CTA to "Set your password to get started."
- **Files modified:** `lib/email/buyerInvite.ts`
- **Verification:** `npm test -- lib/buyers` (no test asserts this exact email string; verified via read-through)
- **Committed in:** `f17c661` (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (all Rule 2 — missing critical functionality required by the plan's own stated done criteria/action text)
**Impact on plan:** All three are necessary to make the recovery-link buyer invite actually land the buyer on the role-aware set-password step, and to keep user-facing copy internally consistent with the new mechanism. No scope creep beyond what Task 3's action text itself called for.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. (Resend remains unconfigured in prod per the plan's DEPENDENCY RISK note — invite/reset emails will no-op with `emailSent: false` until `RESEND_API_KEY`/`RESEND_FROM_EMAIL` are set; the in-app notification/admin queue path from 23-04 remains the reliable channel until then, and the 23-08 live smoke test may need to deliver the set-password link out-of-band.)

## Next Phase Readiness
- 23-07 (Login/Register modal) can now use `signInWithPassword` for buyer login, since the recovery-link password-setup path is wired end-to-end at the code level
- 23-08's live smoke test (buyer recovery link → set password → lands on `/sync/catalog`) is the first point this plan's behavior can be verified against a real Supabase environment; flagged as `human_judgment: true` (D5) in this SUMMARY's coverage block since it cannot be automated here
- No migration or schema change was needed for this plan — it is entirely application-layer (auth flow + email copy)

---
*Phase: 23-buyer-onboarding-login-register*
*Completed: 2026-08-07*

## Self-Check: PASSED
All created/modified files present on disk; all four task/summary commits (051b4ce, 721207f, f17c661, e8dfda3) found in git log.
