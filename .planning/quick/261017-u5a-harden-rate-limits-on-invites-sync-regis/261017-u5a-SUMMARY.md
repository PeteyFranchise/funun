---
phase: quick-261017-u5a
plan: 01
status: complete
subsystem: api/rate-limits
tags: [rate-limit, turnstile, collaborators, buyer-signup]
requirements: [QUICK-261017-u5a]
commits:
  - 237603d0 feat(collaborators): add per-sender invite limits
  - 5780ee94 feat(sync): require bot check and fail closed on buyer signup
  - fdb3caaa fix(api): fail closed on public and write rate limits
  - 4483707d style: use hyphen-only punctuation in new comments and copy
verification:
  full_suite: "666 suites / 8699 tests passed"
  lint: "npm run lint exit 0 (max-warnings=0)"
  typecheck_strict: "exit 0"
---

# Quick 261017-u5a: Harden rate limits on invites, buyer signup and write routes

Per-sender invite limits, a Turnstile bot check plus fail-closed limits on buyer signup, and `failClosed: true` swept across public and write routes. `lib/security/rate-limit.ts` is untouched; its default is still fail-open.

## What changed

### Task 1: collaborator invites (237603d0)
- New `lib/collaborators/invite-quota.ts`: `COLLABORATOR_INVITE_RATE_LIMITS` (hourly 30, daily 100, both `failClosed`) and `isCollaboratorInviteRateLimited(userId)`. Keys `collab-invite:hour:<id>` then `collab-invite:day:<id>`, daily skipped when hourly is over.
- Kept out of `lib/collaborators/invite.ts` because the quick-invite route test mocks that module with a factory.
- Called right after the auth gate in `app/api/collaborators/quick-invite/route.ts` and `app/api/collaborators/[id]/invite/route.ts` (429 "You have sent too many invites recently. Try again later."), before any lookup, insert or send.
- `__tests__/collaborator-invite-block-gate.test.ts` needed a `checkRateLimit` stub in its `mockAuth` helper, because its service client answers every rpc as an identity lookup.

### Task 2: buyer signup (5780ee94)
- `app/api/sync/register/route.ts` order: ip limit (failClosed), payload validation, email limit (failClosed), `verifyTurnstileToken(token, ip)` (400 "Verification failed. Please try again." before any DB call; Sentry only for `secret-missing` / `site-key-missing`), global cap `sync-register:global` 200 per 24h (failClosed, 429), then the existing insert flow. The cap runs after verification so unverified requests cannot use up the shared allowance.
- `components/buyer/LoginRegisterModal.tsx`: Turnstile widget on the Register form (action `sync-register`), token sent in the request body, submit gated by the shared `waitlistSubmitState`, widget reset on every failed submit, script tag only when a site key is set. All new hooks are above the `if (!open) return null`.
- `.env.example` comment updated.
- Tests: extended `app/api/sync/register/route.test.ts`, new `__tests__/sync-register-turnstile-wiring.test.ts`.

### Task 3: sweep (fdb3caaa)
Added `failClosed: true` to every call in the table below, `INVITATION_RATE_LIMIT` gained `failClosed: true`, and `__tests__/rate-limit-fail-closed.test.ts` now walks `app/api` and fails if any non-comment `checkRateLimit(` call lacks `failClosed: true` without a `// Fail-open on purpose:` note. Verified the sweep goes red when a flag is removed.

## Call site classification

### Changed to fail closed
| Route | Class |
|---|---|
| waitlist (ip, email), waitlist/resubscribe | public |
| handles/available | public |
| signup/invite/[token] | public |
| selects/[token]/react (2 keys), selects/[token]/engagement (2 keys) | public |
| sync/register (ip, email, global cap) | public (Task 2) |
| collaborators quick-invite, [id]/invite | per-sender (Task 1, new helper) |
| workspaces/[workspaceId]/invitations | via `INVITATION_RATE_LIMIT.failClosed` |
| ideas, earnings/import, profile/handle | authenticated write |
| admin/playbook/ask | authenticated write (model cost) |
| workspaces/[workspaceId]/roster (POST) | authenticated write |
| producer-handoffs/[handoffId]/{activity,acknowledge,working,nudge,returns}, producer-returns/[returnId]/review | authenticated write |
| works/[workId]/{notes, notes/[eventId], ai-entries, recording-sessions, recording-sessions/.../handoffs/complete, studio-notes, studio-notes/[noteId], studio-notes/[noteId]/reactions} | authenticated write |
| works/[workId]/blocks/[blockId]/{comments, comments/[commentId], suggestions} | authenticated write |
| works/[workId]/versions/{complete, [versionId]/pins, [versionId]/lyric-lift, [versionId]/comments, [versionId]/comments/[commentId], [versionId]/comments/carry-forward} | authenticated write |

### Deliberately left fail-open (each has a `// Fail-open on purpose:` comment)
| Route | Reason |
|---|---|
| signup/check-invite (ip and email) | low-cost onboarding check; a limiter outage must not block legitimate signups |
| waitlist/unsubscribe | opting out must keep working during a limiter outage |
| works/.../versions/[versionId]/pins/export | read-only export of the caller's own data |
| works/.../versions/[versionId]/comments/export | read-only export of the caller's own data |

No `checkRateLimit` call outside the plan's list turned up. Calls that already passed `failClosed: true` before this work (team-tier-leads, upload-intent routes, social routes, etc.) were left as is.

## Deviations from plan
- **Awaiting-verification message:** the plan listed an "awaiting-verification" message on the Register form. The waitlist form shows none (only "unavailable" and script-error copy), so there was no copy to reuse and none was added. The widget itself is the prompt; submit stays disabled via `waitlistSubmitState`.
- **Network failure handling:** `handleRegister` gained a `catch` that shows the generic error and resets the widget, so a thrown fetch also clears the single-use token. Not in the plan; small and local.
- **Em dashes:** three new lines first landed with em dashes (two comments, one UI string). Fixed in 4483707d instead of rewriting history.
- **Plan file location:** the PLAN.md lives only in the main checkout (untracked), not in this worktree; this SUMMARY is placed at the same relative path here and is intentionally not committed.

## Known stubs
None.

## Note for the owner: local dev needs Cloudflare test keys
Neither the waitlist form nor the buyer Register form submits locally without Turnstile keys: the server refuses any request without a verified token, and the client disables submit when no site key is set. No dev bypass was added. Put Cloudflare's published always-pass test keys in `.env.local`:

```
NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA
TURNSTILE_SECRET=1x0000000000000000000000000000000AA
```

Production needs real keys set for both (the register route reports half-configured states to Sentry as `sync-register-turnstile`).

## Verification
- Target tests: invite-quota, collaborator routes, block-gate, member-api-boundary, sync/register, sync wiring, waitlist coherence, lib/buyers all pass.
- `npm test -- --runInBand`: 666 suites, 8699 tests, 0 failures. No pre-existing failures encountered, so none to compare against base.
- `npm run lint`: exit 0. `npm run typecheck:strict`: exit 0.

## Review fixes

Follow-up commits on top of the four above, from the adversarial review. The sections above describe the first pass; where they differ, this section is current.

| # | Finding | Fix |
|---|---|---|
| 1 | works/[workId]/members sent invites with no quota; send-for-approval had no per-sender limit | members calls `isCollaboratorInviteRateLimited(userId)` right after payload parsing (429 before lookup, insert, membership write, send). send-for-approval gets 20 sends per hour per user (`split-approval-send:<id>`, fail-closed) right after auth. `__tests__/collaborator-invite-quota-gating.test.ts` walks `app/` and `lib/` and fails if any file calling `sendCollaboratorInvite(` lacks the quota call earlier in the file followed by a 429; it also has the members 429 route test. send-for-approval has a new route test. |
| 2 | handle availability failed closed, so a limiter outage showed "taken" and blocked signup | Back to fail-open with a `// Fail-open on purpose:` note. A 429 now returns `{ available: null, reason: 'unavailable' }`. `readHandleAvailability` (lib/handles/availability.ts) maps any non-ok or malformed response to `available: null`; signup page and ChooseHandleGate both use it. Unit-tested, including that a 429 verdict does not block submit. |
| 3 | global 200/day cap was burnable and silent | `check_rate_limit` records every allowed call and cannot peek, so a read-only `peekRateLimit` was added to lib/security/rate-limit.ts (counts `rate_limit_hits` in the window with the service client, same window rule as the RPC). The cap is peeked before the insert and one slot is recorded with `checkRateLimit` only after a new account exists. Duplicate emails, failed org inserts and failed creates use no slot. Accepted overshoot: concurrent requests that peek together can all pass, so the cap can be exceeded by the number in flight. Cap reached and limiter unreadable both go to Sentry (tags only, no PII), at most once per 10 minutes per instance. 429 copy now ends with "or email sync@funun.studio" (`SYNC_CONTACT_EMAIL`). |
| 4 | email counter ran before the bot check; keys shared with other routes | Order is ip counter, payload validation, Turnstile, email counter, cap peek. Keys are `sync-register:ip:` and `sync-register:email:`. |
| 5 | Turnstile checked only `success` | `verifyTurnstileToken(token, ip, { expectedAction })` compares `data.action`; optional hostname pin via `TURNSTILE_EXPECTED_HOSTNAME` (comma list, unset by default so preview deploys are unaffected, documented in .env.example); `AbortSignal.timeout(5000)` with timeout counted as failed. Actions: `sync-register` for buyer signup, `turnstile-spin-v2` for the waitlist (read from the signup page widget). Cloudflare's published test secrets (`1x`/`2x`/`3x` + zeros + `AA`) skip the action and hostname checks, because I did not confirm that they echo the widget's action, and the SUMMARY's local-dev note depends on them. A wiring test pairs each widget action with its route. |
| 6 | invite token prefill GET failed closed | Back to fail-open with a `// Fail-open on purpose:` note (the claim is re-verified at redemption). |
| 7 | Sentry misconfiguration message fired on every request | Reported once per server instance (module-level throttle with an infinite interval). The test now sends two requests and asserts a single event. |
| 8 | (document only) invite quota consumes a slot on every call, including 4xx | Accepted. The limit sits right after auth and before any lookup so a rejected request cannot reach the roster, insert or send paths for free, and `check_rate_limit` cannot refund a slot. The quotas (30/hour, 100/day) are far above normal use, and a sender who keeps hitting 4xx is the case the cap exists for. |
| 9 | sweep scanned only app/api and counted annotations per file | `__tests__/rate-limit-fail-closed.test.ts` now scans `app/` and `lib/`, requires the `// Fail-open on purpose:` note directly above each fail-open call (at most two statement-opener lines between), keeps an explicit per-file allow list with expected counts (check-invite 2, signup/invite/[token] 1, waitlist/unsubscribe 1, handles/available 1, the two export routes 1 each), and checks config-backed calls (`INVITATION_RATE_LIMIT`, `COLLABORATOR_INVITE_RATE_LIMITS`) against the real constants. Verified it goes red when a note is displaced. |

## Self-Check: PASSED
All four commits present on `worktree-agent-a591dc54de35b174d`; created files exist (`lib/collaborators/invite-quota.ts`, its test, `__tests__/sync-register-turnstile-wiring.test.ts`).
