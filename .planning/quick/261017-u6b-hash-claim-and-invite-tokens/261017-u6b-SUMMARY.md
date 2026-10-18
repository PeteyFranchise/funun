---
phase: quick-261017-u6b
plan: 01
status: complete
subsystem: curators
tags: [rate-limit, curator-claim, token-hashing-design]
key-files:
  modified:
    - app/api/curators/claim/[token]/route.ts
    - __tests__/curator-claim-industry.test.ts
    - __tests__/adversarial-review-fixes.test.ts
decisions:
  - "Shipped the claim-route throttle now; token hashing at rest deferred to an owner product decision (migration 245 reserved, not created)."
completed: 2026-10-17
---

# Quick 261017-u6b: Curator claim throttle and token hashing design note

POST /api/curators/claim/[token] is now throttled per client address (10 per 15 min) and per token (5 per 15 min) through the durable limiter, failing closed, with a 64-hex format gate ahead of any lookup. Hashing claim and invite tokens at rest was investigated and not shipped; the reasons and the decision needed are below.

## What shipped

Route: `app/api/curators/claim/[token]/route.ts`. Everything after `createServiceClient()` is unchanged. Order of the new checks:

1. `checkRateLimit('curator-claim:ip:<client ip>', { windowMs: 15 min, maxAttempts: 10, failClosed: true })`. Limited: 429 `{ error: 'Too many attempts. Please try again later.' }`.
2. Format gate: token must match `/^[a-f0-9]{64}$/i`, otherwise the existing 404 `{ error: 'Invalid or expired link' }` with no lookup. `generateClaimToken()` (`randomBytes(32).toString('hex')`) is the only writer of `curators.claim_token`, so nothing legitimate is rejected.
3. `checkRateLimit('curator-claim:token:<sha256 hex of token>', { windowMs: 15 min, maxAttempts: 5, failClosed: true })`. Same 429.

Properties:
- Fail closed: a limiter outage returns 429 instead of allowing unlimited magic-link sends. Both calls pass `failClosed: true` (grep count of non-comment occurrences is 2).
- The raw token never lands in `rate_limits`. The per-token key is a fixed 84 characters, which also keeps it under the limiter's 256 character key cap.
- Dedicated `curator-claim:` namespace, so claim attempts do not consume another route's allowance.
- Valid claim path is unchanged (200, conditional claim UPDATE on id + claim_token + claimed_by IS NULL, sign-in email).

Tests: `__tests__/curator-claim-industry.test.ts` gained a throttle block (address limit, link limit, limiter unavailable, three malformed links, key shapes including the sha256 key and that it excludes the raw token) and now uses a 64-hex token with the limiter mocked. `__tests__/adversarial-review-fixes.test.ts` mocks the limiter and uses a 64-hex token.

## Verification

| Check | Result |
|-------|--------|
| `npx jest __tests__/curator-claim-industry.test.ts __tests__/adversarial-review-fixes.test.ts` | 2 suites, 21 tests passed (13 in the claim file, 7 of them new) |
| `npm test -- --runInBand` | 664 suites passed, 8342 tests passed |
| `npm run lint` (max-warnings=0) | clean |
| `npm run typecheck:strict` | clean |
| Migrations added | none; `ls supabase/migrations \| grep '^245'` prints nothing |

RED was confirmed before the route change: the 7 new tests failed and the 6 existing ones passed.

## Deviations from Plan

- The plan's fourth commit (`docs(261017-u6b): ...`) was not made: the orchestrator constraints say not to commit SUMMARY.md, and nothing else is left to commit.
- Commit trailers use `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (the model that actually did the work) rather than the Opus 5.5 trailer named in the plan.

## Token hashing at rest: design note (not shipped)

### 1. Path chosen and why

Hashing was not shipped because both token columns are re-read in raw form after creation. Storing only a hash would break these flows:

- **Pitch emails (curators).** `app/api/pitches/route.ts` selects `claim_token` (~lines 104-107) and builds `${appUrl}/curators/claim/${curator.claim_token}` into every pitch email sent to an unclaimed curator (~line 198). With a hash-only column that link cannot be built.
- **Mint RPC 'reused' outcome (artist invites).** `mint_or_rotate_artist_invite` (migration 101, ~lines 97-122) returns the existing raw `invite_token` on reuse. The broadcast route emails `mint.token` on reuse (`app/api/admin/artist-invites/broadcast/route.ts` ~line 177). The convert route re-sends `mint.token` when it differs from `artist_waitlist.invite_email_sent_token` and uses it in the Resend idempotency key `artist-convert-${id}-${mint.token}` (`app/api/admin/artist-invites/[id]/convert/route.ts` ~lines 205, 236, 265).
- **Second raw copy.** `artist_waitlist.invite_email_sent_token` (migration 103) stores the exact raw token that was emailed.
- **Collaborator invite reuse.** `lib/collaborators/invite.ts` (~lines 191-218) re-reads a recent raw `collaborator_invites.invite_token` and reuses it.

So hashing changes product behavior (links die, windows restart, or a new secret must be managed). It is a product decision, not a mechanical migration.

### 2. Reader and writer inventory

`curators.claim_token`
- Column: migration 030. Partial UNIQUE index `idx_curators_claim_token`: migration 032. Column privileges that exclude it from client SELECT: migration 031.
- Writer: `app/api/admin/curators/[id]/route.ts` `issue_claim` action (~lines 61-72). Stores the raw token and a 72h expiry, and returns `claimUrl` plus the full row (including `claim_token`, via `.select()`) to the admin. Token generation: `lib/curators/tokens.ts` `generateClaimToken()`.
- Readers by token: `app/api/curators/claim/[token]/route.ts` (lookup, plus three conditional claim UPDATEs keyed on `.eq('claim_token', token)`), `app/curators/claim/[token]/page.tsx` (validity lookup, ~lines 24-28).
- Raw re-read: `app/api/pitches/route.ts` (see above).

`artist_invites.invite_token`
- Writer: `mint_or_rotate_artist_invite` RPC (migration 101), called only through `lib/invites/mintInvite.ts` from `app/api/admin/artist-invites/route.ts`, `app/api/admin/artist-invites/[id]/convert/route.ts`, and `app/api/admin/artist-invites/broadcast/route.ts`.
- Raw copy: `artist_waitlist.invite_email_sent_token` (migration 103).
- Readers by token: `lib/invites/allowlist.ts` `isSignupInviteValid` (~line 99), `app/api/signup/invite/[token]/route.ts` (~line 83), migration 214 `handle_new_user` gate (~lines 120, 130) and `complete_verified_signup_claim` (~lines 211, 233). The latter already writes `verified_signup_invite_claims.token_hash` using `extensions.digest(v_token, 'sha256')`.

`collaborator_invites.invite_token` (shared lookup paths, would need the same treatment for consistency)
- `lib/invites/allowlist.ts` (~line 109), `app/api/signup/invite/[token]/route.ts` (~line 104), `app/join/[inviteToken]/page.tsx`, `lib/collaborators/invite.ts` (~lines 191-218, recent raw token reuse).

### 3. Product decision needed from the owner

Curators:
- (a) Rotate on send. The pitch route mints a fresh token per email and stores only its hash. Earlier links stop working and the 72h window restarts on every pitch. Also needs a call on whether pitches may mint claim tokens for curators an admin never issued one to.
- (b) Encrypt at rest. Keep a `claim_token_hash` for lookup plus an AES-256-GCM ciphertext column keyed by a new server secret. No behavior change; adds key management and rotation work.
- (c) Drop the claim link from pitch emails and send it only from admin `issue_claim`. Simplest, but removes the self-serve claim nudge from pitches.

Artist invites:
- (a) Rotate on reuse. The `'reused'` outcome becomes `'rotated'`, every re-send invalidates the previous link, convert's duplicate check compares hashes (`invite_email_sent_token` becomes a hash column), and the Resend idempotency key switches to the hash.
- (b) Encrypt at rest, as above.

### 4. Migration path once decided (reserve migration 245)

1. Additive columns `curators.claim_token_hash TEXT` and `artist_invites.invite_token_hash TEXT` (sha256 hex, matching `hashInvitationToken` in `lib/workspaces/invitations.ts` on the app side and `pg_catalog.encode(extensions.digest(token, 'sha256'), 'hex')` in SQL, as migration 214 already does). Migration 031 column privileges must cover the new curator column too.
2. Partial UNIQUE indexes on each hash column.
3. Backfill the hashes from the existing plaintext.
4. Switch every reader in item 2 to compare hashes, including the migration 214 `handle_new_user` gate, `complete_verified_signup_claim`, and `mint_or_rotate_artist_invite`. Switch writers to store the hash (and the ciphertext, if option (b) is chosen).
5. In a follow-up migration after the deploy has settled, null the plaintext and drop the old indexes. Apply the same steps to `collaborator_invites.invite_token` and `artist_waitlist.invite_email_sent_token`.

### 5. What did ship, and what was left alone

The claim-route throttle (limits, key shapes, fail-closed posture, and format gate are described above). The public claim page `app/curators/claim/[token]/page.tsx` still does an unthrottled read-only lookup. It sends nothing, only reveals valid or invalid, and 256-bit tokens make guessing impractical, so it was left as is.

## Self-Check: PASSED

Route, both test files, and commits 996d264e, 5b11fe73, 4c2be80e exist on branch worktree-agent-aa129ac37650d12d5.
