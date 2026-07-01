# Phase 6: Playlist Curator Pitching - Context

**Gathered:** 2026-07-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Artists pitch a selected track to relevant playlist curators by email and track outcomes, while curators can claim and self-manage their own directory profile, bounced addresses retire automatically, genre drift gets flagged, and an admin curates the directory. Requirements: PITCH-01 through PITCH-08 (locked in ROADMAP.md / REQUIREMENTS.md — this discussion clarifies HOW, not whether).

</domain>

<decisions>
## Implementation Decisions

### Curator Directory Seeding
- **D-01:** No bulk import or SQL seed migration for v1 — curators are added one at a time through an admin CRUD page (`/admin/curators`), following the same pattern as Phase 5's `ChecklistAdmin`.
- **D-02:** Curator record carries a lean field set (name, email, playlist/channel name + URL, genre focus, submission notes) **plus** an auto-fetched reach signal (follower/subscriber count) — not admin-entered.
- **D-03:** Reach signal is fetched on admin add/edit **and** refreshed periodically. Platforms: **Spotify (Web API) and YouTube (Data API)** — both need new credentials (see Claude's Discretion / API creds below). Cadence: **weekly**. Mechanism: **Vercel Cron** (`vercel.json` `crons` entry + a protected API route) — this is a new pattern for the codebase (no cron/scheduled-job infra exists today).
- **D-04:** If Spotify/YouTube credentials aren't present, the fetch fails gracefully (reach signal stays empty) — same no-op-when-unconfigured pattern as `lib/email/index.ts`.

### Pitch Composer & Drafting
- **D-05:** The 150-word pitch note is **AI-drafted, editable** — reuse the PitchPlug pattern (Claude via `@anthropic-ai/sdk`) to draft a playlist-specific note from track/release data + the curator's genre focus. Artist edits before sending. This keeps the locked 150-word gate meaningful (a real note, not boilerplate).
- **D-06:** **Both** entry points exist:
  - Track-first: inside `/launchpad/[projectId]` (natural entry — room is already project-scoped).
  - Curator-first: a new standalone `/curators` page (global directory, browse/filter across all curators).
- **D-07:** From `/curators`, after selecting curators + a track, the flow **redirects into `/launchpad/[projectId]`** — the composer (150-word note + Send) always lives in the project room, keeping pitch history/composing centralized there. `/curators` itself has no composer modal.
- **D-08:** Duplicate-send guard (locked: no re-pitching same curator+track) is enforced in the UI, not just the API: already-pitched curators appear **disabled and labeled** ("Already pitched · [status]") in the multi-select, not merely blocked on Send.
- **D-09:** Track selection is **not** scoped to a single "lead track" — any individual track within the project can be pitched (EPs/albums need per-track pitching).

### Response & Engagement Signals
- **D-10:** No automatic open-tracking pixel (rejected — email-client blocking makes it an unreliable signal). **"Opened" is dropped from the automatic status pipeline entirely.** Status only moves via explicit curator action.
- **D-11:** Accept/Decline happen via **one-click, token-authenticated response links** in the pitch email footer (same pattern as the curator claim link — no login required to respond).
- **D-12:** Decline includes an **optional reason field** — clicking Decline lands on a small page with a skippable free-text "why?" field before confirming. Accept can be a bare click (no equivalent friction needed).
- **D-13:** PITCH-04 response rate = **(accepted + declined) / total pitched**, last 90 days. Any explicit action counts as "responsive" — not just acceptances.
- **D-14:** When a curator clicks Accept/Decline, the artist is notified via **email + the existing in-app notifications table** (reuse the pattern already used for Antenna match notifications) — not just a passive pitch-history update.

### Bounce Detection, Genre Drift, and Curator Claim
- **D-15:** Hard-bounce detection is **in scope** — build a new `/api/webhooks/resend` route (the first webhook route in this codebase) that verifies the Resend/Svix signature and listens for the hard-bounce event, flipping `curators.email_valid` to `false`.
- **D-16:** Genre drift signal: store a **baseline** genre-focus tag set per curator; an alert fires when **either an admin or the curator themself** edits genre focus tags and the new set differs significantly from baseline. No automated playlist-content analysis.
- **D-17:** Drift alert audience: **admin (badge in `/admin/curators`) + artist-facing warning at pitch time** — if an artist tries to pitch a drift-flagged curator, a small inline warning appears before Send ("This curator's genre focus may have shifted — double check fit"). Alert is advisory, not blocking.
- **D-18:** Claiming a profile (existing locked pattern: explicit link-click only, 32-byte token, 72h expiry, one-time use) creates a **lightweight Funūn account** for the curator (magic-link auth, reusing existing Supabase auth pattern — no password). This makes profile editing an ongoing capability, not a one-time form.
- **D-19:** Claimed curator account scope: **full self-serve profile edit** (genre focus, platform, playlist/channel URL, submission notes/bio) **plus a read-only "pitches I've received" view** (track, artist, date, their own accept/decline status). No other app access.
- **D-20:** Unsubscribe link (required in every pitch email) sets a **do-not-pitch flag** on the curator record — curator stays visible/browsable in the directory, but `Send` is blocked against them going forward (same enforcement pattern as the duplicate-send guard). It does **not** remove them from the directory.
- **D-21:** Admin "flag inactive" (PITCH-07) is a **manual toggle with a suggested signal** — admin view surfaces an advisory hint per curator (e.g. "No response in last 5 pitches" or "Email bounced") to prompt review, but flipping to inactive is always a manual admin click, never automatic.

### Send-Domain & Credentials Readiness
- **D-22:** `pitch.funun.studio` (DKIM/SPF/DMARC + ~2-week warmup) is **not yet set up**. Phase 6 ships fully built regardless — sending uses a `PITCH_FROM_EMAIL` env var pointing at the pitch subdomain. Until DNS/warmup completes, `Send` fails gracefully at the Resend API level (same no-op-when-unconfigured pattern as `lib/email/index.ts`). This is not a build blocker.
- **D-23:** Spotify Web API and YouTube Data API credentials do **not** exist yet either — same graceful-degradation treatment as D-04/D-22: code ships gated behind `SPOTIFY_CLIENT_ID`/`SPOTIFY_CLIENT_SECRET`/`YOUTUBE_API_KEY` env vars.

### Claude's Discretion
- Exact filter platform value list beyond "Streaming + blog/other" (Spotify, Apple Music, YouTube Music, SoundCloud, + generic "Blog / Independent" catch-all) — finalize exact enum during planning.
- Vercel Cron job failure/retry handling, Spotify/YouTube API rate-limit handling for the weekly refresh.
- Exact `curators` / `pitch_history` table schema beyond what's already named in ROADMAP.md (`curators` with `email_valid`, `pitch_history` per-project pitch log) — planner designs full schema, RLS enabled immediately after each `CREATE TABLE` per the codebase-wide convention.
- Svix webhook signature verification implementation details (library, secret rotation).
- Whether "Playlist Curator" industry role addition (PITCH-08) needs any UI beyond adding it to `lib/industry-roles.ts` — likely trivial, no discussion needed.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §"Phase 6: Playlist Curator Pitching" — goal, success criteria, new tables, infrastructure prerequisite
- `.planning/REQUIREMENTS.md` §"Playlist Curator Pitching" — PITCH-01 through PITCH-08 full text
- `.planning/PROJECT.md` §"Key Decisions" — prior Wave 3 decisions (lean curator directory, `/r/[projectId]` growth loop, RLS-immediately-after-CREATE-TABLE convention)

### Prior-phase patterns to reuse
- `.planning/phases/05-launchpad-checklist/05-CONTEXT.md` — shared `/launchpad/[projectId]` route this phase lives inside; `/admin` layout pattern (`is_admin` gate, shared nav); admin CRUD pattern (`ChecklistAdmin`) to mirror for `/admin/curators`; hard-delete convention for admin-managed records
- `.planning/phases/04-collaborator-identity-reconciliation/04-CONTEXT.md` — claim-token pattern precedent (note: Phase 6's curator claim is explicit link-click only, deliberately **not** wired into `handle_new_user()` like the Wave 2 collaborator auto-claim)

### Codebase integration points
- `.planning/codebase/INTEGRATIONS.md` — confirms no webhook routes exist yet in this codebase (Resend bounce webhook in D-15 will be the first); confirms `lib/email/index.ts` graceful no-op pattern to mirror for new env-var-gated integrations (Spotify, YouTube, pitch domain)
- `lib/email/index.ts` — existing Resend wrapper; pitch send needs a `from` override (or a second wrapper) to use `PITCH_FROM_EMAIL` instead of the transactional `RESEND_FROM_EMAIL`
- `lib/industry-roles.ts` — add "Playlist Curator" here for PITCH-08
- `lib/tools/registry.ts` — PitchPlug precedent lives in Antenna, not this registry; confirm during research whether pitch drafting reuses PitchPlug's prompt code directly or is a new tool entry

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `components/admin/ChecklistAdmin.tsx` + `app/(admin)/layout.tsx` — direct pattern for the new `/admin/curators` admin page (add/edit/flag/delete, `is_admin` gate)
- `lib/email/index.ts` — Resend wrapper to extend/parallel for pitch sends (needs a different `from` domain)
- PitchPlug (Antenna's AI email drafter, `@anthropic-ai/sdk`) — pattern to reuse for AI-drafted pitch notes
- `app/r/[projectId]/page.tsx` — existing public player page; pitch emails link here (already locked requirement)
- `notifications` table — existing pattern (used for Antenna match alerts) to reuse for "curator responded" artist notifications
- Supabase magic-link auth (`@supabase/auth-helpers-nextjs`) — pattern to reuse for the new lightweight curator account created on claim

### Established Patterns
- Every new table gets `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` immediately after `CREATE TABLE` (CVE-2025-48757 pattern, enforced project-wide since Wave 3 research)
- Graceful no-op when integration env vars are missing (`lib/email/index.ts` is the reference implementation) — extend this pattern to Spotify/YouTube fetch and the pitch-domain send
- Admin pages query Supabase directly via `createServiceClient()`; admin API routes independently re-verify `is_admin` (not just layout-level gating) — per Phase 5 decision in `PROJECT.md`

### Integration Points
- New routes hang off `/launchpad/[projectId]` (composer) and a new top-level `/curators` (directory browse)
- New `/admin/curators` joins the existing `/admin` layout alongside `/admin/checklist` and `/admin/tips`
- New webhook route `/api/webhooks/resend` — first webhook endpoint in the app; needs its own auth model (signature verification, not session-based)
- New curator-facing routes for claim, accept/decline, and profile edit — these are **not** behind the existing artist `middleware.ts` auth gate (curators are a distinct account type)

</code_context>

<specifics>
## Specific Ideas

- Pitch email footer carries three distinct token-authenticated links: claim profile, Accept, Decline (Decline leads to an optional-reason page first).
- Admin curator directory should visually distinguish claimed vs. unclaimed profiles and surface both the "flag inactive" advisory signal and the genre-drift badge in the same row.
- The weekly reach-signal refresh and the bounce webhook are both explicitly designed to degrade gracefully rather than block shipping — this mirrors how `RESEND_API_KEY`/`RESEND_FROM_EMAIL` absence already works in `lib/email/index.ts`.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within Phase 6 scope. (Automated curator directory seeding via scraping/API remains explicitly out of scope per `PROJECT.md` / `REQUIREMENTS.md` — Wave 4.)

</deferred>

---

*Phase: 6-Playlist Curator Pitching*
*Context gathered: 2026-07-01*
