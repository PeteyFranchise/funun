# Architecture Research
## Wave 3: Launchpad — Integration with Existing Funūn Codebase

**Researched:** 2026-06-30
**Based on:** Direct codebase inspection of Wave 1 + Wave 2 patterns

---

## New Routes & Pages

### Launchpad Room (feature: LAUNCH-01 through LAUNCH-05)

| Route | File | Responsibility |
|-------|------|----------------|
| `(artist)/launchpad/page.tsx` | **EXISTS** — needs upgrade | Currently a static playbook list. Upgrade to show a project selector and per-project checklist state fetched from `launchpad_progress`. |
| `(artist)/launchpad/[projectId]/page.tsx` | **NEW** | Per-project Launchpad view — server component fetches `launchpad_progress` + `launchpad_tips` for the project, renders `LaunchpadChecklist` client component. |

The existing `app/(artist)/launchpad/page.tsx` renders `PLAYBOOK` from `lib/launchpad/playbook.ts` — a fully static list with no per-project context. Wave 3 keeps this page as a landing/overview but adds a project-scoped sub-route for the interactive checklist. The `[projectId]` sub-route mirrors how `/vault/[projectId]/rights` works: server component loads data, passes to a client component that owns interactivity.

### Playlist Pitching (feature: PITCH-01 through PITCH-08)

| Route | File | Responsibility |
|-------|------|----------------|
| `(artist)/launchpad/[projectId]/pitch/page.tsx` | **NEW** | Curator directory browser + pitch composer. Server component loads `curator_directory` (filtered by genre) and recent `pitch_history` for the project. Passes to `CuratorBrowser` client component. |
| `curator/[curatorId]/claim/page.tsx` | **NEW** — public route, no auth group | Curator claim landing page. Mirrors `/join/[inviteToken]` pattern: unauthenticated, force-dynamic, service client, shows curator profile data and signup CTA. |

The curator claim flow reuses the `/join/[inviteToken]` pattern directly. A `claim_token` column on `curator_directory` holds a 64-char hex token. The pitch email includes `{NEXT_PUBLIC_APP_URL}/curator/{curatorId}/claim?token={claim_token}`. The claim page shows the curator's recorded data and links to `/signup` — no server-side mutation on the claim page itself (mutation is a POST to `/api/curators/[id]/claim`).

### Social Campaign Planner (feature: SOCIAL-01 through SOCIAL-07)

| Route | File | Responsibility |
|-------|------|----------------|
| `(artist)/launchpad/[projectId]/campaign/page.tsx` | **NEW** | Campaign planner. Server component loads `campaign_calendar` rows for the project + project metadata for context. Passes to `CampaignPlanner` client component. |

### Navigation Update

- `components/nav/ArtistNav.tsx` — **MODIFY**: add Launchpad nav item (already exists in nav per launchpad page, verify it appears). Confirm `[projectId]` sub-routes inherit the artist layout breadcrumb.

---

## New API Endpoints

### Launchpad Checklist

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/launchpad/[projectId]/progress` | Return all `launchpad_progress` rows for (user, project) joined with `launchpad_tips` for tip content. |
| `POST` | `/api/launchpad/[projectId]/progress` | Toggle a checklist item completed/incomplete. Body: `{ item_key: string, completed: boolean }`. Upserts to `launchpad_progress`. |

Pattern: mirrors `/api/vault/[projectId]/rights` — auth check, ownership check on vault project, then upsert/read on the progress table.

### Curator Directory

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/curators` | List curators with optional `?genre=` and `?platform=` filter. Public or auth — leans auth to gate discovery behind signup wall. |
| `POST` | `/api/curators/[id]/pitch` | Send a pitch email to a specific curator via Resend. Inserts into `pitch_history`. Body: `{ projectId, subject, body }`. |
| `POST` | `/api/curators/[id]/claim` | Curator claims their directory profile. Validates `claim_token` from body. Sets `claimed_by` + `claimed_at` on `curator_directory`. SECURITY DEFINER not needed here — claim token is a public secret, no cross-user write. |
| `PATCH` | `/api/curators/[id]` | Admin-only: update curator record (genre, platform, notes, active flag). Gate on `is_admin` boolean in `artist_profiles` or a separate admin check. |
| `POST` | `/api/webhooks/resend` | Bounce + complaint webhook from Resend. Sets `curator_directory.email_status = 'bounced'` on hard bounce. Public route, validated by Resend signature header. |

### Social Campaign Planner

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/launchpad/[projectId]/campaign/generate` | AI generation of a 4–6 week campaign calendar. Reads project data, calls Claude, stores rows in `campaign_calendar`. Non-streaming — see Data Flow section. |
| `PATCH` | `/api/launchpad/[projectId]/campaign/[rowId]` | Mark a calendar post as completed or save caption edits. Body: `{ completed_at?: string \| null, caption_draft?: string }`. |
| `GET` | `/api/launchpad/[projectId]/campaign/export` | CSV export of campaign calendar. Returns `text/csv` response with Later/Buffer-compatible columns. |

---

## New Components

### Launchpad Checklist

| File | Responsibility |
|------|----------------|
| `components/launchpad/LaunchpadChecklist.tsx` | Client component. Renders per-item checklist rows with completion toggle. Calls `PATCH /api/launchpad/[projectId]/progress`. Inline tips rendered as expandable rows. |
| `components/launchpad/ChecklistItem.tsx` | Single row: label, tip, link-out button, completion checkbox. Pure presentational. |
| `components/launchpad/ProjectPicker.tsx` | Dropdown to switch between vault projects from the Launchpad overview page. |

### Playlist Pitching

| File | Responsibility |
|------|----------------|
| `components/launchpad/CuratorBrowser.tsx` | Client component. Filterable curator directory list. Holds selected curators in state, opens `PitchComposer` modal. Calls `GET /api/curators`. |
| `components/launchpad/CuratorCard.tsx` | Single curator row — name, genre tags, response rate badge, platform icons, "Pitch" button. Presentational. |
| `components/launchpad/PitchComposer.tsx` | Modal/panel. Pre-fills subject/body from project data. Sends via `POST /api/curators/[id]/pitch`. Mirrors `PitchPlugForm` but pointed at curator directory (not freeform email). |
| `components/launchpad/PitchHistory.tsx` | Read-only log of sent pitches for the project. Renders `pitch_history` rows with curator name, sent date, and response status badge. |

### Social Campaign Planner

| File | Responsibility |
|------|----------------|
| `components/launchpad/CampaignPlanner.tsx` | Client component. Orchestrates the planner: platform selector, generate button, calendar grid view, export button. |
| `components/launchpad/PlatformSelector.tsx` | Multi-select toggle for platform choice (Instagram, TikTok, X, YouTube Shorts, Facebook, Threads). Saves selection to `campaign_calendar` or local state before generation. |
| `components/launchpad/CalendarGrid.tsx` | Week × platform grid. Each cell shows post type tag + caption draft. Completed cells are visually struck. Calls `PATCH /api/launchpad/[projectId]/campaign/[rowId]`. |
| `components/launchpad/CalendarPostCard.tsx` | Single post card: platform icon, week label, post type, caption draft (editable), complete toggle, "Generate caption" (DropReady inline) and "Generate hook" (SoundBait inline) action buttons. |

---

## New lib/ Modules

| File | Responsibility |
|------|----------------|
| `lib/launchpad/checklist.ts` | `CHECKLIST_ITEMS` constant (typed array of item keys, labels, hints, link targets). Replaces/extends `PLAYBOOK` in `playbook.ts` with richer per-item shape. Source of truth for what items exist. |
| `lib/launchpad/tips.ts` | `DEFAULT_TIPS` map: `Record<string, string>` of fallback tip content per item key. Used when no DB row exists (first-run experience). |
| `lib/curators/index.ts` | `sanitizeCurator()` — allowlist-based field sanitizer for curator upserts, same pattern as `lib/collaborators/index.ts`. `buildPitchEmail(curator, project, artist): { subject, body }` — generates pre-filled pitch email body. `isBounced(curator): boolean` helper. |
| `lib/launchpad/campaign.ts` | `buildCalendarPrompt(profile, project, platforms): string` — constructs the Claude prompt. `parseCalendarOutput(json): CalendarRow[]` — parses and validates the AI response. `PLATFORM_LABELS`, `POST_TYPE_LABELS` constants. |
| `lib/launchpad/csv.ts` | `toCalendarCsv(rows: CalendarRow[]): string` — formats calendar rows as CSV. Later/Buffer column mapping: `Date`, `Caption`, `Platform`, `Post Type`, `Status`. |

`lib/launchpad/playbook.ts` — **KEEP AS IS** for the existing static Launchpad overview page; do not merge with `checklist.ts` (different concerns: playbook is a marketing guide, checklist is an interactive progress tracker).

---

## Supabase Schema

### `launchpad_tips`

Admin-managed tip content per checklist item. AI-drafted monthly, approved before publish.

```sql
CREATE TABLE launchpad_tips (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  checklist_item_key TEXT NOT NULL UNIQUE,  -- matches CHECKLIST_ITEMS key
  content          TEXT NOT NULL,
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE launchpad_tips ENABLE ROW LEVEL SECURITY;
-- Anyone authenticated can read; no user writes (admin manages via service client)
CREATE POLICY "Read tips" ON launchpad_tips FOR SELECT USING (auth.uid() IS NOT NULL);
```

No `user_id` column — tips are global content, not user-owned. Admin writes via service client directly. RLS is read-only for authenticated users.

### `launchpad_progress`

Per-user, per-project checklist completion state.

```sql
CREATE TABLE launchpad_progress (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  project_id       UUID REFERENCES vault_projects ON DELETE CASCADE NOT NULL,
  item_key         TEXT NOT NULL,
  completed_at     TIMESTAMPTZ,
  UNIQUE (user_id, project_id, item_key)
);
ALTER TABLE launchpad_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own progress" ON launchpad_progress
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_launchpad_progress_user_project ON launchpad_progress (user_id, project_id);
```

### `curator_directory`

Funūn-managed list of playlist curators. Grows organically via pitch emails → claim flow.

```sql
CREATE TABLE curator_directory (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name             TEXT NOT NULL,
  email            TEXT NOT NULL UNIQUE,
  playlist_name    TEXT,
  platform         TEXT NOT NULL,  -- 'spotify' | 'apple' | 'tidal' | 'youtube' | 'soundcloud'
  genres           TEXT[] DEFAULT '{}',
  follower_count   INTEGER,
  submission_link  TEXT,
  notes            TEXT,
  email_status     TEXT NOT NULL DEFAULT 'active'
                   CHECK (email_status IN ('active', 'bounced', 'unsubscribed')),
  response_rate    NUMERIC(5,2),  -- 0–100, updated by admin or computed from pitch_history
  claimed_by       UUID REFERENCES auth.users ON DELETE SET NULL,
  claimed_at       TIMESTAMPTZ,
  claim_token      TEXT UNIQUE,   -- 64-char hex, sent in pitch email footer
  active           BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE curator_directory ENABLE ROW LEVEL SECURITY;
-- All authenticated users can read active curators
CREATE POLICY "Read active curators" ON curator_directory
  FOR SELECT USING (auth.uid() IS NOT NULL AND active = true);
-- Claimed curator can update their own row (display fields only — email_status gated in API)
CREATE POLICY "Claimed curator updates own row" ON curator_directory
  FOR UPDATE USING (auth.uid() = claimed_by);
CREATE INDEX idx_curator_directory_genres ON curator_directory USING GIN (genres);
CREATE INDEX idx_curator_directory_platform ON curator_directory (platform);
CREATE INDEX idx_curator_directory_email ON curator_directory (LOWER(email));
```

### `pitch_history`

Log of curator pitches sent by an artist for a project.

```sql
CREATE TABLE pitch_history (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  project_id       UUID REFERENCES vault_projects ON DELETE CASCADE NOT NULL,
  curator_id       UUID REFERENCES curator_directory ON DELETE SET NULL,
  curator_email    TEXT NOT NULL,   -- snapshot at send time (curator may be deleted)
  curator_name     TEXT NOT NULL,   -- snapshot at send time
  subject          TEXT NOT NULL,
  body_text        TEXT NOT NULL,
  sent_at          TIMESTAMPTZ DEFAULT NOW(),
  response_status  TEXT NOT NULL DEFAULT 'sent'
                   CHECK (response_status IN ('sent', 'opened', 'replied', 'passed', 'added')),
  responded_at     TIMESTAMPTZ
);
ALTER TABLE pitch_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own pitch history" ON pitch_history
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_pitch_history_user_project ON pitch_history (user_id, project_id);
CREATE INDEX idx_pitch_history_curator ON pitch_history (curator_id);
```

### `campaign_calendar`

AI-generated and manually edited content calendar rows.

```sql
CREATE TABLE campaign_calendar (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  project_id       UUID REFERENCES vault_projects ON DELETE CASCADE NOT NULL,
  platform         TEXT NOT NULL,  -- 'instagram' | 'tiktok' | 'x' | 'youtube_shorts' | 'facebook' | 'threads'
  week             INTEGER NOT NULL CHECK (week >= 1 AND week <= 6),
  post_type        TEXT NOT NULL,  -- 'announcement' | 'behind_scenes' | 'hook' | 'engagement' | 'repost' | 'milestone'
  caption_draft    TEXT,
  completed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE campaign_calendar ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own campaign" ON campaign_calendar
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_campaign_calendar_user_project ON campaign_calendar (user_id, project_id);
```

---

## Data Flow: AI Calendar Generation

**Decision: batch (non-streaming), store all rows on the server before responding.**

Rationale: the calendar output is a structured JSON array of 15–30 posts. Streaming a JSON array and progressively inserting rows mid-stream adds complexity without meaningful UX gain — the generation completes in 3–5 seconds. Streaming is warranted for free-text (epk bio, pitch email body) where partial text is useful to the reader. A calendar grid is only useful once complete.

### Flow

1. Client POSTs to `POST /api/launchpad/[projectId]/campaign/generate` with `{ platforms: string[] }`.
2. API handler (`createApiClient`) authenticates user, verifies project ownership.
3. Handler fetches project fields: `title`, `type`, `genre`, `release_date`, `notes`, track titles, `artist_profiles.artist_name`.
4. Calls `buildCalendarPrompt()` from `lib/launchpad/campaign.ts` — passes project context + selected platforms + genre-specific platform nudges.
5. Calls `anthropic.messages.create({ model: MODEL, max_tokens: 4000, messages: [...] })` — synchronous awaited call, same pattern as `/api/tools/[slug]`.
6. Parses JSON response via `parseCalendarOutput()` — validates shape, clips to max 6 weeks.
7. **Deletes existing `campaign_calendar` rows** for (user, project) — a regenerate replaces, not appends. Uses a transaction via `supabase.rpc('regenerate_campaign', { p_user_id, p_project_id, p_rows })` or sequential delete+insert.
8. Bulk inserts all parsed rows in a single `supabase.from('campaign_calendar').insert(rows)` call.
9. Returns `{ data: rows }` — the client replaces its local calendar state.

**Why not streaming to the client:** The existing `tools/[slug]` handler uses batch + JSON parse. Extending that pattern is consistent. If generation latency becomes a UX issue in future waves, the endpoint can switch to streaming with `TransformStream` — the client-side `CampaignPlanner` would then replace `fetch` with an SSE consumer, but no schema changes are needed.

**Prompt shape:** `buildCalendarPrompt` outputs a JSON instruction asking Claude to produce `CalendarRow[]` with fields `{ platform, week, post_type, caption_draft }`. Claude responds with only a JSON array (no markdown). Parsing uses the same `extractJson` utility pattern already in `app/api/tools/pitchplug/route.ts` and `app/api/tools/[slug]/route.ts`.

---

## Data Flow: Resend Bounce Webhooks

### Webhook Endpoint

`POST /api/webhooks/resend` — **public route** (no auth session required, Resend calls it from its servers).

### Resend Payload Shape

Resend sends `POST` with `Content-Type: application/json`:

```ts
type ResendWebhookEvent = {
  type: 'email.bounced' | 'email.complained' | 'email.delivered' | 'email.opened'
  data: {
    email_id: string
    from: string
    to: string[]          // recipient address(es)
    subject: string
    created_at: string
  }
}
```

Hard bounce → `type === 'email.bounced'`. Complaint (spam report) → `type === 'email.complained'`. Both should mark the curator invalid.

### Signature Validation

Resend includes a `svix-id`, `svix-timestamp`, and `svix-signature` header set. Validate using the `svix` npm package (`npm install svix`). This is the same pattern Stripe uses with `stripe.webhooks.constructEvent`. Without validation, any caller can fake a bounce and delist a curator's email.

```ts
import { Webhook } from 'svix'
const wh = new Webhook(process.env.RESEND_WEBHOOK_SECRET!)
const event = wh.verify(rawBody, headers) // throws on invalid
```

If `RESEND_WEBHOOK_SECRET` is not set, return `200 OK` immediately (no-op) to avoid webhook retries while the feature is unconfigured. Same defensive pattern as `lib/email/index.ts` returns `{ ok: false }` when `RESEND_API_KEY` is missing.

### What to Update in DB

1. Extract `to[0]` (the recipient email) from `event.data`.
2. `UPDATE curator_directory SET email_status = 'bounced', updated_at = NOW() WHERE LOWER(email) = LOWER(to_address)` — uses the same functional index pattern as `idx_collaborators_lower_email`.
3. Also update `pitch_history`: no direct update needed — the curator's email status is the source of truth. The UI reads `curator_directory.email_status` when rendering pitch history.
4. Return `200 OK` always — Resend retries on non-2xx.

### Handler File

`app/api/webhooks/resend/route.ts` — use `createServiceClient()` for the DB write (no auth session in webhook context). Use `request.text()` to read raw body before parsing (required for Svix signature verification — `request.json()` would consume the stream and make raw body unavailable).

```ts
export async function POST(request: Request) {
  const rawBody = await request.text()
  // ... validate signature, parse event, update DB
}
```

---

## Build Order (Suggested Phase Sequence)

### Phase 1 — Launchpad Checklist (LAUNCH-01 through LAUNCH-05)

Build first. Reasons:
- Lowest dependency surface: only new tables (`launchpad_tips`, `launchpad_progress`) and a sub-route under the existing `/launchpad` room.
- Validates the per-project Launchpad pattern (`(artist)/launchpad/[projectId]/page.tsx`) that the other two features share as their containing route.
- Zero external integrations — no Resend, no Claude call for generation.
- Delivers immediately visible value: artists can start tracking post-release actions.

**Deliverables:** migration for both tables, `LaunchpadChecklist` component, progress API routes, upgrade to existing `launchpad/page.tsx` to add project selector.

### Phase 2 — Playlist Pitching (PITCH-01 through PITCH-08)

Build second. Reasons:
- Depends on the per-project Launchpad sub-route established in Phase 1 (the pitch page lives at `/launchpad/[projectId]/pitch`).
- The curator claim flow mirrors `join/[inviteToken]` and `api/claim-collaborators` — well-understood pattern, can reuse directly.
- Resend is already configured (`lib/email/index.ts`); pitch sending is an extension of the existing `api/tools/pitchplug/send` flow.
- The bounce webhook (`api/webhooks/resend`) is a byproduct of this phase — it belongs here, not in Phase 3.
- `PITCH-08` (add "Playlist Curator" to industry roles) is a 3-line change to `lib/industry-roles.ts` — slot it at the start of this phase.

**Deliverables:** `curator_directory` + `pitch_history` migrations, curator API routes, `CuratorBrowser` + `PitchComposer` + `PitchHistory` components, claim page, bounce webhook endpoint, Svix dependency.

### Phase 3 — Social Campaign Planner (SOCIAL-01 through SOCIAL-07)

Build third. Reasons:
- Most complex: requires AI generation + new data model + CSV export.
- `campaign_calendar` is a net-new concern with no dependencies on Phases 1 or 2 (it could technically be parallelized, but the `/launchpad/[projectId]/campaign` route needs the project-scoped Launchpad route from Phase 1).
- DropReady and SoundBait inline actions reuse existing tool endpoints — no new AI infrastructure.
- CSV export is a standalone GET route, implementable incrementally after the calendar view works.
- Keeping this last lets Phase 2 beta feedback inform platform priority nudges (SOCIAL-02).

**Deliverables:** `campaign_calendar` migration, `buildCalendarPrompt` + `toCalendarCsv` lib modules, generation + PATCH + export API routes, `CampaignPlanner` + `CalendarGrid` + `CalendarPostCard` components, platform selector.

---

## Sources

- Direct inspection of `/Users/peterzora/Desktop/funun` codebase (brownfield — no external research needed for integration architecture)
- Pattern references (all from codebase):
  - Claim flow: `app/join/[inviteToken]/page.tsx`, `app/api/claim-collaborators/route.ts`, `supabase/migrations/026_collaborator_identity_reconciliation.sql`
  - AI tool pattern: `app/api/tools/[slug]/route.ts`, `app/api/tools/pitchplug/route.ts`
  - Email send pattern: `lib/email/index.ts`, `app/api/tools/pitchplug/send/route.ts`
  - RLS patterns: `supabase/migrations/018_collaborators_split_sheets.sql`, `026_collaborator_identity_reconciliation.sql`
  - Per-project rights page: `app/(artist)/vault/[projectId]/rights/page.tsx`
  - Existing Launchpad skeleton: `app/(artist)/launchpad/page.tsx`, `lib/launchpad/playbook.ts`
