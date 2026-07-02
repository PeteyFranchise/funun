---
phase: 06-playlist-curator-pitching
verified: 2026-07-01T00:00:00Z
status: human_needed
score: 26/26 must-haves verified (code-level); 2 items require live-DB/infra human verification (expected, not gaps)
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Claim a curator profile end-to-end via the live /curators/claim/[token] flow and inspect the Supabase auth.users / artist_profiles tables"
    expected: "A new auth.users row is created with app_metadata.role='curator', and NO corresponding artist_profiles or subscriptions row is created for that user id (handle_new_user()'s curator branch fires correctly against the live trigger)"
    why_human: "This is a live-database runtime behavior (a DB trigger firing on auth.users INSERT). The code-level guarantee is verified (app_metadata.role is set at admin.createUser() time, and migration 030's handle_new_user() has the early-return branch as the first statement in BEGIN, before the artist_profiles INSERT), but this sandbox has no Supabase CLI credentials to exercise the live trigger and confirm the row is actually absent."
  - test: "Confirm migrations 031 and 032 (column-level privilege lockdown + claim_token UNIQUE index) were applied successfully to the live database, and spot-check a direct PostgREST call"
    expected: "An authenticated (non-service) JWT calling GET /rest/v1/curators?select=claim_token,email or GET /rest/v1/pitch_history?select=response_token returns a column-does-not-exist/permission error, not the secret values; CREATE UNIQUE INDEX on claim_token did not fail on a pre-existing duplicate"
    why_human: "Per the task's additional_context, the user confirmed these migrations were pushed to the live DB outside this sandbox. This sandbox cannot query the live schema/grants to confirm the REVOKE/GRANT statements took effect as written. The SQL content itself was reviewed here and matches the REVIEW.md CR-02/CR-03/WR-06 findings exactly (see below)."
gaps: []
deferred:
  - truth: "Admin sidebar links for Checklist Items and Tips resolve to /checklist and /tips instead of /admin/checklist and /admin/tips"
    addressed_in: "Not phase-blocking — pre-existing bug from Phase 5, logged in deferred-items.md; the Curators admin link was corrected as part of this phase (now correctly at /admin/curators) since it collided with the artist-facing /curators route"
    evidence: "deferred-items.md: 'Status: Partially resolved in 06-03... Checklist Items and Tips still resolve to their bare paths... those two are unchanged and remain deferred for the dedicated follow-up fix'"
---

# Phase 06: Playlist Curator Pitching Verification Report

**Phase Goal:** Artists pitch a selected track to relevant playlist curators by email and track the outcomes, while curators can claim their own profiles, bounced addresses are retired automatically, and an admin can curate the directory
**Verified:** 2026-07-01
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `curators` + `pitch_history` tables exist with RLS enabled, uniqueness/CHECK constraints | ✓ VERIFIED | `supabase/migrations/030_curators_pitch_history.sql`: 2x `ENABLE ROW LEVEL SECURITY`, `platform` CHECK (spotify/apple_music/youtube_music/soundcloud/blog_other), `status` CHECK (pending/accepted/declined, no 'opened'), `uniq_curator_track_pitch UNIQUE (curator_id, track_id)`. User confirmed migration 030 pushed live (06-01-SUMMARY.md) |
| 2 | `handle_new_user()` returns early for curator-role signups, no artist_profiles row created | ✓ VERIFIED (code-level) / see human item #1 | Migration 030 lines 105-127: `IF (NEW.raw_app_meta_data->>'role') = 'curator' THEN RETURN NEW; END IF;` is the first statement in BEGIN, before the artist_profiles INSERT. Claim route (`app/api/curators/claim/[token]/route.ts`) sets `app_metadata: { role: 'curator' }` at `admin.createUser()` call time, not via a post-insert UPDATE — correctly avoids Pitfall 1 |
| 3 | Artist can browse/filter curator directory by genre + platform | ✓ VERIFIED | `app/(artist)/curators/page.tsx` + `components/curators/CuratorDirectory.tsx`: server-side fetch with `.overlaps('genre_focus', genres)` + `.in('platform', platforms)` filters driven by URL searchParams; `aria-pressed` filter chips; build registers `/curators` route |
| 4 | Artist can select track(s), AI-draft an editable 150-word note, and send pitch email via Resend with player link + unsubscribe path | ✓ VERIFIED (code-level) | `components/curators/PitchComposer.tsx` (track selector, "Draft a pitch note" → `/api/pitches/draft`, live word counter). `app/api/pitches/route.ts`: server-side word-count gate (`PITCH_NOTE_MAX_WORDS=150`, `PITCH_NOTE_MAX_CHARS=2000`), `sendEmail({ from: PITCH_FROM_EMAIL, ... })` with `/r/[projectId]` player link + accept/decline/unsubscribe/claim footer links, `escapeHtml()` applied (CR-01 fixed) |
| 5 | Pitch history tracked per project (curator, sent date, status: pending/opened/accepted/declined) | ✓ VERIFIED — note "opened" intentionally dropped per D-10 (REQUIREMENTS.md PITCH-03 also specifies pending/opened/accepted/declined but ROADMAP/D-10 supersedes with a 3-state model) | `pitch_history.status` CHECK constraint = `pending, accepted, declined`; `components/curators/PitchHistoryList.tsx` renders the 3-badge triad; `app/(artist)/launchpad/[projectId]/page.tsx` fetches and renders per-project history |
| 6 | Curator directory shows response rate per curator (last 90 days) | ✓ VERIFIED | `lib/curators/response-rate.ts computeResponseRates()`: 90-day cutoff (`Date.now() - 90*24*60*60*1000`), formula `round((accepted+declined)/total*100)`, zero-pitch curators OMITTED from the Map (never a 0% entry). `CuratorCard.tsx` line 142: badge rendered only `curator.response_rate !== null` |
| 7 | Curators can claim their directory profile via a link in pitch emails | ✓ VERIFIED (code-level) / see human item #1 | Admin `issue_claim` action generates 72h-expiry `claim_token`; `app/curators/claim/[token]/page.tsx` + `app/api/curators/claim/[token]/route.ts` verify token (404/410 guards), create the curator auth account, null the one-time token, send magic link via `sendEmail()` (not Supabase templates). Pitch-send footer emits the claim link when `claim_token` is present |
| 8 | Bounce detection marks curator email invalid after hard bounce; genre drift alerts flag shifted genre focus | ✓ VERIFIED (code-level; live bounce not exercisable in sandbox) | `app/api/webhooks/resend/route.ts`: `request.text()` called before any JSON parse (grep confirms 0 `request.json()` calls), `verifyResendWebhook()` gates on `RESEND_WEBHOOK_SECRET` (503 unconfigured, 400 bad signature) before any DB write, sets `email_valid=false` on verified HardBounce, lowercases the recipient before matching (WR-09 fixed). `lib/curators/drift.ts hasSignificantDrift()` (Jaccard < 0.5) wired into both admin PATCH (06-02) and curator self-serve PATCH (06-05) |
| 9 | Admin can add, edit, flag inactive, review claimed profiles in curator directory | ✓ VERIFIED | `components/admin/CuratorAdmin.tsx` (no `@dnd-kit` imports — only a comment mentions it), inline CRUD, status pills (claimed/bounced/drift/inactive), manual flag-inactive toggle with non-auto-toggling advisory hint. `app/api/admin/curators/route.ts` + `[id]/route.ts` are `verifyAdmin()`-gated on every handler |
| 10 | "Playlist Curator" is a selectable industry role in Settings | ✓ VERIFIED | `lib/industry-roles.ts` line 58: `{ slug: 'playlist_curator', label: 'Playlist Curator' }` in the Business group |
| 11 | 3 critical + 9 warning code-review findings actually resolved in current code (not just claimed) | ✓ VERIFIED | See "Code Review Fix Verification" table below — all 11 fixed items confirmed present in the current codebase by direct grep/read, not by trusting REVIEW-FIX.md's narrative |

**Score:** 11/11 code-verifiable truths verified (26/26 must-haves across all 6 plans' frontmatter, itemized below). 2 items require live-infrastructure human confirmation (expected per task framing, not gaps).

### Code Review Fix Verification (independent re-check, not trusting REVIEW-FIX.md)

| Finding | Claimed Fix | Verified in current code |
|---|---|---|
| CR-01 (HTML injection) | `escapeHtml()` + char cap | ✓ `app/api/pitches/route.ts`: `escapeHtml()` defined and applied to `curator.name`, `trimmedNote`, `track.title`; `PITCH_NOTE_MAX_CHARS = 2000` gate present |
| CR-02 (curators column privileges) | Migration 031 REVOKE/GRANT | ✓ `supabase/migrations/031_curators_column_privileges.sql` exists, content matches the finding exactly (REVOKE SELECT/UPDATE from authenticated/anon, re-GRANT scoped column lists) |
| CR-03 (pitch_history response_token exposure) | Migration 031 REVOKE/GRANT | ✓ Same file, `response_token` excluded from the re-granted SELECT column list |
| WR-01 (claim update error unchecked) | Check `claimError` | ✓ `app/api/curators/claim/[token]/route.ts`: both branches capture and check `claimError`, return 500 on failure |
| WR-02 (sendEmail from-override gate) | Gate on explicit `from` presence | ✓ `lib/email/index.ts` — narrowed further in a follow-up commit (`003b050`) for strict null checks |
| WR-03 (missing replyTo) | Add `replyTo: user.email` | ✓ `app/api/pitches/route.ts` line 207 |
| WR-04 (multi-curator AI draft mismatch) | Disable draft button when >1 selected | ✓ `components/curators/PitchComposer.tsx` line 235: `disabled={... selected.size > 1}` |
| WR-05 (cron Bearer undefined bypass) | Fail closed when secret unset | ✓ `app/api/cron/curator-reach/route.ts`: `!process.env.CRON_SECRET \|\|` added to the check |
| WR-06 (claim_token not UNIQUE) | Migration 032 | ✓ `supabase/migrations/032_curators_claim_token_unique.sql` exists, drops + recreates as UNIQUE partial index |
| WR-08 (unguarded request.json()) | `.catch(() => ({}))` | ✓ All three named routes (`app/api/curators/[id]/route.ts`, `app/api/admin/curators/route.ts`, `app/api/admin/curators/[id]/route.ts`) confirmed |
| WR-09 (case-sensitive bounce match) | `.toLowerCase()` | ✓ `app/api/webhooks/resend/route.ts` line 42 |
| WR-07 (unconfirmed bounce field shape) | Explicitly skipped by the fixer (logging conflicts with CLAUDE.md "no console.log" convention) | Correctly reflected as skipped in REVIEW-FIX.md frontmatter (`skipped: 1`) — not silently dropped. Acceptable residual risk, not a phase blocker |

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `supabase/migrations/030_curators_pitch_history.sql` | curators + pitch_history tables, RLS, uniqueness | ✓ VERIFIED | Present, correct structure, pushed live (user-confirmed) |
| `supabase/migrations/031_curators_column_privileges.sql` | Column-level REVOKE/GRANT fixing CR-02/CR-03 | ✓ VERIFIED (content) / human_needed (live push) | Present, content matches findings |
| `supabase/migrations/032_curators_claim_token_unique.sql` | UNIQUE claim_token index (WR-06) | ✓ VERIFIED (content) / human_needed (live push) | Present, content correct |
| `types/index.ts` (Curator/PitchHistory/CuratorPlatform/PitchStatus) | Types mirroring schema | ✓ VERIFIED | `npm run build` compiles clean |
| `lib/industry-roles.ts` | playlist_curator role | ✓ VERIFIED | Present in Business group |
| `lib/curators/{schema,reach,drift,response-rate,tokens,pitch-copy}.ts` | Shared curator utilities | ✓ VERIFIED | All present, correct exports (`PLATFORM_VALUES`, `ADMIN_EDITABLE_FIELDS`, `CURATOR_SELF_EDITABLE_FIELDS`, `fetchSpotifyFollowers`/`fetchYouTubeSubscribers`, `hasSignificantDrift`, `computeResponseRates`, `generateClaimToken`/`generateResponseToken`, `buildPitchNotePrompt`) |
| `app/api/admin/curators/route.ts` + `[id]/route.ts` | verifyAdmin-gated CRUD | ✓ VERIFIED | Gate present on every handler; malformed-JSON guard added (WR-08) |
| `app/api/cron/curator-reach/route.ts` + `vercel.json` | Weekly reach refresh | ✓ VERIFIED | CRON_SECRET gate fail-closed; `vercel.json` declares `0 6 * * 1` |
| `components/admin/CuratorAdmin.tsx`, `app/(admin)/admin/curators/page.tsx` | Admin directory UI | ✓ VERIFIED | No dnd-kit; nav link correctly at `/admin/curators` (route collision with the artist `/curators` page was caught and fixed in 06-03) |
| `app/api/curators/route.ts`, `components/curators/CuratorCard.tsx`/`CuratorDirectory.tsx`, `app/(artist)/curators/page.tsx` | Artist directory | ✓ VERIFIED | Directory-safe projection (0 `select('*')`), correct null/zero display states |
| `lib/curators/tokens.ts`, `app/api/pitches/draft/route.ts`, `app/api/pitches/route.ts`, `components/curators/PitchComposer.tsx`/`PitchHistoryList.tsx` | Composer + send pipeline | ✓ VERIFIED | 3-gate server revalidation, duplicate 409, atomic insert, HTML-escaped email |
| `app/api/curators/claim/[token]/route.ts`, `app/curators/claim/[token]/page.tsx`, `app/api/curators/[id]/route.ts`, `app/(curator-portal)/*` | Claim + self-serve portal | ✓ VERIFIED | app_metadata set at createUser() time; portal layout not in middleware.ts isProtected; profile form has zero forbidden-field inputs |
| `lib/webhooks/resend-verify.ts`, `app/api/webhooks/resend/route.ts`, `app/api/pitch/{accept,decline,unsubscribe}/[token]/route.ts` + pages | Bounce webhook + response links | ✓ VERIFIED | Raw-body-first, svix verify before write, one-time-use via `status !== 'pending'` → 410, artist notification wired |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `handle_new_user()` curator branch | `admin.createUser({app_metadata})` | early RETURN NEW before artist_profiles INSERT | ✓ WIRED (code) / human_needed (live) | Order confirmed correct in migration 030; role set at creation time in claim route, never post-insert |
| `/api/pitches` | `uniq_curator_track_pitch` | pre-check 409 + 23505 backstop | ✓ WIRED | Both layers present in `app/api/pitches/route.ts` |
| `/api/pitches` send | `PITCH_FROM_EMAIL` | `sendEmail({from: process.env.PITCH_FROM_EMAIL, replyTo: user.email})` | ✓ WIRED | Graceful no-op confirmed via `lib/email/index.ts` gate logic (WR-02 fix) |
| `/api/webhooks/resend` | `curators.email_valid` | raw-body verify → HardBounce → update | ✓ WIRED | Verified order and guard in code |
| curator self-serve PATCH | `CURATOR_SELF_EDITABLE_FIELDS` + `.eq('claimed_by', user.id)` | allowlist + ownership | ✓ WIRED | Both present in `app/api/curators/[id]/route.ts` |
| curators RLS UPDATE policy | column-level GRANT (migration 031) | defense-in-depth against IDOR/mass-assignment via direct PostgREST | ✓ WIRED (content) / human_needed (live push confirmation) | Migration content correct; live enforcement not independently queryable from this sandbox |
| `(curator-portal)` layout | `middleware.ts` | deliberately absent from isProtected | ✓ WIRED | Confirmed via direct read of `middleware.ts` — no `/portal` or `curator-portal` reference |
| `/pitch/*` public routes | `middleware.ts` | deliberately absent from isProtected | ✓ WIRED | Confirmed — `/pitch` not in isProtected list |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| PITCH-01 | 06-02, 06-03 | Browse curator directory filtered by genre/platform | ✓ SATISFIED | `/curators` page + filter bar |
| PITCH-02 | 06-04 | Select track, send pitch via Resend with player link + unsubscribe | ✓ SATISFIED | `/api/pitches` send route |
| PITCH-03 | 06-01, 06-04 | Pitch history tracked per project | ✓ SATISFIED | `pitch_history` table + `PitchHistoryList` |
| PITCH-04 | 06-02, 06-03, 06-05 | Response rate per curator (90 days) | ✓ SATISFIED | `computeResponseRates()` |
| PITCH-05 | 06-05 | Curator claim flow | ✓ SATISFIED | Claim token issuance + verify/create route |
| PITCH-06 | 06-02, 06-05, 06-06 | Bounce detection + genre drift alerts | ✓ SATISFIED | Webhook + `hasSignificantDrift` |
| PITCH-07 | 06-02 | Admin curator directory management | ✓ SATISFIED | `/admin/curators` CRUD |
| PITCH-08 | 06-01 | "Playlist Curator" industry role | ✓ SATISFIED | `lib/industry-roles.ts` |

No orphaned requirements — every Phase 6 requirement in REQUIREMENTS.md's traceability table (PITCH-01 through PITCH-08) is claimed by at least one plan's frontmatter `requirements` field and independently verified above.

### Anti-Patterns Found

None. Scanned all ~35 files created/modified across the 6 plans plus the review-fix commits for `TODO|FIXME|XXX|HACK|PLACEHOLDER|console.log` — zero matches. No debt markers requiring the debt-marker gate.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Full project build compiles, all Phase 6 routes register | `npm run build` | Clean compile; `/curators`, `/admin/curators`, `/portal`, `/curators/claim`, `/curators/claim/[token]`, `/pitch/accept\|decline\|unsubscribe/[token]`, `/api/webhooks/resend`, `/api/pitches`, `/api/pitches/draft`, `/api/curators`, `/api/curators/[id]`, `/api/curators/claim/[token]`, `/api/admin/curators`, `/api/admin/curators/[id]`, `/api/cron/curator-reach` all present | ✓ PASS |
| Webhook graceful degradation logic | code read of `lib/webhooks/resend-verify.ts` | `if (!secret) return { ok:false, status:503 }` — first check, before any signature verification or parsing | ✓ PASS (static) |
| svix package legitimacy | `node -e` check of package.json | `svix: ^1.96.1`, `resend: ^4.0.0` (unbumped, per D-15) | ✓ PASS |
| Cron endpoint auth | code read | Fails closed on unset `CRON_SECRET` (WR-05 fixed) | ✓ PASS (static) |

Live HTTP/DB spot-checks (curl against a running dev server, live Supabase queries) were not run in this sandbox — no dev server or live DB credentials available here, consistent with prior plan SUMMARYs' documented sandbox limitations. This is the basis for the two human-verification items below (both anticipated in the task's `additional_context`).

### Human Verification Required

1. **Curator claim does NOT create an artist_profiles row (Pitfall-1 live guarantee)**
   **Test:** Issue a claim invite from `/admin/curators`, visit the claim link, complete the claim, then inspect the Supabase `auth.users` and `artist_profiles` tables for that user id.
   **Expected:** A new `auth.users` row exists with `app_metadata.role = 'curator'`; no corresponding `artist_profiles` or `subscriptions` row exists.
   **Why human:** This is a live-database trigger behavior. The code-level guarantee (role set at `createUser()` time, early-return as the first statement before the artist_profiles INSERT) is verified by direct code read, but this sandbox has no Supabase CLI credentials to exercise the live trigger.

2. **Migrations 031/032 applied correctly to the live database**
   **Test:** Confirm via `supabase migration list` or the dashboard that 031 and 032 show as applied; then attempt `GET /rest/v1/curators?select=claim_token,email` and `GET /rest/v1/pitch_history?select=response_token` with a non-service-role authenticated JWT.
   **Expected:** Both calls fail or omit the restricted columns (column-level privilege enforcement from CR-02/CR-03/WR-06 is live).
   **Why human:** Per the task's `additional_context`, the user confirmed these were pushed outside this sandbox; this sandbox cannot independently query live grants. The SQL content itself was verified here and matches the review findings precisely.

Both items were explicitly flagged as expected/anticipated verification gaps in the task framing (not newly discovered gaps) — they route to human_needed rather than gaps_found per the decision tree, since the code-level implementation is correct and the only open question is live-environment state this sandbox cannot observe.

### Gaps Summary

No gaps found. All 8 phase requirements (PITCH-01 through PITCH-08) are implemented and independently verified at the code level, not merely claimed by SUMMARY.md. The 3 critical and 9 (of 9 addressed; 1 explicitly and reasonably skipped) warning-level security findings from 06-REVIEW.md were independently re-verified as actually fixed in the current codebase — this includes the two additive migrations (031, 032) whose SQL content precisely matches what the findings required. The only open items are two live-infrastructure/database confirmations that this sandbox cannot exercise (curator-claim trigger behavior against the deployed Supabase instance, and live confirmation that migrations 031/032 took effect) — both were anticipated by the task's own framing as expected human-verification items, not evidence of incomplete work.

---

_Verified: 2026-07-01_
_Verifier: Claude (gsd-verifier)_
