---
phase: 06-playlist-curator-pitching
fixed_at: 2026-07-02T03:05:37Z
review_path: .planning/phases/06-playlist-curator-pitching/06-REVIEW.md
iteration: 1
findings_in_scope: 12
fixed: 11
skipped: 1
status: partial
---

# Phase 06: Code Review Fix Report

**Fixed at:** 2026-07-02T03:05:37Z
**Source review:** .planning/phases/06-playlist-curator-pitching/06-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 12 (3 critical + 9 warning; fix_scope: critical_warning)
- Fixed: 11
- Skipped: 1

## Fixed Issues

### CR-01: Unescaped user-controlled content injected into pitch email HTML

**Files modified:** `app/api/pitches/route.ts`
**Commit:** e11f7c0
**Applied fix:** Added an `escapeHtml()` helper and applied it to `curator.name`, `trimmedNote`, and `track.title` before interpolation into the outbound email `html` field. Also added a new server-side character-length gate (`PITCH_NOTE_MAX_CHARS = 2000`) so a single unbroken "word" can no longer carry an arbitrarily large payload past the 150-word count gate.

### CR-02: `curators` RLS policies restrict rows, not columns — allowlists bypassable via direct Supabase REST access

**Files modified:** `supabase/migrations/031_curators_column_privileges.sql` (new)
**Commit:** 4172a29
**Applied fix:** Migration 030 is already applied to the live database, so this was implemented as a new additive migration (031) rather than editing 030 in place. It `REVOKE`s the blanket `authenticated`/`anon` column-level SELECT on `curators` and re-`GRANT`s SELECT scoped to the exact `DIRECTORY_COLUMNS` set (excluding `email`, `claim_token`, `claim_token_expires_at`, `baseline_genre_focus`, `submission_notes`). It also `REVOKE`s blanket UPDATE from `authenticated` and re-`GRANT`s UPDATE scoped to `CURATOR_SELF_EDITABLE_FIELDS` plus `drift_flagged` (the one server-computed column `app/api/curators/[id]/route.ts` legitimately writes alongside `genre_focus` in the same statement — omitting it would have broken that route's own UPDATE under the new column privileges). `service_role` bypasses RLS/grants entirely so no server-side code path is affected.
**Requires human verification:** This is a database-privilege change that must be applied to the live database (`supabase db push`) and confirmed there — it cannot be syntax-checked or exercised against a real Postgres instance in this environment. Please verify by running `supabase db push` and then attempting a direct PostgREST `select=claim_token,email` / `select=*` call against `curators` with an `authenticated` (non-service) JWT to confirm the restricted columns are no longer returned, and that the app's own directory/self-edit flows still work end-to-end.

### CR-03: `pitch_history.response_token` readable by the sending artist via direct REST access

**Files modified:** `supabase/migrations/031_curators_column_privileges.sql`
**Commit:** fb0f5e7
**Applied fix:** Same migration file as CR-02 (additive 031, not an edit of the already-applied 030), committed separately. `REVOKE`s blanket SELECT on `pitch_history` from `authenticated`/`anon` and re-`GRANT`s SELECT scoped to `id, project_id, track_id, curator_id, artist_id, note, status, decline_reason, sent_at, responded_at` — excluding `response_token`. No UPDATE/INSERT/DELETE grants added (all writes remain service-role-only, matching the existing design).
**Requires human verification:** Same as CR-02 — this must be pushed to the live database and confirmed there (e.g. confirm an authenticated artist can no longer `select=response_token` on their own `pitch_history` rows via direct PostgREST access, while `app/(artist)/launchpad/[projectId]/page.tsx`'s existing column-scoped read still works).

### WR-01: Curator-claim DB update errors never checked — claim can silently fail while reporting success

**Files modified:** `app/api/curators/claim/[token]/route.ts`
**Commit:** b7ab928
**Applied fix:** Both the "reuse existing auth account" branch and the primary `createUser()` branch now capture `{ error: claimError }` from the `curators` update and return a 500 with the error message instead of proceeding to send the magic-link email and report `{ ok: true }` on a failed update.

### WR-02: `sendEmail`'s `from` fallback contradicts its own documented no-op behavior

**Files modified:** `lib/email/index.ts`
**Commit:** 1a76733
**Applied fix:** Added a `usesFromOverride = 'from' in args` check (distinguishes "caller explicitly passed a `from` key, even with an undefined value" from "caller never mentioned `from`" — the former is true for `app/api/pitches/route.ts`'s `from: process.env.PITCH_FROM_EMAIL`). The no-op gate now checks `args.from`'s truthiness specifically when an override was intended, rather than the coalesced `from` value, matching the documented intent and preventing pitch emails from silently sending off `RESEND_FROM_EMAIL` when `PITCH_FROM_EMAIL` is unset. Verified no other caller in the codebase passes `from` at all (grepped all `sendEmail(` call sites), so existing non-pitch callers keep their original fallback behavior unchanged.

### WR-03: Pitch emails never set `replyTo`, so curator replies never reach the artist

**Files modified:** `app/api/pitches/route.ts`
**Commit:** 8b16aec
**Applied fix:** Added `replyTo: user.email` to the `sendEmail()` call in the pitch-send route. `user` is already loaded from `supabase.auth.getUser()` earlier in the handler, so no additional lookup was needed (adapted from the review's suggested `admin.getUserById()`/`artist_profiles` lookup since the email was already available on the session object).

### WR-04: AI-drafted note personalized to only the first selected curator, then sent identically to every curator

**Files modified:** `components/curators/PitchComposer.tsx`
**Commit:** 7e6ede5
**Applied fix:** Chose the "disable the AI-draft button when more than one curator is selected" option from the review's two suggested approaches (rather than per-curator personalized drafting/sending, which would require larger changes to both the draft and send routes). The draft button is now disabled when `selected.size > 1` with an explanatory `title` tooltip, and `draftNote()` also guards against being invoked with multiple curators selected (defense in depth against any future caller bypassing the disabled button).

### WR-05: Cron auth check vulnerable to a literal `Bearer undefined` bypass if `CRON_SECRET` is unset

**Files modified:** `app/api/cron/curator-reach/route.ts`
**Commit:** 50d169a
**Applied fix:** Added `!process.env.CRON_SECRET ||` to the auth check so the route fails closed (401) when the secret isn't configured, rather than allowing a literal `Authorization: Bearer undefined` header to pass.

### WR-06: `curators.claim_token` has no UNIQUE constraint (unlike `pitch_history.response_token`)

**Files modified:** `supabase/migrations/032_curators_claim_token_unique.sql` (new)
**Commit:** 86e11b2
**Applied fix:** New additive migration (032, since 030 is already applied) that drops the existing non-unique partial index on `claim_token` and recreates it as a `UNIQUE` partial index (`WHERE claim_token IS NOT NULL`), matching `pitch_history.response_token`'s existing `UNIQUE` constraint.
**Requires human verification:** Should be applied via `supabase db push` and confirmed there are no pre-existing duplicate non-null `claim_token` values in production that would cause the `CREATE UNIQUE INDEX` to fail (unlikely given 256-bit token generation, but worth a one-time check before push).

### WR-08: Several curator PATCH/POST routes don't guard `request.json()` against malformed bodies

**Files modified:** `app/api/curators/[id]/route.ts`, `app/api/admin/curators/route.ts`, `app/api/admin/curators/[id]/route.ts`
**Commit:** 4250c91
**Applied fix:** Changed `await request.json()` to `await request.json().catch(() => ({}))` in all three routes, matching the defensive pattern already used elsewhere in this phase (`app/api/pitches/route.ts`, `app/api/pitches/draft/route.ts`, `app/api/pitch/decline/[token]/route.ts`).

### WR-09: Bounce-email matching is case-sensitive, but curator emails are stored lowercased

**Files modified:** `app/api/webhooks/resend/route.ts`
**Commit:** f3ba275
**Applied fix:** Changed `.eq('email', recipient)` to `.eq('email', recipient.trim().toLowerCase())` to match the lowercase normalization applied everywhere curator emails are written.

## Skipped Issues

### WR-07: Resend bounce-type field/value assumptions are unconfirmed and have no fallback signal if wrong

**File:** `app/api/webhooks/resend/route.ts:30-38`, `lib/webhooks/resend-verify.ts:10-18`
**Reason:** The review's suggested fix ("at minimum log/record unmatched `email.bounced` payloads, e.g. to a `webhook_events` audit row or structured log") requires either (a) adding `console.warn`/`console.error` calls, which conflicts with this project's explicit CLAUDE.md convention "No console.log statements in committed code (clean output expected)" — confirmed via `grep` that zero `console.*` calls exist anywhere in the current codebase — or (b) introducing a new `webhook_events` audit table, which is a schema/observability-architecture decision (new migration, new table, retention policy) beyond the scope of a mechanical code fix and not something this fixer should decide unilaterally for a security-adjacent webhook path.
**Original issue:** The bounce-handling branch's field path (`event.data.bounce?.type ?? event.data.bounce_type`) and the string `'HardBounce'` are unconfirmed against Resend's live webhook payload shape (per the code's own comments). If either assumption is wrong, `email_valid` never flips to `false` for genuinely bounced curator addresses, and there is currently no way to discover that the assumption was wrong.
**Recommendation:** A human should decide the desired observability approach (e.g., a dedicated `webhook_events` table capturing raw payloads for a rolling window, or an approved structured-logging integration) as a follow-up work item — this is now the only unresolved finding in scope for iteration 1.

---

_Fixed: 2026-07-02T03:05:37Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
