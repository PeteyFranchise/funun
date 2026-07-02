---
phase: 06-playlist-curator-pitching
plan: 04
subsystem: api
tags: [nextjs, supabase, anthropic, resend, curator-pitching, server-side-validation]

# Dependency graph
requires:
  - phase: 06-01
    provides: pitch_history/curators tables (RLS-enabled), Curator/PitchHistory/CuratorPlatform/PitchStatus types
  - phase: 06-02
    provides: PLATFORM_LABELS from lib/curators/schema.ts
  - phase: 06-03
    provides: CuratorCard (selectable/disabled mode), DirectoryCurator type, computeResponseRates(), directory-safe column projection pattern
provides:
  - "lib/curators/tokens.ts -- generateClaimToken/generateResponseToken, single owner of both token shapes (256-bit randomBytes(32) hex)"
  - "lib/email/index.ts -- optional `from` override on sendEmail, gates on the effective from address"
  - "lib/curators/pitch-copy.ts -- buildPitchNotePrompt() + PITCH_NOTE_MAX_WORDS (150), reused by both draft and send routes"
  - "POST /api/pitches/draft -- AI-drafted 150-word playlist-specific pitch note (draft-only, never writes pitch_history)"
  - "POST /api/pitches -- send route: ownership + 3-gate server re-validation + duplicate/blocked guard + atomic pitch_history insert + response_token generation + best-effort email"
  - "PitchComposer / PitchHistoryList components wired into /launchpad/[projectId]"
affects: [06-05-curator-claim-portal, 06-06-bounce-webhook]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "response_token generated once, at send time, in the ONLY route that creates pitch_history rows -- downstream accept/decline/unsubscribe routes (06-06) read and resolve, never generate"
    - "Atomic bulk pitch_history insert (single .insert(rows[]) call) so a 23505 unique-violation race backstop fails the whole batch, never a partial insert"
    - "Server-side re-validation of every client-enforced gate (curator selected / non-empty note / <=150 words) before any DB write -- client disabled-Send state is never trusted (T-06-11)"

key-files:
  created:
    - lib/curators/tokens.ts
    - lib/curators/pitch-copy.ts
    - app/api/pitches/draft/route.ts
    - components/curators/PitchComposer.tsx
    - components/curators/PitchHistoryList.tsx
  modified:
    - lib/email/index.ts
    - app/api/pitches/route.ts
    - app/(artist)/launchpad/[projectId]/page.tsx

key-decisions:
  - "app/api/pitches/route.ts pre-existed as a dead industry-pitch-credits route (a separate `pitches` table, `pitch_credits_remaining` subscription gating) with zero UI callers anywhere in the codebase -- replaced it after confirming no references to the route or the `pitches` table exist outside that one file, since this plan's locked artifact path is the identical `/api/pitches`"
  - "Duplicate/blocked curators (already-pitched, do_not_pitch, email_valid=false) cause the ENTIRE send request to be rejected with 409 rather than a partial silent-skip send -- matches the plan's manual-verification expectation ('the API returns 409 on a forced retry') and keeps the atomic bulk-insert semantics simple"
  - "Pitch history curator name / track title resolved from the already-fetched curators/tracks maps in the launchpad page rather than a Supabase embedded join, avoiding to-one embed shape ambiguity"

requirements-completed: [PITCH-02, PITCH-03]

coverage:
  - id: D1
    description: "Token generation, email from-override, and the AI 150-word pitch-note drafter all exist and compile"
    requirement: "PITCH-02"
    verification:
      - kind: unit
        ref: "grep -Eq randomBytes\\(32\\) lib/curators/tokens.ts; grep -Eq from\\?: lib/email/index.ts; grep -q PITCH_NOTE_MAX_WORDS lib/curators/pitch-copy.ts; grep -q extractJson app/api/pitches/draft/route.ts; npm run build (tail) -- no type errors"
        status: pass
    human_judgment: false
  - id: D2
    description: "The send route enforces all three gates server-side, guards duplicates, blocks unsubscribed/bounced curators, and creates pitch_history rows with response tokens"
    requirement: "PITCH-03"
    verification:
      - kind: unit
        ref: "grep -Eq split\\(/\\\\s\\+/\\) app/api/pitches/route.ts; grep -q generateResponseToken app/api/pitches/route.ts; grep -Eq '23505|already pitched|409' app/api/pitches/route.ts; grep -q PITCH_FROM_EMAIL app/api/pitches/route.ts; grep -Eq 'do_not_pitch|email_valid' app/api/pitches/route.ts; npm run build (tail) -- no type errors"
        status: pass
    human_judgment: true
    rationale: "No test framework exists in this project (confirmed in CLAUDE.md); the plan's tdd=\"true\" <behavior> block was implemented and verified via the plan's own grep-based automated checks plus a full build, matching how prior Phase 5/6 plans with the same constraint were closed. A live end-to-end exercise of each behavior case (151-word rejection, duplicate 409, unset-PITCH_FROM_EMAIL graceful degrade) against a running dev server + real Supabase session was not performed in this sandbox."
  - id: D3
    description: "Artists compose, AI-draft, gate, and send pitches inside the launchpad room, and see per-project pitch history"
    requirement: "PITCH-02"
    verification:
      - kind: unit
        ref: "grep -q 'Send pitch' components/curators/PitchComposer.tsx; grep -q 'Already pitched' components/curators/PitchComposer.tsx; grep -Eq aria-live components/curators/PitchComposer.tsx; grep -q 'No pitches sent yet' components/curators/PitchHistoryList.tsx; grep -q PitchComposer 'app/(artist)/launchpad/[projectId]/page.tsx'; grep -q LaunchpadRoom 'app/(artist)/launchpad/[projectId]/page.tsx'; npm run build (tail) -- no type errors, /launchpad/[projectId] compiles"
        status: pass
    human_judgment: true
    rationale: "Full manual smoke (opening /launchpad/[projectId] in a browser as a signed-in artist, drafting a note, toggling curator selection, sending a pitch, and confirming the UI flips selected curators to 'Already pitched') was not exercised in this sandbox -- no live dev server / browser session available. Build-time route compilation, copy/behavior greps, and gating logic code review were verified automatically."

# Metrics
duration: ~40min
completed: 2026-07-01
status: complete
---

# Phase 06 Plan 04: Pitch Composer + Send Pipeline Summary

**AI-drafted 150-word pitch composer inside `/launchpad/[projectId]` with a server-side 3-gate re-validated send route (`/api/pitches`) that atomically writes `pitch_history` rows with per-row `response_token`s and emails curators from `PITCH_FROM_EMAIL`, degrading gracefully when that domain isn't configured**

## Performance

- **Duration:** ~40 min
- **Started:** 2026-07-01T22:10:00Z (approx.)
- **Completed:** 2026-07-01T22:50:00Z (approx.)
- **Tasks:** 3 (all `type="auto"`; Task 2 flagged `tdd="true"` in the plan, implemented against its `<behavior>` block since no test framework exists in this project)
- **Files modified:** 8 (5 created, 3 modified)

## Accomplishments
- `lib/curators/tokens.ts` is the single owner of both token shapes used across the playlist-pitching surface: `generateClaimToken()` (06-05) and `generateResponseToken()` (this plan, consumed by 06-06) — both 256-bit `crypto.randomBytes(32)` hex, matching `lib/split-sheets/approval.ts`'s existing shape
- `lib/email/index.ts`'s `sendEmail()` now accepts an optional `from` override, gating on the effective from address (`args.from ?? RESEND_FROM_EMAIL`) so pitch sends can use `PITCH_FROM_EMAIL` without disturbing the existing transactional-email default path (D-22)
- `lib/curators/pitch-copy.ts` + `app/api/pitches/draft/route.ts` AI-draft a playlist-specific, 150-word-capped pitch note per curator (reusing the PitchPlug JSON-fence extraction + demo-mode pattern) — draft-only, never writes `pitch_history`
- `app/api/pitches/route.ts` is the send route: 401 auth gate, three server-side re-validated gates (curator selected / non-empty note / word count ≤ 150 — T-06-11, never trusts the client's disabled-Send state), ownership check (project + track must belong to the caller, 404 otherwise), a pre-check + `23505` backstop duplicate guard, `do_not_pitch`/`email_valid=false` blocking, one atomic bulk `pitch_history` insert (all-or-nothing, so the DB-level `uniq_curator_track_pitch` race backstop can never produce a partial send), and best-effort email delivery via `PITCH_FROM_EMAIL` with player + accept/decline/unsubscribe(+claim, when available) footer links
- `components/curators/PitchComposer.tsx` renders the track selector, curator multi-select (reusing `CuratorCard`'s selectable mode with "Already pitched · {status}" / "Unsubscribed" / "Email bounced" disabled states), the "Draft a pitch note" → "Regenerate note" AI trigger, a live `aria-live="polite"` word counter (rose+bold at/over 150), a non-blocking amber drift-advisory banner, and a server-gated "Send pitch" button
- `components/curators/PitchHistoryList.tsx` renders per-project pitch history with the locked pending/accepted/declined badge triad (no "opened" state) and italic declined-reason text, with the verbatim empty-state copy
- `app/(artist)/launchpad/[projectId]/page.tsx` now fetches the project's tracks, the directory-safe curator list (with 90-day response rates), and this project's pitch history, and renders the composer + history below the existing checklist — the checklist render is untouched

## Task Commits

Each task was committed atomically:

1. **Task 1: Token generator + lib/email from-override + AI pitch-note drafter** - `187ca5e` (feat)
2. **Task 2: Send route — ownership + 3-gate server re-validation + duplicate 409 + pitch_history insert + email** - `4037494` (feat)
3. **Task 3: PitchComposer + PitchHistoryList components wired into the launchpad room** - `7e51796` (feat)

**Plan metadata:** committed alongside this SUMMARY (docs: complete plan)

## Files Created/Modified
- `lib/curators/tokens.ts` - `CLAIM_TOKEN_EXPIRY_HOURS`, `generateClaimToken()`, `generateResponseToken()`
- `lib/curators/pitch-copy.ts` - `buildPitchNotePrompt()`, `PITCH_NOTE_MAX_WORDS`
- `lib/email/index.ts` - added optional `from` override argument to `sendEmail()`
- `app/api/pitches/draft/route.ts` - AI-draft-only route (never writes `pitch_history`)
- `app/api/pitches/route.ts` - send route: gates, ownership, duplicate/blocked guard, atomic insert, email
- `components/curators/PitchComposer.tsx` - composer UI wired to `/api/pitches/draft` and `/api/pitches`
- `components/curators/PitchHistoryList.tsx` - per-project pitch history list
- `app/(artist)/launchpad/[projectId]/page.tsx` - added tracks/curators/pitch-history fetch + new sections

## Decisions Made
- `app/api/pitches/route.ts` was overwritten after discovering it pre-existed as a completely dead industry-pitch-credits feature (its own `pitches` table with `pitch_credits_remaining` subscription gating) with zero references anywhere else in the codebase — confirmed via `grep -rn "api/pitches"` and `grep -rn "from('pitches')"` across `app/`, `lib/`, and `components/` before replacing it, since this plan's locked artifact requires the exact same path for the curator-pitch send route.
- Duplicate-send and blocked-curator (unsubscribed/bounced) detection causes the whole send request to be rejected with 409 rather than silently sending to the eligible subset and skipping the rest — keeps the atomic bulk-insert semantics simple and matches the plan's manual-verification expectation of an explicit 409 on a forced re-send retry.
- Pitch history's curator name and track title are resolved from the curators/tracks arrays already fetched for the composer, rather than a Supabase embedded join on `pitch_history`, avoiding ambiguity in how postgrest shapes a to-one FK embed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Replaced a pre-existing, fully unused `app/api/pitches/route.ts` industry-pitch-credits route**
- **Found during:** Task 2 (writing the send route)
- **Issue:** `app/api/pitches/route.ts` already existed, implementing a completely different, pre-existing feature: pitching a vault project to a verified `industry_profiles` recipient, gated by `subscriptions.pitch_credits_remaining`, writing to a separate `pitches` table (from `001_initial_schema.sql`). This plan's locked artifact requires the exact same file path for the new curator-pitch send route — a genuine path collision, not a cosmetic one (a single `route.ts` can only export one `POST`/`GET` pair).
- **Fix:** Confirmed via `grep -rn "api/pitches"` and `grep -rn "from('pitches')"` across `app/`, `lib/`, and `components/` that no client code, page, or other server module calls this route or reads from the `pitches` table anywhere outside the file itself — it was orphaned/dead code. Replaced the file's contents with the curator-pitch send route specified by this plan.
- **Files modified:** `app/api/pitches/route.ts`
- **Verification:** `npm run build` compiles with no type errors; grep confirms no other references to the old `pitches`-table route existed before the change.
- **Committed in:** `4037494` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to ship this plan's locked `/api/pitches` send-route artifact at all. The replaced code was fully unreachable from any UI surface in this codebase; no functionality regression.

## Issues Encountered
None beyond the route-collision deviation above. `npm run build` compiled cleanly after every task. This project has no test framework (confirmed in `CLAUDE.md`), so Task 2's `tdd="true"` flag was satisfied via the plan's own `<behavior>` block, grep-based automated verification, and a full build — matching the established pattern from prior Phase 5/6 plans that hit the same constraint.

## User Setup Required

`PITCH_FROM_EMAIL` remains unset in this environment (per the plan's `user_setup` frontmatter — the dedicated `pitch.funun.studio` cold-outreach subdomain needs DNS + ~2-week warmup before it's usable). Send still completes and records the `pitch_history` row; `sendEmail()` no-ops gracefully (`ok: false`) until that env var is set in the Resend dashboard. No other new environment variables were introduced by this plan.

## Next Phase Readiness
- `response_token` is generated at send time on every `pitch_history` row — 06-06 (accept/decline/unsubscribe routes) can read and resolve it without generating its own tokens.
- `generateClaimToken()` and `CLAIM_TOKEN_EXPIRY_HOURS` are ready for 06-05 (curator claim portal) to import from `lib/curators/tokens.ts`.
- The pitch composer's footer already emits a claim link when `curator.claim_token` is present, gracefully omitting it otherwise — 06-05 only needs to start populating `claim_token` on curator rows for that link to activate.
- No blockers for 06-05 or 06-06.

---
*Phase: 06-playlist-curator-pitching*
*Completed: 2026-07-01*
