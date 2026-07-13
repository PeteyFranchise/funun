---
phase: 10
plan: 06
subsystem: profile-connections-ui
tags: [connect-button, connections, profile, notifications-deeplinks, ui]
requires:
  - "app/api/connections/route.ts (Plan 10-03) — POST create + PATCH accept/decline/withdraw"
  - "lib/social/connections.ts (Plan 10-01) — buildConnectRequest/buildRespondTransition builders"
  - "migration 035 connections_select_participant RLS + migration 050 connections.note + auto-follow-seed trigger"
provides:
  - "components/profile/ConnectButton.tsx — three-state Connect control + inline accept/decline + note composer"
  - "ProfileView.tsx ConnectState prop + Connect-as-primary action row + #wall/#endorsements anchors"
  - "app/u/[handle]/page.tsx connect-state derivation from the connections table"
affects:
  - "Plan 10-04 notification deep-links (/u/{handle}#wall, /u/{handle}#endorsements) now resolve"
  - "Plan 10-05 notification bell inline Accept pairs with this button's Connected state"
tech-stack:
  added: []
  patterns:
    - "Optimistic fetch + router.refresh() (mirrors FollowButton)"
    - "Click-outside mousedown popover (mirrors ProfileMoreMenu)"
    - "Inline RLS-scoped pair query for viewer<->profile state derivation (mirrors follow derivation)"
key-files:
  created:
    - components/profile/ConnectButton.tsx
  modified:
    - components/profile/ProfileView.tsx
    - app/u/[handle]/page.tsx
decisions:
  - "ConnectButton owns the primary gradient slot; Follow stays ghost — satisfies the UI-SPEC visual-weight decision without adding a second gradient button to the row"
  - "note is populated only for the pending_in (addressee) case — it's the only state that renders the note callout; requester/connected states pass null"
  - "declined/withdrawn rows read as `none` (state query filters to status IN pending/accepted) — enables re-request via the partial unique index"
  - "anchors use scroll-mt-[88px] so the sticky profile header doesn't overlap the deep-link scroll target"
metrics:
  duration: 4min
  completed: 2026-07-13
  tasks: 2
  files: 3
status: complete
---

# Phase 10 Plan 06: Profile Connect Button & Deep-link Anchors Summary

ConnectButton three-state control (Connect primary CTA → Pending/Withdraw → Connected, plus the addressee's inline Accept/Decline and an optional ≤200-char note composer) mounted before Follow in the profile action row, with connect state derived from the `connections` table via participant-scoped RLS, and `#wall`/`#endorsements` anchors added so the Plan-04 notification deep-links resolve.

## What Was Built

**Task 1 — `components/profile/ConnectButton.tsx` (new)** — commit `2cfdc69`
- `'use client'` control with props `{ profileUserId, connectionId, state, note?, canConnect }`, mirroring FollowButton's `useRouter` + optimistic local state + `busy` guard + `router.refresh()`.
- Four states + not-signed-in variant:
  - `none`: `Connect` primary gradient (`bg-grad text-white shadow-cta`) at the locked 42px/13px 22px/11px/15px 700 sizing, hand-authored user-plus glyph; click opens the note composer popover.
  - `pending_out`: `Pending` ghost, swaps label+icon to `Withdraw` (x-circle) on hover/focus with NO color change (reversible-action contract); click PATCHes `{ action: 'withdraw' }`, optimistic revert to `none`, no confirm.
  - `pending_in`: replaces the button with compact (36px) inline `Accept` (gradient) + `Decline` (ghost); renders the note above as a `13px/500` lavdim callout on a card2 pill when present. Both PATCH + optimistic + refresh.
  - `connected`: `Connected` ghost, check glyph, non-interactive (default cursor) — accurate terminal status (disconnect is Phase 13, D-07).
  - `!canConnect`: sign-in nudge `<a href="/signin">` mirroring FollowButton's `!canFollow` branch.
- Note composer popover folded into the same file as a local `NoteComposer` component (keeps files_modified minimal): 320px, card bg, hair border, `<textarea maxLength={200}>` with `{n}/200` counter, `Send request`/`Cancel`, click-outside close via the ProfileMoreMenu mousedown pattern. Empty note sends `null`. Failure keeps the popover open with an amber (warn-toned, NOT rose) inline error line.
- No rose/destructive styling anywhere (Decline/Withdraw are reversible). Glyphs hand-authored in icons.tsx SVG style (1.7 stroke, round caps).

**Task 2 — ProfileView + page wiring** — commit `7ba6e75`
- `ProfileView.tsx`: exported `ConnectState` type + added optional `connect?: ConnectState` prop; renders `<ConnectButton />` FIRST in the non-owner action row (D-01 order Connect/Follow/Message), only when `connect` is present. Follow keeps its existing ghost resting treatment — exactly one gradient CTA (Connect) in the row. Follow and Connect stay independent (D-06 — no coupling added).
- Added `<section id="endorsements">` / `<section id="wall">` wrappers (with `scroll-mt-[88px]`) around the existing Endorsements/Wall renders so `/u/{handle}#endorsements` and `/u/{handle}#wall` (Plan-04 notification links) actually resolve.
- `app/u/[handle]/page.tsx`: derives connect state inline, mirroring the follow derivation. For `viewerId !== profile.id`, SELECTs the active (`status IN pending/accepted`) row for the pair via `.or('and(requester...),and(...)')` — participant-scoped by `connections_select_participant` RLS — and maps it: no row → `none`; `accepted` → `connected`; `pending` + `requester_id === viewer` → `pending_out`; `pending` + `addressee_id === viewer` → `pending_in` (with `note`). Sets `canConnect = Boolean(viewerId) && viewerId !== profile.id`, builds a `ConnectState`, passes `connect={connect}`. DEMO branch gets an analogous `state: 'none'` connect object.

## Deviations from Plan

None — plan executed exactly as written. Both automated tasks committed atomically; `npx tsc --noEmit` clean project-wide; `npm run build` compiled successfully.

## Human Verification (deferred to end-of-phase UAT)

Per this project's `workflow.human_verify_mode = end-of-phase`, the plan's terminal `checkpoint:human-verify` (Task 3) was NOT halted mid-flight. The automated portion — a production `npm run build` — passed. The interactive lifecycle is not unit-testable (no E2E runner per VALIDATION.md) and is captured here verbatim for the phase verifier to harvest into the phase UAT file.

**What was built (for verification):** The ConnectButton three-state control on the profile (Connect primary CTA, Follow demoted to ghost), the optional note composer, the addressee's inline Accept/Decline, and the `#wall`/`#endorsements` deep-link anchors.

**How to verify (two accounts A and B):**
1. On B's profile as A, confirm three actions render in order Connect / Follow / Message, with Connect as the gradient primary and Follow as the quieter ghost button.
2. Click Connect — the note composer opens. Type a note, confirm the `{n}/200` counter, click Send request. Button becomes Pending.
3. Reload — Pending persists (state derived from DB). Hover Pending — it reads Withdraw (neutral, no red). Click it — reverts to Connect (withdrawn).
4. Send the request again (with or without a note). As B, open A's profile — confirm inline Accept/Decline appear in place (D-02) with the note shown above them if provided. Click Accept.
5. Reload both profiles — both now show Connected (non-interactive). Confirm A and B now follow each other (the D-05 auto-follow seed — cross-check follower counts / Following state).
6. Visit `/u/{handle}#wall` and `/u/{handle}#endorsements` — confirm the page scrolls to those sections (anchors resolve).
7. Confirm a `connection_accepted` notification reached the original requester (cross-check with the Plan-05 bell if merged).

**Resume signal:** Type "approved" or describe what failed (button order/skin? pending persists? withdraw works? inline accept? auto-follow both ways? anchors scroll?).

## Verification Results

- `npx tsc --noEmit`: clean project-wide (no errors in ConnectButton, ProfileView, or the page).
- `npm run build`: `✓ Compiled successfully` (exit 0).
- Grep gates: `action: 'withdraw'`, `action: 'accept'`, `maxLength={200}`, `'/api/connections'` present in ConnectButton; `ConnectButton`, `id="wall"`, `id="endorsements"` present in ProfileView; `ConnectState`, `from('connections'` present in the page.
- No file deletions in either commit; no stray untracked files.

## Threat Surface

No new security-relevant surface beyond the plan's `<threat_model>`. The composer's 200-char cap is convenience only (T-10-17); the `/api/connections` route + `buildConnectRequest` + Postgres CHECK are the boundary. Forged connectionId/addressee fails the migration-035 RLS UPDATE (T-10-18). The pair state query is scoped by `connections_select_participant` RLS — a non-participant gets no row regardless of the client-supplied `.or()` filter (T-10-19). No packages installed (T-10-SC).

## Self-Check: PASSED

All created/modified files exist on disk; all three task commits (`2cfdc69`, `7ba6e75`, `6dd3314`) are present in git history.
