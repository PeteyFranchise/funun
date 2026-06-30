# Stack Research: Wave 3 Launchpad

**Project:** Funūn Wave 3 — Launchpad
**Researched:** 2026-06-30
**Overall confidence:** MEDIUM (Resend/Svix webhook payload confirmed via official docs; CSV column format confirmed via Buffer help center; Anthropic structured outputs verified against installed SDK; Supabase RLS confirmed against existing migration patterns)

---

## New Dependencies Needed

| Package | Version | Purpose | Why not existing |
|---------|---------|---------|-----------------|
| `svix` | `^1.96.1` | Verify Resend webhook signatures in `/api/webhooks/resend` route | Resend webhooks are signed by Svix infrastructure. Verification requires HMAC-SHA256 against three headers (`svix-id`, `svix-timestamp`, `svix-signature`). The Resend SDK's `resend.webhooks.verify()` wraps Svix internally — either use that wrapper or import Svix directly. Direct Svix import is more explicit and testable. |
| `validator` | `^13.15.35` | Validate curator email address format before calling `resend.emails.send()` | Prevents sending to obviously malformed addresses before Resend even sees them. `@types/validator` v13.15.10 provides TypeScript types. The `email-validator` package (last published 8 years ago) is abandoned. Format-only — deliverability is handled by bounce detection. |
| `csv-stringify` | `^6.8.0` | Generate Buffer-compatible CSV export of the social campaign calendar | Already have the `csv` umbrella package? No — it is not in `package.json`. `csv-stringify` is the stringify-only sub-package (940KB unpacked), actively maintained, streams-compatible, spec-compliant for quoted fields with commas/newlines in captions. `json2csv` v6 is still in alpha (`6.0.0-alpha.2`) — risky. `papaparse` is browser-first. `csv-stringify` is the correct server-side choice for a Next.js API route. |
| `@types/validator` | `^13.15.10` | TypeScript types for `validator` package | dev-only; `validator` ships without bundled types |

No other new runtime dependencies are needed. Resend, Anthropic SDK, Supabase, and Zod already cover all other Wave 3 requirements.

---

## Supabase Schema Additions

### Table: `launchpad_checklist_items` (definition table — admin-managed)

Defines the canonical checklist items and their per-item tips. Content is AI-drafted monthly and admin-approved before publish. This is read by all authenticated users; only admins write to it (via service role in an admin API route, not via RLS).

```sql
CREATE TABLE launchpad_checklist_items (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug          TEXT NOT NULL UNIQUE,          -- e.g. 'pitch_spotify', 'update_bio'
  category      TEXT NOT NULL,                 -- e.g. 'pitching', 'social', 'admin'
  title         TEXT NOT NULL,
  description   TEXT NOT NULL,
  tip           TEXT,                          -- AI-drafted, admin-approved guidance
  tip_updated_at TIMESTAMPTZ,
  tool_slug     TEXT,                          -- links to lib/tools/registry.ts slugs (nullable)
  external_url  TEXT,                          -- deep-link for external action items (nullable)
  sort_order    INT NOT NULL DEFAULT 0,
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE launchpad_checklist_items ENABLE ROW LEVEL SECURITY;
-- All authenticated users can read active items
CREATE POLICY "Authenticated users read active checklist items"
  ON launchpad_checklist_items FOR SELECT TO authenticated
  USING (active = true);
-- Admin writes bypass RLS via service role key in admin API routes
-- No INSERT/UPDATE/DELETE policy needed for non-service-role callers
```

**RLS pattern:** Public read for authenticated users (`TO authenticated`), admin writes via `createServiceClient()` in a protected admin API route (service role bypasses RLS entirely — consistent with how `lib/supabase/server.ts` already works). Do NOT store admin flag in `raw_user_meta_data` (user-editable); store in `raw_app_meta_data` or use a separate `admin_users` table if an admin UI is needed.

---

### Table: `launchpad_progress` (per-artist, per-project completion tracking)

```sql
CREATE TABLE launchpad_progress (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  project_id    UUID REFERENCES vault_projects ON DELETE CASCADE NOT NULL,
  item_slug     TEXT NOT NULL,                 -- FK to launchpad_checklist_items.slug
  completed     BOOLEAN NOT NULL DEFAULT false,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, project_id, item_slug)
);

ALTER TABLE launchpad_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own launchpad progress"
  ON launchpad_progress
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_launchpad_progress_project ON launchpad_progress (project_id, user_id);
```

---

### Table: `curators` (the curator directory — admin-seeded, curator-claimable)

```sql
CREATE TABLE curators (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name              TEXT NOT NULL,
  email             TEXT NOT NULL UNIQUE,
  playlist_name     TEXT,
  platform          TEXT NOT NULL DEFAULT 'spotify',  -- 'spotify' | 'apple' | 'youtube' | 'tidal'
  genres            TEXT[] NOT NULL DEFAULT '{}',
  playlist_url      TEXT,
  follower_count    INT,
  submission_notes  TEXT,                             -- curator-provided pitch guidance
  claimed_by        UUID REFERENCES auth.users ON DELETE SET NULL,
  claimed_at        TIMESTAMPTZ,
  email_valid       BOOLEAN NOT NULL DEFAULT true,    -- set false on hard bounce
  email_bounced_at  TIMESTAMPTZ,
  response_rate     NUMERIC(5,2),                     -- 0.00–100.00, computed periodically
  total_pitches     INT NOT NULL DEFAULT 0,
  total_responses   INT NOT NULL DEFAULT 0,
  active            BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE curators ENABLE ROW LEVEL SECURITY;
-- All authenticated users can browse active, email-valid curators
CREATE POLICY "Authenticated users read active curators"
  ON curators FOR SELECT TO authenticated
  USING (active = true AND email_valid = true);
-- Curators can update their own claimed profile (name, submission_notes, genres, playlist_url)
CREATE POLICY "Curators update own profile"
  ON curators FOR UPDATE TO authenticated
  USING (auth.uid() = claimed_by)
  WITH CHECK (auth.uid() = claimed_by);
-- Admin writes (add, flag, edit all fields) via service role
```

**Genre drift alert:** Computed in application layer — compare `curators.genres` against the distribution of pitches that got responses. Trigger an alert when cosine similarity between current genre tags and recent-response genres drops below a threshold. No additional table needed; alert logic lives in a periodic job or on-read in the admin view.

---

### Table: `pitch_history` (per-project pitch log)

```sql
CREATE TABLE pitch_history (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  project_id      UUID REFERENCES vault_projects ON DELETE CASCADE NOT NULL,
  curator_id      UUID REFERENCES curators ON DELETE SET NULL,
  curator_email   TEXT NOT NULL,               -- snapshot at send time (curator row may change)
  curator_name    TEXT NOT NULL,               -- snapshot
  resend_email_id TEXT,                        -- returned by resend.emails.send() as data.id
  sent_at         TIMESTAMPTZ DEFAULT NOW(),
  status          TEXT NOT NULL DEFAULT 'sent'
                  CHECK (status IN ('sent', 'bounced', 'responded', 'passed')),
  responded_at    TIMESTAMPTZ,
  notes           TEXT,                        -- artist's own notes on this pitch
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE pitch_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own pitch history"
  ON pitch_history
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_pitch_history_project ON pitch_history (project_id, user_id);
CREATE INDEX idx_pitch_history_resend ON pitch_history (resend_email_id) WHERE resend_email_id IS NOT NULL;
```

The `resend_email_id` index enables O(1) lookup when a Resend bounce webhook arrives with `data.email_id`.

---

### Table: `social_campaigns` (per-project AI-generated calendar)

```sql
CREATE TABLE social_campaigns (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  project_id      UUID REFERENCES vault_projects ON DELETE CASCADE NOT NULL UNIQUE,
  platforms       TEXT[] NOT NULL DEFAULT '{}',  -- ['instagram','tiktok','x','youtube_shorts','facebook','threads']
  weeks           INT NOT NULL DEFAULT 4,
  generated_at    TIMESTAMPTZ,
  posts           JSONB NOT NULL DEFAULT '[]',   -- array of SocialPost objects (see below)
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- SocialPost shape stored in posts JSONB:
-- {
--   id: string,            -- client-generated UUID
--   week: number,          -- 1-6
--   day_of_week: number,   -- 0=Sun..6=Sat (suggested)
--   platform: string,
--   content_type: string,  -- 'reel' | 'story' | 'post' | 'short' | 'thread'
--   caption: string,
--   hook: string | null,
--   completed: boolean,
--   completed_at: string | null
-- }

ALTER TABLE social_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own social campaigns"
  ON social_campaigns
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_social_campaigns_project ON social_campaigns (project_id);
```

Storing posts as JSONB avoids a many-row `campaign_posts` table for what is essentially a document. Each campaign has fewer than 50 posts; JSONB is appropriate at this scale. Individual post `completed` status is toggled via a PATCH to the parent row (replace the JSONB array). If post-level querying becomes necessary in Wave 4, extract to a child table then.

---

## API / Webhook Integrations

### Resend Bounce Webhook (`POST /api/webhooks/resend`)

**Infrastructure:** Resend delivers webhooks via Svix. Every request carries three headers: `svix-id`, `svix-timestamp`, `svix-signature`.

**Verification pattern (Next.js 15 App Router):**

```typescript
import { Webhook } from 'svix'

export async function POST(req: Request) {
  // CRITICAL: read raw text BEFORE any JSON parsing
  // Signature check is byte-sensitive; JSON.parse + re-serialize breaks HMAC
  const rawBody = await req.text()

  const wh = new Webhook(process.env.RESEND_WEBHOOK_SECRET!)
  let event: ResendWebhookEvent

  try {
    event = wh.verify(rawBody, {
      'svix-id': req.headers.get('svix-id')!,
      'svix-timestamp': req.headers.get('svix-timestamp')!,
      'svix-signature': req.headers.get('svix-signature')!,
    }) as ResendWebhookEvent
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (event.type === 'email.bounced') {
    const emailId = event.data.email_id
    const bounceType = event.data.bounce?.type  // 'Permanent' | 'Transient'
    if (bounceType === 'Permanent') {
      // 1. Find pitch_history row by resend_email_id = emailId
      // 2. Set pitch_history.status = 'bounced'
      // 3. Find curator by pitch_history.curator_id
      // 4. Set curators.email_valid = false, email_bounced_at = NOW()
    }
  }

  return NextResponse.json({ received: true })
}
```

**Bounce event payload shape (confirmed from Resend changelog + Svix docs):**

```json
{
  "type": "email.bounced",
  "created_at": "2026-06-30T12:00:00.000Z",
  "data": {
    "email_id": "<resend-email-id>",
    "from": "pitch@funun.studio",
    "to": ["curator@example.com"],
    "subject": "...",
    "bounce": {
      "type": "Permanent",
      "subType": "General",
      "message": "..."
    }
  }
}
```

`type: "Permanent"` = hard bounce (mark curator email invalid permanently).
`type: "Transient"` (on `email.delivery_delayed`) = soft bounce (log but do not invalidate).

**Idempotency:** Use `svix-id` header as deduplication key. Store processed webhook IDs if Resend retries are a concern.

**Environment variable needed:** `RESEND_WEBHOOK_SECRET` — obtained from Resend dashboard when registering the webhook endpoint.

---

### Claude API — Social Campaign Calendar Generation

**Current SDK version installed:** `@anthropic-ai/sdk` `0.107.0` (package.json says `^0.52.0` but npm resolved to 0.107.0).

**Structured outputs availability:** The installed 0.107.0 does NOT expose `messages.parse()` or `zodOutputFormat` in its TypeScript types. These are part of a later release. Do not depend on them for Wave 3.

**Correct approach — follow the existing pattern in `lib/tools/registry.ts`:** Prompt Claude to return a JSON object directly, then `JSON.parse()` the response text. This pattern is already used for every tool in the codebase (EPK, DropReady, SoundBait, etc.) and is reliable with the current model generation.

**Calendar prompt contract:**

```typescript
// Response shape Claude is prompted to return:
type CalendarOutput = {
  weeks: number  // 4-6
  posts: Array<{
    week: number
    day_of_week: number   // 0=Sunday
    platform: 'instagram' | 'tiktok' | 'x' | 'youtube_shorts' | 'facebook' | 'threads'
    content_type: 'reel' | 'story' | 'post' | 'short' | 'thread' | 'tweet'
    caption: string
    hook: string | null   // null for non-short-form platforms
    rationale: string     // brief "why this week, this platform" — surfaced as tooltip
  }>
  platform_nudge: string  // best-practice recommendation for this genre
}
```

Inject into prompt: release title, genre, sub-genre, release date, collaborator names, selected platforms, artist notes. Cap `max_tokens` at 4096; a 6-week calendar across 4 platforms is roughly 24–36 posts at ~100 tokens each plus overhead.

**Model:** Use `claude-sonnet-4-6` (the model running this research agent). It is the same model as `claude-sonnet-4-5` for SDK purposes — check the model string against the existing tool routes in `app/api/tools/`.

---

### CSV Export — Buffer-Compatible Format

**Columns (Buffer bulk upload schema):**

| Column | Required | Notes |
|--------|---------|-------|
| `Text` | Conditional | Caption text. Required if no Image URL. Wrap in quotes for commas/newlines. |
| `Image URL` | Conditional | Direct URL to media (.jpg/.png). Required if no Text. |
| `Tags` | Optional | Case-sensitive; must be existing Buffer tags. Leave blank. |
| `Posting Time` | Optional | `YYYY-MM-DD HH:mm` (24h). Leave blank = next queue slot. |

**Funūn export mapping:**

```
Text         ← post.caption (+ hook if short-form, appended with newline)
Image URL    ← (blank — artist adds their own media)
Tags         ← release title (so artist can filter in Buffer)
Posting Time ← release_date + week offset + day_of_week + suggested time by platform
```

**Later:** Later does NOT support CSV bulk import as of 2026 — it is an open feature request on their community forum. Do not claim Later compatibility. Label the export "Buffer CSV" and note that Later users should use Buffer's re-export or manual scheduling.

**Implementation:** Use `csv-stringify` in synchronous mode:

```typescript
import { stringify } from 'csv-stringify/sync'

const csv = stringify(rows, {
  header: true,
  columns: ['Text', 'Image URL', 'Tags', 'Posting Time'],
  quoted_string: true,
  cast: { string: (value) => value ?? '' },
})
// Return as NextResponse with Content-Type: text/csv
```

---

## What NOT to Add

| Thing | Why not |
|-------|---------|
| `nodemailer` / any SMTP library | Resend is already configured and handles all transactional email. No SMTP needed. |
| `mjml` or `react-email` | Pitch emails are plain-text with an HTML fallback. No template engine needed; Resend handles basic HTML in the `html` field of `resend.emails.send()`. |
| `next-auth` / auth overhaul | Supabase auth is the SSoT. Curator claim flow uses a signed token in the pitch email URL, not a new auth system. |
| `zod` upgrade | Already at v3.23.0 and the existing pattern (Zod for API validation, plain JSON for AI output) covers all Wave 3 needs. |
| `react-query` / `swr` | The codebase is server-component-first with direct Supabase fetches. No client-side caching layer is needed for Launchpad. |
| `node-cron` / job queue | Genre drift alerts and monthly tip regeneration are low-frequency admin actions. Implement as admin-triggered API routes in Wave 3; a job queue (e.g. Inngest) can be added in Wave 4 if needed. |
| `Later API` | Later has no public CSV import. Do not implement. Export to Buffer format only. |
| `socialpilot` / `hootsuite` SDK | Out of scope — Wave 3 is planning-only, no scheduling execution. |
| `deep-email-validator` | Does MX + SMTP checks via DNS — adds latency and complexity. Bounce detection via Resend webhooks is the correct production-grade signal; format validation via `validator.isEmail()` is sufficient at send time. |
| Upgrade `@anthropic-ai/sdk` | Already at 0.107.0 (npm resolved past the 0.52 semver floor). `messages.parse()` / `zodOutputFormat` are not in this version; the existing JSON-prompt pattern is correct and proven across 6 tools. |

---

## Sources

- Resend webhook event types: https://resend.com/docs/webhooks/event-types
- Resend bounce details changelog: https://resend.com/changelog/email-bounce-details
- Svix webhook verification (Next.js): https://www.svix.com/guides/receiving/receive-webhooks-with-javascript-nextjs/
- Svix TypeScript guide: https://www.svix.com/guides/receiving/receive-webhooks-with-typescript/
- Svix docs — verifying payloads: https://docs.svix.com/receiving/verifying-payloads/how
- Buffer CSV bulk upload: https://support.buffer.com/article/926-how-to-upload-posts-in-bulk-to-buffer
- Later CSV bulk upload (feature request, not shipped): https://ideas.later.com/ideas/LATER-I-1306
- Anthropic structured outputs (GA): https://platform.claude.com/docs/en/build-with-claude/structured-outputs
- csv-stringify vs json2csv vs fast-csv comparison: https://npm-compare.com/csv-stringify,fast-csv,json2csv,papaparse
- validator npm package: https://www.npmjs.com/package/validator
- Abstract API email validation comparison 2026: https://www.abstractapi.com/guides/email-validation/open-source-email-validation
- Supabase RLS best practices: https://makerkit.dev/blog/tutorials/supabase-rls-best-practices
- Supabase RLS — app_metadata for authorization: https://github.com/orgs/supabase/discussions/13091
