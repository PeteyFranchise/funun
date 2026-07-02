---
phase: 06-playlist-curator-pitching
reviewed: 2026-07-01T00:00:00Z
depth: standard
files_reviewed: 37
files_reviewed_list:
  - app/(admin)/layout.tsx
  - app/(artist)/curators/page.tsx
  - app/(artist)/launchpad/[projectId]/page.tsx
  - app/(curator-portal)/layout.tsx
  - app/(curator-portal)/portal/page.tsx
  - app/api/admin/curators/[id]/route.ts
  - app/api/admin/curators/route.ts
  - app/api/cron/curator-reach/route.ts
  - app/api/curators/[id]/route.ts
  - app/api/curators/claim/[token]/route.ts
  - app/api/curators/route.ts
  - app/api/pitch/accept/[token]/route.ts
  - app/api/pitch/decline/[token]/route.ts
  - app/api/pitch/unsubscribe/[token]/route.ts
  - app/api/pitches/draft/route.ts
  - app/api/pitches/route.ts
  - app/api/webhooks/resend/route.ts
  - app/curators/claim/[token]/page.tsx
  - app/curators/claim/page.tsx
  - app/pitch/accept/[token]/page.tsx
  - app/pitch/decline/[token]/page.tsx
  - app/pitch/unsubscribe/[token]/page.tsx
  - components/admin/CuratorAdmin.tsx
  - components/curators/ClaimButton.tsx
  - components/curators/CuratorCard.tsx
  - components/curators/CuratorDirectory.tsx
  - components/curators/CuratorProfileForm.tsx
  - components/curators/PitchComposer.tsx
  - components/curators/PitchHistoryList.tsx
  - lib/curators/drift.ts
  - lib/curators/pitch-copy.ts
  - lib/curators/reach.ts
  - lib/curators/response-rate.ts
  - lib/curators/schema.ts
  - lib/curators/tokens.ts
  - lib/email/index.ts
  - lib/industry-roles.ts
  - lib/webhooks/resend-verify.ts
  - supabase/migrations/030_curators_pitch_history.sql
  - types/index.ts
findings:
  critical: 3
  warning: 9
  info: 2
  total: 14
status: issues_found
---

# Phase 06: Code Review Report

**Reviewed:** 2026-07-01
**Depth:** standard
**Files Reviewed:** 37 (`types/index.ts` and `lib/industry-roles.ts` reviewed for context; no defects found in either)
**Status:** issues_found

## Summary

Reviewed the Wave-3 "Playlist Curator Pitching" surface end-to-end: token generation/verification (claim + accept/decline/unsubscribe), the admin/self-serve curator CRUD routes and their field allowlists, the pitch-send route's ownership + 3-gate re-validation, migration 030's RLS policies, and the Resend/svix webhook verification.

The application-layer allowlisting (`ADMIN_EDITABLE_FIELDS`, `CURATOR_SELF_EDITABLE_FIELDS`, the pitch-send 3-gate re-validation, and the directory column projection) is implemented correctly and consistently. The svix webhook verification correctly reads the raw body before parsing and gates on the configured secret.

However, the new RLS policies in migration 030 only restrict *which rows* a client can read/write, not *which columns* — and Supabase's default schema privileges grant `authenticated` (and possibly `anon`) full column-level SELECT/UPDATE on any RLS-enabled table with a matching policy. Since this app never revokes/re-grants column-level privileges anywhere, the careful column allowlisting done in the Next.js API routes (`DIRECTORY_COLUMNS`, `CURATOR_SELF_EDITABLE_FIELDS`) can be bypassed entirely by any authenticated user calling the Supabase REST API directly with their own session — exposing `claim_token`/`email` and allowing arbitrary column writes on `curators`, and exposing `response_token` on the artist's own `pitch_history` rows. There is also a genuine HTML-injection bug in the pitch-send email builder. Details and fixes below.

## Critical Issues

### CR-01: Unescaped user-controlled content injected into pitch email HTML

**File:** `app/api/pitches/route.ts:178-204`
**Issue:** The pitch note (`trimmedNote`, fully artist-controlled free text with no length cap beyond a 150-*word* count) and the track title (`track.title`, also artist-controlled) are interpolated directly into the outbound email's `html` field with no escaping:
```ts
html: `
  <p>Hi ${curator.name},</p>
  <p>${trimmedNote.replace(/\n/g, '<br />')}</p>
  <p><a href="${playerUrl}" ...>Listen to "${track.title}"</a></p>
  ...
`,
```
An artist can embed arbitrary HTML/markup (extra links, fake "Unsubscribe"/"Accept" buttons pointing elsewhere, tracking pixels, spoofed branding, etc.) into an email Funūn sends to a curator's real inbox on the artist's behalf. This is a genuine HTML/content-injection vector into a transactional email channel the platform controls, and it can be used for phishing curators or defacing/redirecting the legitimate accept/decline/unsubscribe links that appear right below the injected content. Note there is also no character-length cap on the note (only a whitespace-based word count), so a single unbroken "word" can carry an arbitrarily large payload while still passing the 150-word gate.
**Fix:** HTML-escape both `trimmedNote` and `track.title` before interpolation (and consider a max character length on the note in addition to the word-count gate):
```ts
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
...
html: `
  <p>Hi ${escapeHtml(curator.name)},</p>
  <p>${escapeHtml(trimmedNote).replace(/\n/g, '<br />')}</p>
  <p><a href="${playerUrl}" ...>Listen to "${escapeHtml(track.title)}"</a></p>
  ...
`,
```

### CR-02: `curators` RLS policies restrict rows, not columns — allowlists are bypassable via direct Supabase REST access

**File:** `supabase/migrations/030_curators_pitch_history.sql:40-49`
**Issue:** The migration defines:
```sql
CREATE POLICY "Anyone can read curators" ON curators FOR SELECT USING (true);
CREATE POLICY "Claimed curators update own row" ON curators
  FOR UPDATE USING (auth.uid() = claimed_by) WITH CHECK (auth.uid() = claimed_by);
```
Postgres RLS `USING`/`WITH CHECK` clauses gate *rows*, not *columns*. Supabase's default schema bootstrapping grants `authenticated`/`anon` full column-level SELECT/UPDATE privileges on tables in `public` unless explicitly revoked — and this migration (like every other migration in the repo — confirmed via `grep -rn "REVOKE\|GRANT " supabase/migrations/`) never revokes or re-grants column-level privileges. That means:
- **SELECT**: Any authenticated caller (the SELECT policy is `USING(true)`, i.e. not even scoped to `claimed_by`) can query the `curators` table directly via the Supabase REST endpoint with `select=*` (or `select=claim_token,email`) and retrieve `claim_token`, `claim_token_expires_at`, `email`, `baseline_genre_focus`, and `submission_notes` for *every* curator — entirely bypassing the `DIRECTORY_COLUMNS` projection that `app/api/curators/route.ts`, `app/(artist)/curators/page.tsx`, and `app/(artist)/launchpad/[projectId]/page.tsx` all carefully use (and that the code comments explicitly call out as "NEVER select('*')", T-06-08). Harvesting an unclaimed curator's `claim_token` this way lets an attacker claim that curator's profile before the real curator does — a full account-takeover path.
- **UPDATE**: A claimed curator's own JWT satisfies `auth.uid() = claimed_by` for the UPDATE policy, so they can `PATCH` their own row directly via PostgREST with *any* column in the payload — not just the `CURATOR_SELF_EDITABLE_FIELDS` allowlist enforced in `app/api/curators/[id]/route.ts`. This lets a claimed curator directly flip `email_valid` back to `true` after a hard bounce, clear `drift_flagged`/rewrite `baseline_genre_focus` to hide a genre-focus shift, change their own `email`, or fabricate `reach_signal`/`reach_fetched_at` to inflate their apparent audience size shown to artists in the directory — completely bypassing the mass-assignment protection the API route was specifically built to provide (T-06-06).
**Fix:** Enforce column-level privileges in the migration in addition to the row policies, e.g.:
```sql
REVOKE SELECT ON curators FROM authenticated, anon;
GRANT SELECT (id, name, playlist_name, playlist_url, platform, genre_focus,
              reach_signal, reach_fetched_at, drift_flagged, do_not_pitch,
              email_valid, claimed_by) ON curators TO authenticated;

REVOKE UPDATE ON curators FROM authenticated;
GRANT UPDATE (genre_focus, platform, playlist_url, playlist_name, submission_notes)
  ON curators TO authenticated;
```
(Server-side `service_role` code paths are unaffected since `service_role` bypasses RLS/grants.) Alternatively, drop the blanket `authenticated`/`anon` grants entirely for this table and force every read/write through service-role-backed API routes only.

### CR-03: `pitch_history.response_token` is readable by the sending artist via direct REST access, enabling self-triggered accept/decline

**File:** `supabase/migrations/030_curators_pitch_history.sql:86-87`
**Issue:**
```sql
CREATE POLICY "Artists read own pitch history" ON pitch_history
  FOR SELECT USING (auth.uid() = artist_id);
```
Same column-vs-row gap as CR-02: this policy correctly restricts *which rows* an artist can see (their own sent pitches), but places no restriction on *which columns*, including `response_token`. The application code is careful to never select `response_token` for the artist-facing views (`app/(artist)/launchpad/[projectId]/page.tsx` selects `'id, curator_id, track_id, status, sent_at, decline_reason'`), but an artist can bypass that entirely and query `GET /rest/v1/pitch_history?select=response_token,curator_id&artist_id=eq.<self>` directly with their own session, retrieve the tokens for pitches they sent, and then call the *public, token-authenticated* `POST /api/pitch/accept/[token]` / `.../decline/[token]` endpoints themselves — impersonating the curator's response. Because `computeResponseRates()` (`lib/curators/response-rate.ts`) aggregates `accepted`/`declined` counts per curator directly from `pitch_history.status`, an artist can use this to inflate (or deflate) a curator's public response-rate badge shown to every other artist in the directory, undermining the integrity of that marketplace signal.
**Fix:** Same remediation pattern as CR-02 — revoke blanket SELECT and grant column-level SELECT excluding `response_token` to `authenticated`:
```sql
REVOKE SELECT ON pitch_history FROM authenticated, anon;
GRANT SELECT (id, project_id, track_id, curator_id, artist_id, note, status,
              decline_reason, sent_at, responded_at)
  ON pitch_history TO authenticated;
```

## Warnings

### WR-01: Curator-claim DB update errors are never checked — claim can silently fail while reporting success

**File:** `app/api/curators/claim/[token]/route.ts:62-65, 75-78`
**Issue:** Both the "reuse existing auth account" branch and the primary `createUser()` branch update the `curators` row without checking the returned `error`:
```ts
await service
  .from('curators')
  .update({ claimed_by: created.user.id, claim_token: null })
  .eq('id', curator.id)
```
If this update fails (transient DB error, etc.), the route still sends the magic-link email and returns `{ ok: true }` to the caller. The curator will receive a working sign-in email, but `(curator-portal)/portal/page.tsx` looks up the curator via `.eq('claimed_by', user.id)`, finds nothing, and redirects them to `/`. Additionally, since `claim_token` was never nulled, the token remains valid and reusable, contradicting the documented one-time-use design (T-06-01/PITCH-05).
**Fix:** Check the error and surface a 500 instead of a false success:
```ts
const { error: claimError } = await service
  .from('curators')
  .update({ claimed_by: created.user.id, claim_token: null })
  .eq('id', curator.id)
if (claimError) return NextResponse.json({ error: claimError.message }, { status: 500 })
```

### WR-02: `sendEmail`'s `from` fallback contradicts its own documented no-op behavior

**File:** `lib/email/index.ts:14-26`
**Issue:** The doc comment for `from` states: "the no-op-when-unconfigured gate checks THIS value, not RESEND_FROM_EMAIL, so a send fails gracefully until the override's domain is live." The implementation does the opposite — it coalesces before the gate check:
```ts
const from = args.from ?? process.env.RESEND_FROM_EMAIL
if (!apiKey || !from) { return { ok: false, error: 'Email not configured' } }
```
If `PITCH_FROM_EMAIL` (passed as `args.from` from `app/api/pitches/route.ts`) is unset but `RESEND_FROM_EMAIL` *is* configured (true today for existing features like Antenna notifications), pitch emails silently send from the main transactional domain instead of gracefully no-op'ing — defeating the entire purpose of a dedicated cold-outreach subdomain (D-22: protecting the main domain's sender reputation from cold-outreach bounces/spam complaints).
**Fix:** Gate on `args.from` specifically when it's meant to be a hard override, or make the intent explicit:
```ts
const from = args.from ?? process.env.RESEND_FROM_EMAIL
const configured = args.from ? !!args.from : !!process.env.RESEND_FROM_EMAIL
if (!apiKey || !configured) { return { ok: false, error: 'Email not configured' } }
```
Or simplest: don't pass `process.env.PITCH_FROM_EMAIL` as `args.from` when unset (pass `undefined` explicitly), and require `PITCH_FROM_EMAIL` to be present for the pitch flow to no-op cleanly, matching the comment's stated intent.

### WR-03: Pitch emails never set `replyTo`, so curator replies never reach the artist

**File:** `app/api/pitches/route.ts:174-204`
**Issue:** `sendEmail`'s `replyTo` parameter is documented specifically for this use case ("Where replies should go (e.g. the artist's own address on a pitch)" — `lib/email/index.ts:13`), but the pitch-send call never passes it:
```ts
const result = await sendEmail({
  to: curator.email,
  from: process.env.PITCH_FROM_EMAIL,
  subject: ...,
  html: ...,
  text: ...,
})
```
A curator who wants to reply with a question (rather than using the Accept/Decline links) will have their reply go to `PITCH_FROM_EMAIL`'s own reply address — likely an unmonitored cold-outreach mailbox — not back to the artist.
**Fix:** Fetch the artist's email (e.g. via `service.auth.admin.getUserById(user.id)` or `artist_profiles`) and pass it as `replyTo`.

### WR-04: AI-drafted note is personalized to only the first selected curator, then sent identically to every selected curator

**File:** `components/curators/PitchComposer.tsx:78-104, 106-141`
**Issue:** `draftNote()` calls `/api/pitches/draft` using only `Array.from(selected)[0]` — the first selected curator — and `buildPitchNotePrompt` explicitly instructs the model to reference *that* curator's playlist name and genre focus so "it reads as playlist-specific, not a form letter" (`lib/curators/pitch-copy.ts:56`). `sendPitch()` then sends the exact same `note` string to every curator in `selected`, including ones whose playlist name/genre focus differ from the one referenced in the drafted text. This defeats the core "playlist-specific" value proposition (D-05) for any multi-curator send and can produce an obviously wrong note (e.g. referencing "Indie Vibes" in an email actually sent to the curator of "Late Night Beats").
**Fix:** Either disable/hide the AI-draft button when more than one curator is selected, or draft (and send) a separately-personalized note per curator.

### WR-05: Cron auth check is vulnerable to a literal `Bearer undefined` bypass if `CRON_SECRET` is unset

**File:** `app/api/cron/curator-reach/route.ts:13-16`
**Issue:**
```ts
const authHeader = request.headers.get('authorization')
if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
  return new NextResponse('Unauthorized', { status: 401 })
}
```
If `CRON_SECRET` is unset in a given environment, the comparison becomes `authHeader !== 'Bearer undefined'`, meaning any caller who sends the literal header `Authorization: Bearer undefined` passes the check — a well-known misconfiguration foot-gun for this exact pattern.
**Fix:** Explicitly fail closed when the secret isn't configured:
```ts
if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
  return new NextResponse('Unauthorized', { status: 401 })
}
```

### WR-06: `curators.claim_token` has no UNIQUE constraint (unlike `pitch_history.response_token`)

**File:** `supabase/migrations/030_curators_pitch_history.sql:30, 57`
**Issue:** `pitch_history.response_token` is declared `TEXT NOT NULL UNIQUE`, but the sibling bearer token `curators.claim_token` is plain `TEXT` with only a non-unique partial index (`idx_curators_claim_token`). Both are used identically as bearer-style authenticators looked up via `.eq(...).maybeSingle()`. Relying purely on 256-bit randomness to avoid collisions is fine in practice, but the DB-level UNIQUE constraint is a near-free defense-in-depth backstop the sibling table already has, and its absence here is inconsistent.
**Fix:**
```sql
DROP INDEX idx_curators_claim_token;
CREATE UNIQUE INDEX idx_curators_claim_token ON curators (claim_token) WHERE claim_token IS NOT NULL;
```

### WR-07: Resend bounce-type field/value assumptions are unconfirmed and have no fallback signal if wrong

**File:** `app/api/webhooks/resend/route.ts:30-38`, `lib/webhooks/resend-verify.ts:10-18`
**Issue:** The bounce-handling branch:
```ts
if (event.type === 'email.bounced') {
  const bounceType = event.data.bounce?.type ?? event.data.bounce_type
  if (bounceType === 'HardBounce') { ... }
}
```
The code's own comments state the exact field path and the string `'HardBounce'` are unconfirmed against Resend's live webhook payload shape. If the real field name/casing differs (e.g. `hard_bounce`, or nested elsewhere), this silently never fires — `email_valid` will never flip to `false` for genuinely bounced curator addresses, and there is no logging or alerting to reveal that the assumption was wrong.
**Fix:** At minimum log/record unmatched `email.bounced` payloads (e.g. to a `webhook_events` audit row or structured log) so the assumption can be verified/corrected once Resend is actually configured, rather than failing silently forever.

### WR-08: Several curator PATCH/POST routes don't guard `request.json()` against malformed bodies

**File:** `app/api/curators/[id]/route.ts:27`, `app/api/admin/curators/route.ts:37`, `app/api/admin/curators/[id]/route.ts:38`
**Issue:** These three routes parse the body as:
```ts
const body = (await request.json()) as Record<string, unknown>
```
with no `.catch()`. Other routes added in this same phase (`app/api/pitches/route.ts`, `app/api/pitches/draft/route.ts`, `app/api/pitch/decline/[token]/route.ts`) all defensively do `await request.json().catch(() => ({}))`. An empty body or malformed JSON on the three routes above throws an uncaught `SyntaxError`, producing a raw 500 instead of the clean 400 responses this codebase otherwise favors ("no silent failures" / explicit error handling per project convention).
**Fix:** Apply the same `.catch(() => ({}))` guard consistently:
```ts
const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
```

### WR-09: Bounce-email matching is case-sensitive, but curator emails are stored lowercased

**File:** `app/api/webhooks/resend/route.ts:33-37`
**Issue:** `service.from('curators').update({ email_valid: false }).eq('email', recipient)` compares the raw `recipient` string from the webhook payload against the stored `email` column exactly. Curator emails are normalized to lowercase everywhere they're written (`app/api/admin/curators/route.ts:42`, `.../[id]/route.ts:88`), but there's no guarantee Resend reports the bounced recipient in the same casing it was submitted (or that a curator's email was entered with mixed case anywhere prior to this normalization existing). A casing mismatch causes the update to silently match zero rows.
**Fix:** `.eq('email', recipient.trim().toLowerCase())`.

## Info

### IN-01: `DIRECTORY_COLUMNS` / `DirectoryRow` duplicated verbatim in three files

**File:** `app/api/curators/route.ts:12-29`, `app/(artist)/curators/page.tsx:14-31`, `app/(artist)/launchpad/[projectId]/page.tsx:15-32`
**Issue:** The exact same column-list string and `Pick<Curator, ...>` type are copy-pasted three times, each with its own "never select('*') — T-06-08" comment. Any future column added to (or removed from) the directory-safe set requires remembering to update all three call sites.
**Fix:** Export `DIRECTORY_COLUMNS` and `DirectoryRow` once from `lib/curators/response-rate.ts` (which already owns `DirectoryCurator`) or `lib/curators/schema.ts`, and import everywhere.

### IN-02: Hardcoded `blocked: 0` in the pitch-send success response

**File:** `app/api/pitches/route.ts:208`
**Issue:** `return NextResponse.json({ data: { sent, blocked: 0 } })` — this line is only reached after the earlier `if (blocked.length > 0) return ...` gate, so `blocked` is always `0` here by construction. It's harmless but reads as if it's derived from live state.
**Fix:** Drop the field (callers don't appear to consume it) or add a one-line comment noting it's always `0` at this point given the earlier gate.

---

_Reviewed: 2026-07-01_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
