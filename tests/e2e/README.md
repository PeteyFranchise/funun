# Phase 11/12 E2E - messaging, presence, Green Room

Automates the six-item "Remaining Human UAT" list from PR #37, plus the
write-boundary migration 056 introduced and the common paths around both new
surfaces. Runs against local `next dev` + a real Supabase project.

## What maps to what

| UAT item (PR #37) | Spec |
|---|---|
| Two-session presence: Online pill appears/disappears | `specs/10-presence.spec.ts` |
| Message request accept/decline/block round-trip | `specs/11-dm-request-lifecycle.spec.ts` |
| Unread badge increments and clears after opening a thread | `specs/12-unread-badge.spec.ts` |
| Docked widget persists across navigation | `specs/13-docked-widget.spec.ts` |
| Rate-limit wall and stacked pending cap | `specs/14-rate-limits.spec.ts` |
| Connected users bypass request flow and message directly | `specs/15-connected-direct.spec.ts` |

Beyond the checklist:

| Spec | Covers |
|---|---|
| `specs/16-green-room.spec.ts` | post/draft, every tab loads, and the "N new updates · Show latest" pill (new activity must not auto-insert) |
| `specs/17-messaging-security.spec.ts` | migration 056's revoked grants, presence forgery, and the API's input handling |
| `specs/18-auth-nav.spec.ts` | anonymous access, nav reachability, `?with=` deep-link resolution |

## Why these, and not more unit tests

The existing `__tests__` already cover every `chooseSendPath` branch, all
`formatPresenceStatus` buckets, gate call-order, and the Green Room feed query
layer. Nothing here re-tests those. These specs only cover what a unit test
structurally cannot reach:

- the two-browser presence handshake (a live WebSocket on both ends)
- Realtime message delivery between two open sessions
- dock persistence across a client-side navigation (a property of where the
  component sits in the tree, not of any function)
- the database privilege boundary (only observable by talking to PostgREST
  with a real member's JWT)

## Setup

1. `npm install` and `npx playwright install chromium`.
2. `cp .env.test.example .env.test` and fill in three account logins, the
   Supabase URL, and the service role key.
3. **`NEXT_PUBLIC_VAULT_DEMO` must be unset or false.** Every DM, presence and
   Green Room route returns canned success in demo mode, so the suite would pass
   without testing anything. Setup asserts this and fails the run rather than
   skipping.
4. Confirm migrations `054`-`057` are applied: `npx supabase migration list`.
   Spec 17 asserts 056's revoked grants and will fail loudly if it never landed.
5. `npm run e2e:seed`.
6. Start `next dev` - there's no `webServer` block, the server must already be up.

## Run

```bash
npm run e2e          # everything
npm run e2e:report   # open the last HTML report
npm run e2e:typecheck
```

## What the seed builds

Three real personas, wired to the three branches of the DM send-gate:

- **A** - the viewer most specs act as. Forced `verified: false` so
  `BASELINE_REQUEST_LIMIT` (10) is the limit under test, not the verified 30.
- **B** - an accepted connection of A, so A→B sends go direct.
- **C** - a stranger, so A→C sends open a cold request.

Plus two pools of synthetic accounts, kept separate on purpose:

- **11 request fillers** - nine carry a pending cold request from A, putting A
  at 9 of 10 so a single UI action proves the wall. Two spares are the allowed
  10th and walled 11th targets.
- **10 unread fillers** - ten distinct senders for the "badge caps at 9+" check
  (the badge counts unread *threads*, not messages). Reusing the request fillers
  would overwrite A's pending requests and silently defuse the rate-limit spec.

**Reset, not teardown.** Each seed run wipes the personas' threads, messages,
read markers, blocks and posts before re-inserting. Re-run `npm run e2e:seed`
between runs. Specs that spend request budget or leave a block also reset in
their own `beforeEach` - see `resetRequestBudget()` and `clearBlocksBetween()`
in `messaging-helpers.ts`.

All seeding goes through the service-role client. Migration 056 revoked
authenticated `INSERT`/`UPDATE` on `dm_threads`/`dm_messages`, so there is no
other way in - which is exactly what spec 17 verifies.

## Notes

- **Skips are failures here.** Every spec self-skips when its creds or seed are
  missing (the existing suite's convention). On a correctly configured target
  nothing should skip - a skip means the setup is wrong, not that a check is
  inapplicable.
- **UI guards vs server guards.** The composer hides itself at the rate limit
  and disables its input at the stack cap, both computed client-side. That's a
  courtesy, not a control - it's bypassable by posting to `/api/dm/send`. Spec
  14 asserts both halves separately for that reason.
- The viewport is pinned to 1440x900: the docked widget is `hidden lg:block` and
  `/messages` only goes two-pane at `lg`.
- Specs run serially (`workers: 1`) - they share one set of seeded threads.
