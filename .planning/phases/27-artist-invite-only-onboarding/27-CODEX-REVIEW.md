# Phase 27 — Independent Security Review (Codex) + Dispositions

**Date:** 2026-08-09
**Reviewer:** Codex (independent, read-only). Blockers 1–3 + M1 re-verified in-code by the orchestrator.
**Verdict:** DO-NOT-SHIP — 3 blockers, 2 high, 8 medium, 3 low. Build/`tsc`/1,864 tests all passed, yet three core flows are broken (exactly why the review ran before cutover).

## Blockers (all confirmed; all fixed before cutover)

- **B1 — staff provisioning rejected by the artist gate.** Migration 098 gates every account without `role`=curator/buyer/industry as an artist, but `lib/staff/createStaffAccount.ts:31` sets `app_metadata.staff_role` (not `role`) → new staff hit the gated artist branch and are rejected; also breaks break-glass Layer 2. **Fix (Fix-1):** migration 099 — `handle_new_user` staff branch/early-return (on `staff_role`) BEFORE the artist gate, replicating Phase-25 staff provisioning; update break-glass Layer 2 docs; add a staff-provisioning test.
- **B2 — unsubscribe does not unsubscribe.** `app/unsubscribe/page.tsx` renders "You've unsubscribed" on token load; the only mutation is resubscribe → `unsubscribed_at` is never set → false opt-out + the broadcast's opt-out filter has nothing to exclude. **Fix (Fix-2):** token-authenticated `POST /api/waitlist/unsubscribe` that sets `unsubscribed_at`; page calls it on load, shows confirmation only on success. **FIXED 2026-08-09** (commit c7a2e88): added `app/api/waitlist/unsubscribe/route.ts`, symmetrical with `resubscribe/route.ts` (unsubscribe_token-only filter, rate-limited, generic 404, idempotent); `app/unsubscribe/page.tsx` now calls it on load via a `checking` state before showing the confirmation. 163 suites/1912 tests, tsc, lint, build all clean. No migration involved.
- **B3 — reopen broadcast doesn't authorize recipients.** `broadcast/route.ts:40` sends a bare `/signup` link without minting an invite → gated recipients bounce. **Decision (owner):** Option A now — mint/activate a pending `artist_invites` row per recipient before send (gate stays invite-only). Option B (a DB signup-open toggle honored by trigger+precheck) is DEFERRED for the future "open signup season". **Fix (Fix-3).**

## High

- **H1 — expired invites cannot be re-issued.** `admin/artist-invites/route.ts:78` treats any pending invite as a duplicate even past `token_expires_at`; `.../[id]/convert/route.ts:42` won't re-convert. **Fix (Fix-3):** detect expired pending, rotate token/expiry, resend/replace on both paths.
- **H2 — waitlist can report false success.** `app/api/waitlist/route.ts` ignores select/update/retry/most insert errors before returning `{ok:true}`. **Fix (Fix-3):** check every error, atomic normalized-email upsert, neutral failure when persistence fails.

## Medium

- **M1 — precheck/gate parity break.** `lib/invites/allowlist.ts:27` uses `.ilike(email, input)` (`%`/`_` are wildcards) vs the gate's exact `LOWER()=LOWER()`. **Fix (Fix-1):** exact normalized equality / one shared predicate.
- **M2 — parity test is substring-based** (`__tests__/migration-098-gate.test.ts:86`), so drift/wildcards pass. **Fix (Fix-1):** executable/behavioral parity incl. the `%`/`_` case + structural branch comparison.
- **M3 — gate accepts ALL pending invites for the email** without expiry/which-invite (098). **Fix (Fix-1):** accept only the specific active invitation used to admit.
- **M4 — non-unique `artist_invites` email index + select-before-write** (097) → concurrent duplicate invites/emails. **Fix (Fix-1):** partial unique index on `lower(email)` for active invites + transactional claim.
- **M5 — broadcast ignores send/update results but stamps `sent`** (broadcast:44). **Fix (Fix-3, with B3):** record delivered/failed separately; stamp only on successful delivery.
- **M6 — collaborator invite uses a legacy inline email with unescaped `collaborator.name`** (`app/api/collaborators/[id]/invite/route.ts:87`) → HTML/markup injection. **Fix (Fix-3):** route through the escaped branded template.

## Low

- **L1 — `email_has_account()` uses `SET search_path=public`** not `''` (097). **Fix (Fix-1):** `search_path=''` + qualify `pg_catalog`.
- **L2 — check route returns exact booleans + per-instance limiter.** **Disposition: ACCEPT for beta** (research-accepted residual enumeration risk; revisit with a durable shared limiter for GA).
- **L3 — waitlist email/name lack length/non-empty enforcement** (`lib/invites/schema.ts:47`). **Fix (Fix-3):** validate email syntax, require a trimmed name, cap fields server-side.

## Deferred

- **Signup-open toggle** (Option B for "reopen") — for the future public open-signup season.
