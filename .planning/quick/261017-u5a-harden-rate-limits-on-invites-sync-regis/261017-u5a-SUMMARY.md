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

## Self-Check: PASSED
All four commits present on `worktree-agent-a591dc54de35b174d`; created files exist (`lib/collaborators/invite-quota.ts`, its test, `__tests__/sync-register-turnstile-wiring.test.ts`).
