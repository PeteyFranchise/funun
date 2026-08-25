---
quick_id: 260825-i4i
slug: invite-collaborator-standalone
status: complete
date: 2026-08-25
files_modified:
  - lib/collaborators/invite.ts
  - lib/collaborators/invite.test.ts
  - app/api/collaborators/[id]/invite/route.ts
  - app/api/collaborators/[id]/invite/route.test.ts
  - app/api/collaborators/quick-invite/route.ts
  - app/api/collaborators/quick-invite/route.test.ts
  - components/collaborators/QuickInviteModal.tsx
  - components/collaborators/CollaboratorRoster.tsx
---

# Invite Collaborator (standalone) — SUMMARY

Added a lightweight "Invite collaborator" path to `/collaborators` — first name + email
only — so an artist no longer has to open the full `CollaboratorForm` (first/last/email/
phone + rights-registry block) just to send an invite. Ships with a load-bearing
copy-invite-link fallback because Resend email delivery is currently down in prod.

## What shipped

### Task 1 — `lib/collaborators/invite.ts` (shared invite helper)
Extracted the invite mechanics out of `app/api/collaborators/[id]/invite/route.ts` into a
new shared module so a second caller can reuse them verbatim:
- `buildCollaboratorInviteUrl(token)` / `buildCollaboratorJoinUrl(token)` — pure URL
  builders, same trailing-slash-strip convention as `approveUrl` in
  `lib/split-sheets/esign-invite.ts`; an absent `NEXT_PUBLIC_APP_URL` yields a relative
  path, never the literal string "undefined".
- `buildCollaboratorInviteEmail({ name, token })` — the existing IPI-education subject/
  html/text bodies, moved byte-for-byte including every `esc()` call (M6 escaping fix,
  27-CODEX-REVIEW.md).
- `sendCollaboratorInvite(supabase, { collaborator, invitingUserId })` — the 60s-cooldown
  + token-insert + best-effort-send flow, returning a discriminated
  `CollaboratorInviteResult`. **Behavior change on the cooldown path:** it now returns
  the caller's **existing** invite token/link instead of `{ ok: true, skipped: true }`
  with no way to retrieve the link — a repeat caller inside the 60s window gets a usable
  link back instead of a dead end.
- `app/api/collaborators/[id]/invite/route.ts` is now a thin auth+ownership wrapper that
  delegates to `sendCollaboratorInvite` and adds `inviteLink` to every success response.

### Task 2 — `app/api/collaborators/quick-invite/route.ts` (new endpoint)
`POST /api/collaborators/quick-invite`, zod `.strict()` schema accepting exactly
`{ first_name, email }` (any extra key → 400, never reaches an insert). Flow: auth gate →
strict parse → case-insensitive reuse lookup (`.ilike('email', ...)`, active rows only) →
insert a minimal `{ user_id, name, first_name, email, status: 'pending' }` row when no
match exists → delegate to `sendCollaboratorInvite`. A failed send still returns
`data.collaborator` so the client can reflect the row that was created; a `sendEmail`
outage still returns 200 with a working `data.inviteLink`.

### Task 3 — `components/collaborators/QuickInviteModal.tsx` (new modal) + roster wiring
Two-field (`'use client'`) modal — First name + Email, both required, one line of helper
copy explaining the row is intentionally partial. State machine `form → sending → done |
error`. The done panel is the point of this task: it unconditionally renders a status
line (branches on `emailSent` — a false send reads as "Funūn couldn't deliver the email,
send this link yourself," never as a red error), the raw link in a `readOnly` selectable
input, and a "Copy invite link" button (`navigator.clipboard.writeText` in try/catch,
guarded on `navigator.clipboard` being undefined, 2s "Copied ✓" confirmation). `role=
"dialog"` / `aria-modal="true"` / `aria-labelledby`, Escape-to-close (blocked while
sending), autofocus on the first-name input.

Wired into `CollaboratorRoster.tsx`: an "Invite collaborator" button (bordered/ghost,
secondary to Add's gradient) sits before "Add collaborator" in the roster header and
beneath "Add your first collaborator" in the empty state, both under the existing
`activeTab === 'roster' && !creating` guard. `onInvited` folds the returned row into
`list` by id (replace on reuse, append otherwise), re-sorted with the same
`localeCompare` comparator `handleSaved` uses — it never opens
`CollaboratorInvitePrompt`, since the quick path has already sent its invite.

## Files created/modified
- `lib/collaborators/invite.ts` — new: shared invite builders + `sendCollaboratorInvite`
- `lib/collaborators/invite.test.ts` — new: 12 tests (URL builders, HTML escaping, send outcomes)
- `app/api/collaborators/[id]/invite/route.ts` — rewritten as a thin wrapper
- `app/api/collaborators/[id]/invite/route.test.ts` — loosened 3 `toEqual` assertions to `objectContaining` + inviteLink/existing-token assertions; all 8 original tests preserved
- `app/api/collaborators/quick-invite/route.ts` — new endpoint
- `app/api/collaborators/quick-invite/route.test.ts` — new: 9 tests
- `components/collaborators/QuickInviteModal.tsx` — new modal
- `components/collaborators/CollaboratorRoster.tsx` — header + empty-state entry points, modal wiring, list fold-in

## Decisions made
- Kept the cooldown window at exactly 60s (unchanged) but changed its *return shape* to
  carry the existing token — required so a repeat quick-invite inside the window still
  yields a usable link in the modal's done panel, per the plan's must-haves.
- `sendCollaboratorInvite` does not re-verify ownership — it trusts the caller
  (`[id]/invite` filters by `user_id` before calling it; `quick-invite` creates/reuses a
  row it already scoped to `user.id`). Documented in the function's own header comment.

## Deviations from Plan
None — plan executed exactly as written. All acceptance criteria and verify blocks in
`260825-i4i-PLAN.md` passed without needing a Rule 1-4 auto-fix.

## Verification
- `npx tsc --noEmit` — clean
- `npm run lint` (`--max-warnings=0`) — clean
- `npx jest` — **2884/2884 passed** (baseline ~2863 + 21 new tests: 12 in
  `lib/collaborators/invite.test.ts`, 9 in `app/api/collaborators/quick-invite/route.test.ts`;
  the 8 pre-existing item-route tests still pass unmodified in count)
- `npm run build` — exit 0, `/api/collaborators/quick-invite` compiled and listed in the route manifest
- `grep -c 'required' components/collaborators/CollaboratorForm.tsx` → 9 (unchanged — heavy form untouched)

## Known Stubs
None.

## Threat Flags
None — every threat register item in the plan (T-i4i-01 through T-i4i-06, T-i4i-SC) maps
to mitigations already implemented in Tasks 1-2 (ownership-scoped token disclosure,
`.strict()` schema, session-derived `user_id`, `esc()` escaping preserved through the
move, unchanged 60s cooldown). No new network surface, auth path, or schema change
outside what the plan's threat model already covers.

## Next steps
None required by this task. The invite email itself still depends on the pending Resend
fix (`.planning/todos/pending/2026-08-23-invite-email-resend-config.md`) — until that
ships, `emailSent` will read `false` in production and the copy-link path is how artists
actually deliver invites; that is the intended, tested behavior of this change.

## Task Commits
1. `0dae4b6` — feat(260825-i4i): extract shared collaborator-invite helper with inviteLink
2. `275a6de` — feat(260825-i4i): add zod-strict quick-invite endpoint
3. `9a118b3` — feat(260825-i4i): ship the 2-field Invite collaborator modal

## Self-Check: PASSED
All 8 files listed under "Files created/modified" exist on disk. All 3 task commit hashes
(`0dae4b6`, `275a6de`, `9a118b3`) are present in `git log --oneline`.

## Follow-up (2026-08-25) — invite-first steer + fast-add auto-invite

Owner-decided "invite-first" copy/UX steer applied on top of the shipped Task 1-3 work,
plus one behavioral fix in an adjacent flow that had never actually invited anyone:

- `CollaboratorRoster.tsx` — swapped button hierarchy so "Invite collaborator" is now
  primary (`bg-grad`) and "Add collaborator" secondary, in both the header and the empty
  state; added the verbatim steer line ("Skip the hassle — invite them to Funūn and let
  them do the typing.") under the roster subtitle; empty-state body copy now leads with
  invite.
- `CollaboratorForm.tsx` — added a create-mode-only invite-first nudge at the top of the
  heavy form, with an optional `onSwitchToInvite` prop (only `CollaboratorRoster`'s create
  instance supplies it; `CollaboratorPicker`'s two other call sites are untouched and keep
  working via the prop's optionality). Field/`required` count unchanged (still 9).
- `components/split-sheets/PartyPicker.tsx` fast-add — previously POSTed
  `/api/collaborators` and stopped, so its own "they'll fill in the rest" copy was never
  true. It now automatically fires the shipped `POST /api/collaborators/[id]/invite`
  after a successful fast-add (no checkbox), reusing `sendCollaboratorInvite()`. Phone-only
  parties skip the invite call and finalize immediately with no error; a cooldown-reused or
  email-send-failed invite still surfaces its link; any invite failure/throw finalizes the
  add immediately with nothing shown — the party add itself is never blocked. A successful
  invite pauses on a small result step with a "Copy invite link" control mirroring
  `QuickInviteModal`'s clipboard handling.
- New `lib/collaborators/auto-invite.ts` (two pure decisions: `isAutoInviteEligible`,
  `extractAutoInviteLink`) plus `__tests__/party-picker-auto-invite.test.ts` (10 tests) —
  `PartyPicker` has no jsdom test environment, so its wiring is covered by tsc/lint/build.

Gates: `npx tsc --noEmit` clean, `npm run lint -- --max-warnings=0` clean, `npx jest` —
2894/2894 passed (baseline 2884 + 10 new), `npm run build` clean,
`grep -c 'required' components/collaborators/CollaboratorForm.tsx` → 9. No deviations.

Commits: `a6c09ad`, `25bf00a`, `5d59f6a`, `6533c96`, `b7bc5a3`.
