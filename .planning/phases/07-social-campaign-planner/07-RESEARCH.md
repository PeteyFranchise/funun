# Phase 7: Social Campaign Planner - Research

**Researched:** 2026-07-02
**Domain:** AI-generated content calendar (batch Claude JSON prompt), JSONB-modeled campaign data, CSV export for a third-party scheduler (Buffer), inline tool-generation wiring on top of an existing Launchpad room
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Calendar Generation, Campaigns & Editing**
- **D-01:** Platform selection (SOCIAL-01) is editable anytime, not locked before first generation. Adding a platform after a calendar exists triggers a scoped regeneration of just that platform's slots — existing slots for other platforms (including manual edits) are untouched.
- **D-02:** Calendar length is fixed at 4 weeks — matches Phase 5's existing checklist week structure (weeks 1-4 = the Spotify algorithmic window), keeps generation a true one-click action, no length selector needed.
- **D-03:** Calendar slots are inline-editable — artist can click into any slot's caption/hook and hand-edit the text directly, not just via DropReady/SoundBait regeneration. AI output is a starting point.
- **D-04:** Multiple campaigns per project are allowed (no UNIQUE constraint on project_id in social_campaigns). One campaign is marked active via an explicit is_active boolean; the active campaign is what the Launchpad room displays, what completion tracking / DropReady-SoundBait wiring / CSV export all operate on. Exactly one active campaign per project is an invariant the API must enforce (flip old active off when a new one is set active).
- **D-05:** Inactive campaigns can be hard-deleted by the artist from a history/list view (mirrors the hard-delete convention already used for checklist items in Phase 5).
- **D-06:** Slot pacing is AI-decided per platform, not a fixed 1-slot-per-platform-per-week grid — the AI can put multiple posts in one week for high-frequency platforms (e.g. TikTok) and fewer for others, based on what's realistic for that platform.
- **D-07:** Content-type tag (short-form video / static image / lyric graphic / text / stories) is assigned by the AI per slot, not derived from a fixed platform→type mapping — gives variety (e.g. Instagram getting both a static image slot and a Stories slot across different weeks) using the release story/context the AI already has.

**Genre → Platform Nudge Table (SOCIAL-02)**
- **D-08:** Nudge data lives in a hardcoded TS map (e.g. `lib/launchpad/platform-nudges.ts`) — genre → ranked platform list + short rationale. No DB table, no admin UI.
- **D-09:** Nudge is surfaced as advisory badges only in the platform selector — all 6 platforms shown as plain checkboxes, a small badge/note next to genre-recommended ones. Nothing is pre-checked.

**DropReady / SoundBait ↔ Calendar Wiring (SOCIAL-05)**
- **D-10:** Inline slot action ("Generate caption" / "Generate hook") uses a preview-then-accept/discard flow — clicking generates a preview shown alongside the current caption/hook; artist clicks "Use this" to write it into the slot or "Discard" to keep the original. Never silently overwrites.
- **D-11:** Standalone DropReady/SoundBait runs (Launchpad tools view, not slot-scoped) get a "Save to calendar" picker after generation — opens a small picker (platform + week + slot), writes the result into that slot via the same preview/accept pattern as D-10. Standalone `tool_outputs` history is unaffected either way.
- **D-12:** Inline slot generation uses a new slot-scoped prompt variant (extends `lib/tools/registry.ts`'s `buildDropReadyPrompt`/`buildSoundBaitPrompt` pattern) that takes platform + week + content-type as additional context and returns one tailored caption/hook for that slot — not the existing multi-field standalone JSON shape.

**Completion Tracking (SOCIAL-06)**
- **D-13:** Completion is a field directly on each slot object inside `social_campaigns.posts` JSONB (`completed: boolean`, `completed_at: timestamptz`) — no separate progress table. Checkbox UI matches Phase 5's `ChecklistItem` pattern.

**Launchpad Checklist Integration**
- **D-14:** Social-adjacent Phase 5 checklist items get their `action_href` deep-linked to the campaign calendar section of `/launchpad/[projectId]` after Phase 7 ships. This is an admin data edit through the existing Phase 5 admin checklist CRUD — no schema change, no new code path.

**CSV Export & Posting Time (SOCIAL-07)**
- **D-15:** Posting Time is a hybrid: auto-derived default (`release_date + (week-1)*7 days`, landing on a fixed day-of-week + time per platform, chosen by Claude during planning using general social-timing best practice) is computed for every slot automatically. The artist can override any slot's date/time individually. Export always uses whatever value is currently set on the slot.
- **D-16:** `Image URL` column is content-type-aware: populated with the project's release artwork URL only for slots tagged `static image` or `lyric graphic`; left blank for `short-form video`, `text`, and `stories` slots.
- **D-17:** `Tags` column = platform + content type (e.g. `"tiktok, short-form video"`), derived directly from slot fields — always available on every slot regardless of whether DropReady/SoundBait ever ran on it. Not tied to AI-generated hashtags.
- **D-18:** Export supports a selectable subset — artist can choose which platforms/weeks to include via checkboxes before exporting, rather than always dumping the entire active campaign.

### Claude's Discretion
- Exact fixed default day-of-week + time per platform for D-15 (Claude picks during planning, grounded in general best-practice timing per platform). **Resolved below in "Per-Platform Posting Defaults."**
- Full `social_campaigns` schema beyond what's decided above (columns for `is_active`, `posts` JSONB shape). **Resolved below in "JSONB Schema Design."**
- Exact genre list and platform rankings in the D-08 hardcoded nudge map — derive from existing genre values used elsewhere in the codebase. **Resolved below in "Genre → Platform Nudge Table Content."**
- UI placement/layout of the campaign calendar section within `/launchpad/[projectId]` — follow existing Launchpad room patterns from Phase 5/6.
- History/list view UI for switching/deleting inactive campaigns (D-04/D-05) — minimal list is sufficient.

### Deferred Ideas (OUT OF SCOPE)
- **Direct social posting / scheduling (Meta/TikTok OAuth)** — confirmed out of scope for Phase 7; flagged as a Wave 4 candidate. Funūn's role ends at planning, drafting, and CSV export.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SOCIAL-01 | Artist selects active platforms per project (Instagram, TikTok, X, YouTube Shorts, Facebook, Threads) | See "Genre → Platform Nudge Table Content" and existing `EditProjectForm.tsx`/checkbox-array patterns for a per-project multi-select column (`platforms TEXT[]` on `social_campaigns` or a project-level column — see Open Questions) |
| SOCIAL-02 | Genre-based best-practice platform nudges | `lib/genres.ts` (20-slug DSP genre list) is the correct source list; nudge map keyed by those slugs — see "Genre → Platform Nudge Table Content" for the full recommended map and the free-text-vs-slug matching pitfall |
| SOCIAL-03 | AI generates 4-week calendar from release data + collaborators-table data | `lib/tools/registry.ts` prompt-building pattern + `app/api/tools/[slug]/route.ts` batch-call/JSON-extraction pattern are the direct precedent; see "Architecture Patterns" for the new calendar-generation endpoint and "Open Questions" for the collaborators join |
| SOCIAL-04 | Each slot shows caption/hook, content-type tag, suggested week | See "JSONB Schema Design" for the exact `posts` array shape |
| SOCIAL-05 | DropReady/SoundBait as inline slot actions AND standalone tools | Confirmed both tools are fully implemented today (`lib/tools/registry.ts`); `app/api/tools/[slug]/route.ts` untouched; new slot-scoped endpoint is additive — see "Architecture Patterns" |
| SOCIAL-06 | Per-project completion tracking on calendar posts | `completed`/`completed_at` fields directly on each JSONB slot object, mirrors `ChecklistItem.tsx`'s checkbox-independent-of-panel interaction pattern |
| SOCIAL-07 | Buffer-compatible CSV export (`Text`, `Image URL`, `Tags`, `Posting Time`) | Verified against Buffer's own bulk-upload docs — see "Buffer CSV Export Format"; `lib/metadata/export.ts`'s `buildCsv`/`csvCell` is the direct code precedent to mirror |
</phase_requirements>

## Summary

Phase 7 is almost entirely a **composition phase**, not a new-technology phase: every mechanical piece it needs already exists in the codebase in a directly reusable shape. The AI calendar generation is a straightforward extension of the existing `buildToolPrompt`/`app/api/tools/[slug]/route.ts` batch-JSON-prompt pattern (same model constant, same `extractJson` fenced-JSON parser, same `<release_data>`-style isolation block already used implicitly by every existing tool prompt). The CSV export is a near-verbatim reuse of `lib/metadata/export.ts`'s `buildCsv`/`csvCell` pattern, which already produces exactly the client-download-with-`Content-Disposition`-header shape D-18's "manual export, no Buffer API" requirement needs. Completion tracking mirrors `ChecklistItem.tsx`'s checkbox-independent-of-panel interaction pixel-for-pixel. The one genuinely new piece of infrastructure is the `social_campaigns` table itself and its `posts` JSONB array — for which this codebase already has two established conventions to follow: (1) RLS on child-of-project tables is enforced via a **denormalized `user_id`/`artist_id` column with a direct `auth.uid() = user_id` policy**, not an `EXISTS (SELECT ... FROM vault_projects)` join (confirmed via `pitch_history`, migration 030) — `curators`/`pitch_history` is the closer precedent than a generic "owner via project" pattern; and (2) JSONB array-of-objects columns are read with a defensive `readX()` function and written with a `sanitizeX()` function (see `lib/metadata/schema.ts`'s `readComposers`/`sanitizeComposers`), never trusted raw from the client.

Two areas need explicit attention the CONTEXT.md decisions didn't fully close: **collaborators are a global per-user roster, not project-linked** (no `project_id` FK on `collaborators`; the only project link is indirect, through `split_sheet_parties.split_sheet_id → split_sheets.vault_project_id`), so "collaborators-table data" for the AI prompt should be read as "the artist's full collaborator roster" (names only — no `role` field exists on `collaborators` itself), not a project-scoped join. And **`vault_projects.genre` is a free-text input field**, not constrained to `lib/genres.ts`'s 20 slugs (only `artist_profiles.genres` is array-of-slug), so the nudge-table lookup needs the same defensive lowercase/fuzzy-match pattern already used in `lib/benchmarks/engine.ts`'s `GENRE_FACTORS` lookup, with the artist's `artist_profiles.genres` array preferred as primary signal when present.

**Primary recommendation:** Build `social_campaigns` with a direct `user_id` column (RLS: `auth.uid() = user_id`, mirroring `pitch_history`), a partial unique index enforcing "one active campaign per project," and a `posts JSONB` array of flat slot objects with `readPosts()`/`sanitizePosts()` helpers in `lib/launchpad/campaigns.ts` mirroring `lib/metadata/schema.ts`'s composer pattern; reuse `app/api/tools/[slug]/route.ts`'s batch-call shape for both the full-calendar-generation endpoint and the new slot-scoped endpoint; reuse `lib/metadata/export.ts`'s `csvCell`/`buildCsv` shape verbatim for the Buffer CSV, with the exact column format verified against Buffer's own bulk-upload documentation.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Platform selection UI + genre nudge badges | Browser / Client | API / Backend (persist selection) | Client renders checkboxes + advisory badges from a static TS map (no fetch needed for nudges); selection persisted via a small PATCH |
| Genre → platform nudge lookup | API / Backend (pure fn) | — | Pure function (`lib/launchpad/platform-nudges.ts`), imported by both server (initial render) and reused by client if needed — no DB round-trip |
| AI calendar generation | API / Backend | — | Batch (non-streaming) Anthropic call must run server-side (API key never exposed to client); mirrors `app/api/tools/[slug]/route.ts` |
| Slot-scoped DropReady/SoundBait generation | API / Backend | — | New endpoint, same reasoning as above; server-side Anthropic call |
| Calendar slot storage (`posts` JSONB) | Database / Storage | API / Backend (read/write helpers) | Source of truth is Supabase; `lib/launchpad/campaigns.ts` owns typed read/sanitize logic, mirroring `lib/metadata/schema.ts` |
| Inline slot editing (caption/hook text, posting time override) | Browser / Client | API / Backend (PATCH persistence) | Optimistic local edit + PATCH, same pattern as `LaunchpadRoom.tsx`'s `onToggle` |
| Completion checkbox | Browser / Client | API / Backend (PATCH persistence) | Identical interaction pattern to `ChecklistItem.tsx` |
| CSV export | API / Backend | Browser / Client (triggers download) | Server builds CSV string + sets `Content-Disposition`; client is a plain `<a href="/api/.../export">` or `window.location` trigger, no client-side CSV library needed |
| Buffer import | Out of scope (external) | — | Artist manually uploads the downloaded CSV into Buffer's own UI; Funūn has zero API integration with Buffer (confirmed by D-18/ROADMAP note) |

## Standard Stack

No new external libraries are required for this phase. Every mechanical requirement (batch AI JSON calls, CSV generation, JSONB read/write, RLS-scoped tables) is already served by libraries already in `package.json` (`@anthropic-ai/sdk`, `@supabase/supabase-js`, `zod`) and by existing internal helper patterns.

### Core (reused, not new)
| Library | Version | Purpose | Why Standard (in this repo) |
|---------|---------|---------|------------------------------|
| `@anthropic-ai/sdk` | ^0.52.0 (installed) | Batch JSON-prompt calendar + slot generation calls | Already used identically by every tool in `lib/tools/registry.ts` via `app/api/tools/[slug]/route.ts` |
| `@supabase/supabase-js` (via `createApiClient`/`createServerClient`) | 2.45.0 (installed) | `social_campaigns` CRUD, RLS enforcement | Existing client factories in `lib/supabase/server.ts` |
| `zod` | ^3.23.0 (installed) | Validating slot-edit / CSV-export-subset request bodies | Project-wide validation convention |

### Supporting
None required.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled `csvCell`/`buildCsv` (reuse existing pattern) | `papaparse` or similar CSV library | Not worth adding a dependency — `lib/metadata/export.ts` already proves the hand-rolled escaping (`/[",\n]/` quote-and-double-quote) is correct and sufficient for this project's CSV needs; adding a library here would be inconsistent with the established convention |
| Native `Date` arithmetic for D-15 posting-time defaults | `date-fns` / `dayjs` | No date library exists in `package.json` today; the arithmetic needed (`release_date + (week-1)*7 days`, landing on a fixed weekday) is a handful of lines of native `Date` math — do not introduce a new dependency for this phase |

**Installation:** None required — no new packages.

## Package Legitimacy Audit

**No new external packages are introduced by this phase.** All functionality is built from libraries already present in `package.json` (confirmed via direct read: `@anthropic-ai/sdk`, `@dnd-kit/*`, `@stripe/stripe-js`, `@supabase/auth-helpers-nextjs`, `@supabase/supabase-js`, `next`, `node-id3`, `react`, `react-dom`, `resend`, `stripe`, `svix`, `zod`). No `npm view`/`gsd-tools query package-legitimacy` audit was needed since there is nothing new to install.

**Packages removed due to [SLOP] verdict:** none — no packages proposed.
**Packages flagged as suspicious [SUS]:** none.

## Architecture Patterns

### System Architecture Diagram

```
                    ┌─────────────────────────────────────────────┐
                    │  /launchpad/[projectId]  (server component) │
                    │  existing: LaunchpadRoom + PitchComposer     │
                    │  NEW: CampaignCalendar section                │
                    └───────────────┬───────────────────────────────┘
                                    │ fetch active campaign (server-side, RLS-scoped)
                                    ▼
                    ┌───────────────────────────────┐
                    │  social_campaigns (Supabase)   │
                    │  posts JSONB[] per campaign    │
                    └───────────────┬───────────────┘
                                    │
        ┌───────────────────────────┼────────────────────────────────┐
        │                           │                                 │
        ▼                           ▼                                 ▼
┌───────────────────┐    ┌─────────────────────────┐      ┌──────────────────────┐
│ Generate calendar  │    │ Inline slot action       │      │ Standalone tool run   │
│ (one-click)        │    │ "Generate caption/hook"  │      │ (Launchpad tools view)│
│ POST /api/launchpad│    │ POST /api/launchpad/     │      │ POST /api/tools/      │
│ /[projectId]/       │    │ campaigns/[id]/slots/    │      │ [slug]  (unchanged)   │
│ campaigns           │    │ [slotId]/generate         │      │                        │
└─────────┬──────────┘    └───────────┬───────────────┘      └───────────┬────────────┘
          │ release + collaborator      │ preview-then-accept              │ generates full
          │ data → <release_data>       │ (D-10) → PATCH slot on           │ multi-field output
          │ block → Anthropic batch     │ "Use this"                       │ → "Save to calendar"
          │ call → parsed posts[]       │                                   │ picker (D-11) → same
          ▼                              ▼                                   │ PATCH-slot path
┌───────────────────────────────────────────────────────────────┐          │
│ PATCH /api/launchpad/campaigns/[id]/slots/[slotId]              │◄─────────┘
│  - inline caption/hook edit (D-03)                               │
│  - posting_time override (D-15)                                  │
│  - completed toggle (D-13)                                       │
└───────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │ GET /api/launchpad/campaigns/  │
                    │ [id]/export?platforms=..&weeks=│ (D-18 subset)
                    │  → text/csv, Content-Disposition│
                    └───────────────┬───────────────┘
                                    │ artist downloads, manually
                                    ▼ uploads into Buffer's own UI
                          (Funūn ↔ Buffer: no API integration)
```

### Recommended Project Structure
```
lib/launchpad/
├── playbook.ts                # existing (unchanged)
├── platform-nudges.ts         # NEW — D-08 hardcoded genre→platform map
└── campaigns.ts                # NEW — readPosts()/sanitizePosts()/types, mirrors lib/metadata/schema.ts

lib/tools/
└── registry.ts                 # EXTENDED — new buildSlotCaptionPrompt/buildSlotHookPrompt (D-12), dispatched by a new slug or a dedicated function (not through getTool()/ToolSlug, since slot-scoped generation isn't a standalone "tool" — see Pitfall below)

app/api/launchpad/
└── [projectId]/
    ├── checklist/route.ts       # existing (unchanged)
    ├── progress/route.ts         # existing (unchanged)
    └── campaigns/
        ├── route.ts               # NEW — POST generate calendar, GET list campaigns, PATCH set active, DELETE inactive campaign (D-04/D-05)
        └── [campaignId]/
            ├── slots/[slotId]/route.ts          # NEW — PATCH slot (edit/complete/posting_time)
            ├── slots/[slotId]/generate/route.ts # NEW — D-12 slot-scoped generation (preview only, does not write)
            └── export/route.ts                    # NEW — D-18 CSV export (GET, subset query params)

components/launchpad/
├── ChecklistItem.tsx / TipPanel.tsx / ChecklistSection.tsx / LaunchpadRoom.tsx  # existing (unchanged)
├── PlatformSelector.tsx        # NEW — D-01/D-09 checkboxes + nudge badges
├── CampaignCalendar.tsx        # NEW — week/platform grid, mirrors LaunchpadRoom's optimistic-PATCH shell
├── CampaignSlot.tsx            # NEW — one slot card: caption/hook, content-type tag, checkbox (mirrors ChecklistItem), inline edit
├── SlotGeneratePanel.tsx       # NEW — D-10 preview-then-accept/discard panel
├── SaveToCalendarPicker.tsx    # NEW — D-11 picker shown after a standalone DropReady/SoundBait run
└── CampaignHistoryList.tsx     # NEW — D-04/D-05 switch-active / hard-delete list
```

### Pattern 1: Batch JSON-prompt calendar generation (extends existing tool-runner shape)
**What:** A server-side Anthropic call that returns structured JSON, using the exact `extractJson` fenced-JSON-parsing helper already in `app/api/tools/[slug]/route.ts`.
**When to use:** Full-calendar generation (SOCIAL-03) and any future batch AI call in this phase.
**Example:**
```typescript
// Source: app/api/tools/[slug]/route.ts (existing, verbatim pattern to mirror)
function extractJson(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = fenced ? fenced[1] : text
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1) return null
  try {
    return JSON.parse(raw.slice(start, end + 1))
  } catch {
    return null
  }
}

const MODEL = 'claude-sonnet-4-6' // match existing hardcoded constant — see Pitfall 4 below
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const message = await anthropic.messages.create({
  model: MODEL,
  max_tokens: 4000, // calendar JSON is large (4 weeks × up to 6 platforms) — do not under-budget (see Pitfall 2)
  messages: [{ role: 'user', content: prompt }],
})
```

### Pattern 2: `<release_data>`-delimited prompt with hard-coded platform constraints
**What:** Isolate user-supplied release data in a clearly delimited block; keep platform posting norms (character limits, content-type conventions) in the system/prompt text, not user-controllable.
**When to use:** Calendar-generation prompt and the new slot-scoped prompt (D-12).
**Example:**
```typescript
// Source: pattern synthesized from lib/tools/registry.ts's existing prompt shape
// (existing prompts don't use an explicit <release_data> tag today, but every
// existing prompt already isolates release fields under a "RELEASE" heading —
// ROADMAP.md's <release_data> note formalizes that as an explicit delimiter
// for the new, larger calendar prompt, where the injection surface is bigger)
return `You are a social media strategist building a 4-week release campaign calendar...

PLATFORM CONSTRAINTS (fixed — do not deviate)
- Instagram: caption up to ~2,200 characters; content types: static image, Stories, Reels (short-form video)
- TikTok: caption under 150 characters; content type: short-form video only
- X: post under 280 characters; content types: text, static image
- YouTube Shorts: title under 100 characters; content type: short-form video only
- Facebook: caption up to ~500 characters recommended; content types: static image, short-form video, text
- Threads: post under 500 characters; content types: text, static image

<release_data>
Title: ${project.title}
Genre: ${project.genre ?? 'unspecified'}
Release date: ${project.release_date ?? 'TBA'}
Artist notes (the "story"): ${project.notes ?? 'none provided'}
Collaborators: ${collaboratorNames.length ? collaboratorNames.join(', ') : 'none'}
Active platforms: ${activePlatforms.join(', ')}
</release_data>

Respond with ONLY a JSON object...`
```

### Pattern 3: RLS on a project-child table — denormalized owner column, not a join
**What:** `social_campaigns` gets its own `user_id UUID REFERENCES auth.users`, populated at insert time from the authenticated request — the RLS policy checks `auth.uid() = user_id` directly. This is the confirmed convention for `pitch_history` (migration 030), not an `EXISTS (SELECT ... FROM vault_projects WHERE ...)` subquery join.
**When to use:** `social_campaigns` (this phase). `curators`/`pitch_history` is the closer sibling precedent than `collaborators` (which is genuinely global, no project link at all) or `split_sheet_parties` (which legitimately needs the join because parties aren't 1:1 with a single user).
**Example:**
```sql
-- Source: supabase/migrations/030_curators_pitch_history.sql (existing, verbatim pattern)
CREATE TABLE pitch_history (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id     UUID NOT NULL REFERENCES vault_projects(id) ON DELETE CASCADE,
  artist_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ...
);
ALTER TABLE pitch_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Artists read own pitch history" ON pitch_history
  FOR SELECT USING (auth.uid() = artist_id);

-- Apply identically to social_campaigns:
CREATE TABLE social_campaigns (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id  UUID NOT NULL REFERENCES vault_projects(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL DEFAULT 'Campaign',
  platforms   TEXT[] NOT NULL DEFAULT '{}',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  posts       JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE social_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own campaigns" ON social_campaigns
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- D-04's "exactly one active campaign per project" invariant — DB-level backstop
-- (API-level flip-old-active-off logic is still required; this is defense-in-depth,
-- same "belt and suspenders" posture as migration 032's UNIQUE index on claim_token):
CREATE UNIQUE INDEX idx_social_campaigns_one_active_per_project
  ON social_campaigns (project_id) WHERE is_active;

CREATE INDEX idx_social_campaigns_project ON social_campaigns (project_id);
CREATE TRIGGER set_social_campaigns_updated_at
  BEFORE UPDATE ON social_campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### Pattern 4: JSONB array-of-objects — typed read + sanitize helpers, never trust raw client JSONB
**What:** `posts` is read through a `readPosts()` function that defensively coerces every field (same style as `readComposers`), and any client-supplied slot edit goes through a `sanitizePostEdit()` allowlist before merge-and-save — never `UPDATE ... SET posts = $clientJson` directly.
**When to use:** Every read and every write of `social_campaigns.posts`.
**Example:**
```typescript
// Source: lib/metadata/schema.ts's readComposers/sanitizeComposers (existing, pattern to mirror)
export type SocialPost = {
  id: string
  platform: Platform
  week: 1 | 2 | 3 | 4
  content_type: ContentType
  caption: string
  posting_time: string // ISO 8601 timestamptz
  completed: boolean
  completed_at: string | null
  source: 'ai' | 'manual' // provenance — did AI write this, or has the artist hand-edited/regenerated it
}

export function readPosts(posts: unknown): SocialPost[] {
  if (!Array.isArray(posts)) return []
  return posts
    .map(r => {
      const o = (r ?? {}) as Record<string, unknown>
      // ... same defensive coercion shape as readComposers: validate enums against
      // *_VALUES arrays, Number.isFinite guards, String(...).trim() on text fields
    })
    .filter(p => p.id && p.platform)
}

// Client edits are scoped: PATCH body carries {slotId, field, value} — never
// the full posts array — server loads current posts, finds the slot by id,
// applies ONLY the allowlisted field, re-saves. Mirrors EDITABLE_FIELDS
// allowlist convention in app/api/profile/route.ts.
```

### Pattern 5: CSV export — server-built string, `Content-Disposition` download, no client CSV library
**What:** A pure function building the CSV string (with correct quote-escaping), served from a GET route with `text/csv` content-type and an `attachment` disposition header.
**When to use:** SOCIAL-07 export.
**Example:**
```typescript
// Source: lib/metadata/export.ts's csvCell/buildCsv (existing, verbatim pattern to mirror)
function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// D-16/D-17: Buffer's required headers are case-sensitive — "Text", "Image URL",
// "Tags", "Posting Time" (verified against Buffer's own bulk-upload docs, see
// "Buffer CSV Export Format" below).
const BUFFER_CSV_HEADERS = ['Text', 'Image URL', 'Tags', 'Posting Time']

export function buildBufferCsv(posts: SocialPost[], project: { cover_art_url: string | null }): string {
  const IMAGE_TYPES = new Set(['static_image', 'lyric_graphic'])
  const rows = [BUFFER_CSV_HEADERS.join(',')]
  for (const p of posts) {
    rows.push(
      [
        p.caption,
        IMAGE_TYPES.has(p.content_type) ? (project.cover_art_url ?? '') : '',
        `${p.platform}, ${p.content_type.replace(/_/g, ' ')}`, // D-17 — comma-separated within cell (Buffer's own convention)
        formatBufferPostingTime(p.posting_time), // "YYYY-MM-DD HH:mm" — see below
      ]
        .map(csvCell)
        .join(',')
    )
  }
  return rows.join('\n')
}

// Buffer's Posting Time format is YYYY-MM-DD HH:mm (24h), no timezone suffix —
// Buffer applies the account's configured timezone. Do NOT emit ISO 8601 with
// a "Z"/offset suffix; Buffer's importer does not parse it (Pitfall 3 below).
function formatBufferPostingTime(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
```

```typescript
// GET route shape — mirrors app/api/vault/[projectId]/metadata/export/route.ts
return new Response(buildBufferCsv(selectedPosts, project), {
  headers: {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${slug}-social-calendar.csv"`,
  },
})
```

### Anti-Patterns to Avoid
- **Registering slot-scoped generation as a new `ToolDef`/`ToolSlug` entry in `lib/tools/registry.ts`:** The existing `TOOLS` array + `getTool()`/`buildToolPrompt()` dispatcher is designed for the "standalone quick tool, full multi-field JSON output, saved to `tool_outputs`" shape. D-12's slot-scoped variant has a different, smaller output shape (one caption/hook, not the 6-field `DropReadyOutput`/`SoundBaitOutput`) and a different save target (a calendar slot, not `tool_outputs`). Add new prompt-builder functions to `registry.ts` (reusing `ToolProjectContext`) but dispatch them from the new slot-generation route directly, not through `getTool()`.
- **Trusting the client-submitted `posts` array wholesale on any PATCH:** Always load current `posts` server-side, locate the target slot by `id`, apply only the allowlisted field(s) from the request body, and re-save the full array. Never accept a client-supplied full `posts` array as the new column value.
- **Emitting ISO 8601 timestamps (with `Z`/offset) into the Buffer CSV's Posting Time column:** Buffer's bulk-upload format expects exactly `YYYY-MM-DD HH:mm`; always format explicitly rather than `.toISOString()`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CSV escaping | A custom CSV writer library | The existing `csvCell` regex-based escaper (`lib/metadata/export.ts`) | Already correct for this project's needs (handles commas/quotes/newlines); adding `papaparse` etc. would be inconsistent with the established convention and unnecessary for a 4-column export |
| Fenced-JSON extraction from Claude responses | A new JSON-parsing helper | `extractJson()` from `app/api/tools/[slug]/route.ts` | Already handles the ` ```json ` fence + brace-matching correctly for every existing tool; the calendar/slot generation calls should reuse it verbatim (either import it, or duplicate the ~10 lines if the new route can't easily import from the `[slug]` route file) |
| "Exactly one active row" invariant | Application-only enforcement (a client-side check, or a server check with a race-condition window between "flip old off" and "set new on") | A Postgres **partial unique index** (`WHERE is_active`) as the DB-level backstop, with the API doing the two-step flip inside a single transaction/RPC | Matches this project's established "belt and suspenders" posture (see migration 032's UNIQUE index on `claim_token`, added specifically because relying on application logic alone was flagged in code review) |

**Key insight:** This phase's biggest risk isn't "we don't know how to build X" — every piece has a working precedent already in the repo. The risk is **silently diverging from an established convention** (e.g., inventing a new CSV escaping approach, a new JSON-parsing regex, a new RLS join pattern) when an audited, working one already exists three files away.

## Genre → Platform Nudge Table Content (D-08)

**Source list:** `lib/genres.ts` — the canonical 20-slug DSP genre list, already used by `artist_profiles.genres` (TEXT[], migration 022) and rendered in `ProfileForm.tsx`. This is a project-wide list (Spotify/Apple Music/Amazon/Tidal categories), not something the researcher invented.

```
pop, hip_hop_rap, rnb_soul, rock, electronic_dance, country, latin, jazz,
classical, folk_americana, reggae, gospel_christian, metal, alternative,
indie, blues, funk, afrobeats, k_pop, world_global
```

**Recommended nudge map** (advisory rationale grounded in each platform's known content-format strengths — general industry knowledge, not scraped from a live source, so tagged `[ASSUMED]` per platform rationale text; the platform list itself and genre slugs are `[VERIFIED: codebase]`):

| Genre slug | Top platforms (ranked) | Rationale (short) |
|---|---|---|
| `pop` | TikTok, Instagram, YouTube Shorts | Short-form hook culture drives pop discovery; visual-forward |
| `hip_hop_rap` | TikTik, X, Instagram | TikTok sound-driven virality; X for culture/discourse |
| `rnb_soul` | Instagram, TikTok, Threads | Visual mood + intimate captioning outperforms pure short-form churn |
| `rock` | Instagram, YouTube Shorts, Facebook | Older core audience skews Facebook/YouTube; Instagram for visuals |
| `electronic_dance` | TikTok, Instagram, YouTube Shorts | Visual/audio-loop format matches EDM drops |
| `country` | Facebook, Instagram, TikTok | Country audience over-indexes on Facebook vs. general population |
| `latin` | TikTok, Instagram, YouTube Shorts | High TikTok/Reels penetration in Latin music discovery |
| `jazz` | Instagram, Facebook, YouTube Shorts | Older/niche audience, long-form-friendly platforms |
| `classical` | YouTube Shorts, Instagram, Facebook | Visual/performance clips; niche audience skews YouTube |
| `folk_americana` | Instagram, Facebook, YouTube Shorts | Story-driven captioning fits Instagram; older audience on Facebook |
| `reggae` | Instagram, TikTok, Facebook | Broad diaspora reach across all three |
| `gospel_christian` | Facebook, Instagram, YouTube Shorts | Facebook remains a strong community hub for this audience |
| `metal` | Instagram, YouTube Shorts, X | Visual + community-discourse platforms |
| `alternative` | Instagram, TikTok, X | Balanced across visual + discourse platforms |
| `indie` | Instagram, TikTok, Threads | Text/photo-forward audience, early Threads adopters |
| `blues` | Facebook, Instagram, YouTube Shorts | Older core audience |
| `funk` | Instagram, TikTok, YouTube Shorts | Dance/visual-forward genre |
| `afrobeats` | TikTok, Instagram, YouTube Shorts | Extremely strong TikTok-driven global discovery pattern |
| `k_pop` | TikTok, Instagram, X | X/Twitter fandom-community culture is unusually strong for K-pop specifically |
| `world_global` | Instagram, YouTube Shorts, Facebook | Broadest-reach default when genre is highly specific/unmapped |

**Fallback for unmapped/free-text genre:** default to `Instagram, TikTok, YouTube Shorts` (broadest general applicability) when no slug match is found.

### Pitfall: `vault_projects.genre` is free text, not a slug
`components/vault/EditProjectForm.tsx` renders genre as a plain `<input>` (placeholder `"e.g. R&B"`), not a `<select>` bound to `lib/genres.ts`. Only `artist_profiles.genres` (used at the profile level, not per-project) is a constrained array of the 20 slugs. This means:
1. **Prefer `artist_profiles.genres`** (already an array of clean slugs) as the primary nudge-lookup source when the profile has any genres set.
2. **Fall back to fuzzy-matching `vault_projects.genre`** (free text) the same defensive way `lib/benchmarks/engine.ts`'s `GENRE_FACTORS` lookup already does: `(genre ?? '').trim().toLowerCase()`, with a small alias table (`'r&b'` → `rnb_soul`, `'hip-hop'`/`'rap'` → `hip_hop_rap`, etc.) since the free-text field will never contain the underscore-slug form directly.
3. If neither resolves, show no badges (not an error) — SOCIAL-02 is advisory-only per D-09, so an unmatched genre should degrade gracefully to "no nudge shown," never a broken UI.

## Per-Platform Posting Defaults (D-15)

Grounded in 2026 cross-source aggregated best-practice data (Buffer, Sprout Social, SocialPilot, Hopper HQ, PostFast — multiple independent sources agree on the broad pattern, tagged `[CITED]`/MEDIUM confidence; YouTube Shorts specifically has thinner dedicated data since most aggregators report long-form YouTube, tagged `[ASSUMED]`/LOW confidence and flagged in the Assumptions Log):

| Platform | Default day | Default time (local) | Rationale |
|---|---|---|---|
| Instagram | Wednesday | 12:00 PM | Strongest cross-source weekday-midday slot; Thu 9am also cited but Wed noon is the most consistently top-ranked |
| TikTok | Tuesday | 7:00 PM | TikTok is the platform-family exception (skews evening, not midday); Tue avoids the Fri/Sat/Sun crowding other creators optimize for, while staying inside the cited 6-10pm evening peak window |
| X (Twitter) | Wednesday | 1:00 PM | Falls inside the cited Tue-Thu 12-6pm local-time window |
| YouTube Shorts | Thursday | 6:00 PM `[ASSUMED]` | General pattern note that YouTube (like TikTok) skews afternoon/evening rather than mid-morning; no Shorts-specific dataset was found distinct from long-form YouTube — **flag for human confirmation if artist has string YouTube Shorts strategy dependence** |
| Facebook | Wednesday | 1:00 PM | Falls inside the cited 1-3pm midday window; Wed/Thu cited as strongest days |
| Threads | Thursday | 9:00 AM | Directly cited as the single highest-median-engagement slot |

**Default posting-time algorithm (D-15):** for a slot in week `N` on platform `P`, compute the 7-day window `[release_date + (N-1)*7, release_date + N*7 - 1]`, then find the occurrence of `P`'s default weekday within that window (if the window doesn't contain that weekday — it always will, since a week is 7 days — use the first occurrence), and set the time to `P`'s default time. This produces one canonical default timestamp per slot; if the AI places multiple slots for the same platform in the same week, offset subsequent same-week/same-platform slots by a reasonable amount (e.g. +2 days) rather than stacking identical timestamps, purely for calendar-UI legibility — this offsetting detail is left to planner discretion since D-15 doesn't specify same-week collision handling.

## Buffer CSV Export Format (SOCIAL-07)

Verified directly against Buffer's own bulk-upload support documentation (`[CITED: support.buffer.com]`):

- **Column headers are case-sensitive:** `Text`, `Image URL`, `Tags`, `Posting Time` (matches SOCIAL-07's spec exactly). Do not vary casing.
- **Text OR Image URL** — at least one must be non-empty per row (this project will always populate `Text`, so this is satisfied by construction).
- **Image URL:** must be a direct link ending in an image extension (`.jpg`, `.png`, etc.), publicly accessible, max 5MB. D-16's content-type gating (blank for `short-form video`/`text`/`stories`) is correct and necessary — Buffer would otherwise try to treat a non-image URL as an image attachment and fail the row.
- **Tags:** comma-separated within a single CSV cell (e.g. `"tiktok, short-form video"`), and — important caveat — **tags must already exist in the artist's Buffer account** for Buffer to attach them; unrecognized tags are effectively ignored on import. This is a real limitation to surface to the artist in the export UI copy (e.g. "Tags will only attach if they already exist in your Buffer workspace — otherwise they're safely ignored") rather than a bug to fix.
- **Posting Time:** exact format `YYYY-MM-DD HH:mm` (24-hour, no timezone suffix — Buffer applies the account's own configured timezone). Optional; a blank cell auto-schedules to the next open queue slot. Always populate it in this export (D-15 guarantees every slot has a `posting_time`), since leaving it blank would silently discard the calendar's whole scheduling value-add.
- **File format:** must be saved/served as `.csv` (not `.xls`/`.xlsx`); use UTF-8 (or UTF-16) encoding if captions contain emoji — `Content-Type: text/csv; charset=utf-8` (matching the existing `lib/metadata/export.ts` route convention) satisfies this.
- **Row limits:** 10 posts per upload on Buffer's free plan, 100 on paid plans (also capped by available queue slots in the account). **This is a real ceiling worth surfacing**: a full 4-week, 6-platform calendar with AI-decided pacing (D-06 — TikTok could be near-daily) can plausibly exceed 10 rows even for a single platform. D-18's "selectable subset" export directly mitigates this — the UI should note the free-plan 10-row cap near the export action so artists on Buffer's free tier know to export in smaller batches (e.g. per-platform or per-week) rather than dumping the whole campaign at once.
- **No video/carousel support** in bulk upload — irrelevant here since Funūn is exporting text/image references, not uploading video files.
- **No empty rows allowed** — the export function must filter out any slot the artist explicitly excluded via the D-18 subset picker before building the CSV, not emit a blank row for it.

## Reusable Codebase Assets (verified)

### `lib/tools/registry.ts` (397 lines, verified)
- `ToolProjectContext` type (title, type, genre, sub_genre, release_date, notes, trackTitles) is the exact shape already passed into every prompt builder. **Reuse this type directly** for the calendar-generation prompt's release-data block; it already matches the "title, genre, release date, story [= notes]" fields SOCIAL-03 asks for. It does **not** currently include collaborators — extend it (or pass collaborator names as a separate prompt-builder argument) for the calendar prompt specifically, since none of the existing 6 tools need collaborator data.
- `buildDropReadyPrompt`/`buildSoundBaitPrompt` both take `(profile: ArtistProfile, project: ToolProjectContext)` and return a prompt string ending in a "Respond with ONLY a JSON object..." instruction with an inline shape spec — this exact tail convention should be copied for the new slot-scoped prompts (D-12) and the calendar-generation prompt.
- `buildToolPrompt(slug, profile, project)` is a dispatcher over the fixed `ToolSlug` union (`epkfyi | soundbait | dropready | distroadvisor | royaltyaudit | spotifypitch`) — **do not add a 7th slug for calendar/slot generation** (see Anti-Patterns above); these are separate, purpose-built endpoints.

### `app/api/tools/[slug]/route.ts` (126 lines, verified)
- Confirmed generic tool-runner shape: `params.slug` → `getTool()` → fetch `vault_projects` (with `tracks(title)` embed) scoped by `user_id` → fetch `artist_profiles` → build `ToolProjectContext` → `buildToolPrompt()` → Anthropic call (`MODEL = 'claude-sonnet-4-6'`, `max_tokens: 4000`) → `extractJson()` → insert into `tool_outputs`.
- **This route is not modified.** The new calendar-generation and slot-scoped-generation endpoints are new files that copy this shape (auth check, project fetch scoped by `user_id`, Anthropic call, JSON extraction) but write to `social_campaigns` instead of `tool_outputs`.
- Demo-mode branch (`NEXT_PUBLIC_VAULT_DEMO === 'true'` → `addDemoToolOutput`) exists in this route; the new campaign routes should have an equivalent demo-mode no-op path if the project's demo mode is expected to cover Launchpad (confirm against `lib/vault/demo-store.ts` scope during planning — not confirmed in this research pass).

### `components/launchpad/ChecklistItem.tsx` / `TipPanel.tsx` / `ChecklistSection.tsx` / `LaunchpadRoom.tsx` (all verified, full contents read)
- `ChecklistItem.tsx`: checkbox uses `e.stopPropagation()` so toggling completion never opens the detail panel — this is the exact interaction D-13 asks the calendar slot checkbox to mirror.
- `LaunchpadRoom.tsx`: optimistic local state update on toggle, PATCH to the server, **rollback via re-fetch (not blind local rollback)** on failure — this "re-fetch authoritative state on PATCH failure" pattern (not just reverting to the captured prior value) should be mirrored by the new `CampaignCalendar.tsx` component for both completion toggles and inline edits, to avoid the same race-condition class WR-02 fixed in Phase 5.
- `TipPanel.tsx`: slide-in panel from the right, `Escape` key closes, backdrop click closes — reusable shell pattern for `SlotGeneratePanel.tsx` (D-10) if a slide-in panel is chosen over an inline expand (planner's UI discretion).

### `app/(artist)/launchpad/[projectId]/page.tsx` (185 lines, verified)
- Confirms the actual current room composition: `LaunchpadRoom` (checklist) rendered first, then `<div className="mt-9 space-y-9">` wrapping `PitchComposer` + a "Pitch history" heading/list — i.e., Phase 6 added its section as a second stacked block below the checklist, in the same page, not a new route/tab. **The new `CampaignCalendar` section should follow the identical stacking convention** — a third `space-y-9` block below (or interleaved with, per planner's UI-placement discretion) the pitch composer, not a separate tab/route, matching CONTEXT.md's "no strong preference — follow existing Launchpad room patterns."
- Data-fetching pattern: parallel `Promise.all([...])` for independent reads, `createServiceClient()` used specifically where RLS is `USING(false)` for direct client reads (`launchpad_checklist_items`), `createServerClient()` (user-scoped) for everything RLS-gated normally. The new campaign fetch (`social_campaigns` where `is_active`) is a normal user-scoped RLS read — add it to the existing `Promise.all` array.

### Migration numbering (verified)
`ls supabase/migrations/` confirms `032_curators_claim_token_unique.sql` is the latest migration on disk, with no migrations 033+ present. **New migration is `033_social_campaigns.sql`.**

## JSONB Schema Design — `social_campaigns.posts`

```typescript
// lib/launchpad/campaigns.ts (new file, mirrors lib/metadata/schema.ts's structure)

export type Platform = 'instagram' | 'tiktok' | 'x' | 'youtube_shorts' | 'facebook' | 'threads'
export const PLATFORM_VALUES: Platform[] = ['instagram', 'tiktok', 'x', 'youtube_shorts', 'facebook', 'threads']
export const PLATFORM_LABELS: Record<Platform, string> = {
  instagram: 'Instagram', tiktok: 'TikTok', x: 'X', youtube_shorts: 'YouTube Shorts',
  facebook: 'Facebook', threads: 'Threads',
}

export type ContentType = 'short_form_video' | 'static_image' | 'lyric_graphic' | 'text' | 'stories'
export const CONTENT_TYPE_VALUES: ContentType[] = ['short_form_video', 'static_image', 'lyric_graphic', 'text', 'stories']
export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  short_form_video: 'Short-form video', static_image: 'Static image', lyric_graphic: 'Lyric graphic',
  text: 'Text', stories: 'Stories',
}

export type SocialPost = {
  id: string                 // stable slot id, e.g. crypto.randomUUID() at generation time
  platform: Platform
  week: 1 | 2 | 3 | 4        // D-02 — fixed 4-week calendar
  content_type: ContentType  // D-07 — AI-assigned per slot
  caption: string            // draft caption/hook (D-04 label) — inline-editable (D-03)
  posting_time: string       // ISO 8601 timestamptz — auto-computed default, overridable (D-15)
  completed: boolean         // D-13
  completed_at: string | null // ISO 8601 timestamptz, set when completed flips true
  source: 'ai' | 'manual'    // provenance — was this slot's caption last written by AI gen or a hand-edit/DropReady-SoundBait accept
}

/** Read a typed posts array out of a loose social_campaigns.posts JSONB blob. */
export function readPosts(posts: unknown): SocialPost[] {
  if (!Array.isArray(posts)) return []
  return posts
    .map(r => {
      const o = (r ?? {}) as Record<string, unknown>
      const platform = PLATFORM_VALUES.includes(o.platform as Platform) ? (o.platform as Platform) : null
      const contentType = CONTENT_TYPE_VALUES.includes(o.content_type as ContentType) ? (o.content_type as ContentType) : null
      const week = [1, 2, 3, 4].includes(Number(o.week)) ? (Number(o.week) as 1 | 2 | 3 | 4) : null
      if (!platform || !contentType || !week) return null
      return {
        id: String(o.id ?? ''),
        platform,
        week,
        content_type: contentType,
        caption: String(o.caption ?? ''),
        posting_time: typeof o.posting_time === 'string' ? o.posting_time : new Date().toISOString(),
        completed: o.completed === true,
        completed_at: typeof o.completed_at === 'string' ? o.completed_at : null,
        source: o.source === 'manual' ? 'manual' : 'ai',
      }
    })
    .filter((p): p is SocialPost => p !== null && p.id !== '')
}

/** Validate + normalize a single-field slot edit from the client (allowlisted fields only). */
export function sanitizeSlotEdit(input: unknown): Partial<Pick<SocialPost, 'caption' | 'posting_time' | 'completed'>> {
  const o = (input ?? {}) as Record<string, unknown>
  const out: Partial<Pick<SocialPost, 'caption' | 'posting_time' | 'completed'>> = {}
  if (typeof o.caption === 'string') out.caption = o.caption.slice(0, 2200) // Instagram's own cap is the practical ceiling
  if (typeof o.posting_time === 'string' && !Number.isNaN(Date.parse(o.posting_time))) out.posting_time = o.posting_time
  if (typeof o.completed === 'boolean') out.completed = o.completed
  return out
}
```

**Campaign row shape (`social_campaigns` table):**
```typescript
export type SocialCampaign = {
  id: string
  project_id: string
  user_id: string
  name: string
  platforms: Platform[]   // D-01 — the artist's active-platform selection for this campaign
  is_active: boolean       // D-04
  posts: SocialPost[]      // read via readPosts()
  created_at: string
  updated_at: string
}
```

## Common Pitfalls

### Pitfall 1: Collaborators are a global roster, not project-scoped
**What goes wrong:** Assuming a `collaborators.project_id` FK exists (it doesn't) and writing a query that silently returns zero rows, or worse, joining through `split_sheet_parties`/`split_sheets.vault_project_id` and getting only the subset of collaborators who happen to have a split sheet for this specific project (likely nobody, this early in a release's lifecycle).
**Why it happens:** Wave 2's collaborator model is intentionally global ("enter once, reuse everywhere" per CLAUDE.md's Wave 2 description) — there is no per-project collaborator link at all, only the indirect split-sheet-party link.
**How to avoid:** Query `collaborators` filtered by `user_id = auth.uid()` (the artist's whole roster), pass collaborator `name` values only into the calendar prompt (no `role` field exists on `collaborators` itself — that's only captured per-split-sheet-party). Frame this in the prompt as background context for shoutout/tag ideas, not as authoritative per-track credit data.
**Warning signs:** A calendar-generation query joining `collaborators` to `vault_projects` returns unexpectedly empty for real projects with real collaborators on file.

### Pitfall 2: Calendar JSON response is much larger than any existing tool output — token budget and parsing risk
**What goes wrong:** A 4-week × up to 6-platform calendar with AI-decided pacing (D-06) can easily produce 20-40+ slot objects, each with an id, platform, week, content_type, caption, and rationale — this is meaningfully larger than any existing tool's JSON (the largest today, `DistroAdvisorOutput`, is ~6 fields). The existing `max_tokens: 4000` was already raised once specifically because 2000 truncated `DistroAdvisor`/`RoyaltyAudit` output (per the route's own inline comment) — a full calendar is likely to need more still.
**Why it happens:** Truncated JSON mid-object breaks `extractJson`'s brace-matching (`raw.lastIndexOf('}')` finds a brace that isn't actually the outermost closing brace if the response was cut off).
**How to avoid:** Budget generously for the calendar-generation call specifically (distinct from the existing tools' 4000) — err toward 6000-8000 `max_tokens` given expected slot count, and validate the parsed result's slot count against the expected range before saving; if `extractJson` returns `null` or an implausibly small array, surface a clear "regeneration needed" error rather than silently saving a partial calendar.
**Warning signs:** Calendars missing weeks/platforms, or `extractJson` returning `null` more often for the calendar endpoint than for existing single-purpose tools.

### Pitfall 3: Buffer's Posting Time format is stricter than it looks
**What goes wrong:** Emitting `new Date(p.posting_time).toISOString()` (`2026-07-15T19:00:00.000Z`) into the CSV instead of Buffer's required `YYYY-MM-DD HH:mm`. Buffer's importer does not parse ISO 8601 with a `T`/`Z` — either the row silently falls back to auto-queue-scheduling (defeating D-15's whole purpose) or the import fails outright.
**Why it happens:** `.toISOString()` is the reflexive default in JS for "format a date as a string."
**How to avoid:** Use the explicit `formatBufferPostingTime()` helper shown in Pattern 5 above — never `.toISOString()` for this specific column.
**Warning signs:** Artist reports that imported posts in Buffer all land in "next available slot" instead of their planned week/day.

### Pitfall 4: Two different "current Anthropic model" constants exist in the codebase — use the one that's actually wired up
**What goes wrong:** `lib/anthropic/index.ts` exports `MODEL = 'claude-sonnet-4-20250514'` and a shared `anthropic` client instance, but **no tool route actually imports from this file** — every existing tool route (`app/api/tools/[slug]/route.ts`, `app/api/tools/pitchplug/route.ts`, `app/api/pitches/draft/route.ts`, `app/api/vault/[projectId]/documents/generate/route.ts`, `lib/contracts/verify.ts`) independently hardcodes `const MODEL = 'claude-sonnet-4-6'` and constructs its own `new Anthropic(...)` client inline. If the new calendar/slot-generation routes import `lib/anthropic/index.ts`'s stale constant instead of matching the sibling tool routes, they'll silently use a different (and, per every other route in the codebase, apparently superseded) model string.
**Why it happens:** `lib/anthropic/index.ts` looks like the "correct" shared module to import from (it's literally named for this purpose), but it's dead/unused code relative to the actual established convention.
**How to avoid:** Match the hardcoded `const MODEL = 'claude-sonnet-4-6'` + inline `new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })` pattern used by every currently-active tool route, not `lib/anthropic/index.ts`. Flag `lib/anthropic/index.ts` as dead code for a future cleanup pass (out of scope for this phase to fix).
**Warning signs:** Grep for `MODEL =` across the repo before writing the new routes — if the new file's constant doesn't match the other 5 hits, it's wrong.

### Pitfall 5: "One active campaign per project" needs both an API-level flip AND a DB-level backstop
**What goes wrong:** Implementing D-04's invariant only in application code (unset old active row, then set new one active, as two separate statements) leaves a race-condition window under concurrent requests (e.g. a double-click on "Set active"), which this project's own code review process has already caught once for a structurally identical bearer-token-uniqueness issue (migration 032, added specifically because a sibling table's uniqueness was app-logic-only while `pitch_history.response_token` already had a DB-level `UNIQUE` constraint).
**Why it happens:** The two-statement flip is the natural way to write the API logic, and it reads correctly in the common case, but concurrent requests can interleave.
**How to avoid:** Add the partial unique index (`CREATE UNIQUE INDEX ... ON social_campaigns (project_id) WHERE is_active`) in migration 033 itself, from day one, not as an after-the-fact migration 034 the way `claim_token`'s uniqueness was retrofitted. Combine with a single transactional RPC or sequential same-request UPDATE-then-UPDATE inside one Supabase call chain for the API-level flip.
**Warning signs:** Two campaigns both showing `is_active = true` for the same project after concurrent "switch active campaign" clicks.

## Code Examples

### Slot-scoped prompt variant (D-12) — extends the existing prompt-builder shape
```typescript
// New addition to lib/tools/registry.ts, following buildDropReadyPrompt's exact tail convention
export type SlotCaptionOutput = { caption: string }

export function buildSlotCaptionPrompt(
  profile: ArtistProfile,
  project: ToolProjectContext,
  slot: { platform: string; week: number; content_type: string; existingCaption: string }
): string {
  const artist = profile.artist_name || 'this artist'
  return `You are a social media strategist writing ONE piece of release-day content for a specific calendar slot.

ARTIST
Name: ${artist}
${profile.genre ? `Genre: ${profile.genre}` : ''}

RELEASE
Title: ${project.title}
${project.genre ? `Genre: ${project.genre}` : ''}
${project.release_date ? `Release date: ${project.release_date}` : 'Release date: TBA'}
${project.notes ? `Artist notes: ${project.notes}` : ''}

SLOT
Platform: ${slot.platform}
Week: ${slot.week} of 4
Content type: ${slot.content_type}
Current draft (may be empty): ${slot.existingCaption || '(none yet)'}

Write ONE tailored caption/hook for this exact slot — platform-native, matching the content type. Do not invent facts not provided above.

Respond with ONLY a JSON object (no markdown, no preamble) matching exactly this shape:
{ "caption": "the single caption/hook for this slot" }`
}
```

### Preview-then-accept endpoint shape (D-10) — generates but does not write
```typescript
// app/api/launchpad/campaigns/[campaignId]/slots/[slotId]/generate/route.ts (new)
// Mirrors app/api/tools/[slug]/route.ts's auth + fetch + Anthropic + extractJson shape,
// but returns the preview in the response body instead of writing to the DB —
// the write only happens on a separate PATCH when the artist clicks "Use this" (D-10).
export async function POST(request: Request, { params }: { params: Promise<{ campaignId: string; slotId: string }> }) {
  // 1. auth.getUser() — same as app/api/tools/[slug]/route.ts
  // 2. load campaign scoped by user_id, find slot by slotId in posts[]
  // 3. build slot-scoped prompt (buildSlotCaptionPrompt / buildSlotHookPrompt by platform)
  // 4. Anthropic call + extractJson()
  // 5. return NextResponse.json({ data: { caption: output.caption } }) — NO db write here
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Buffer's per-post manual scheduling UI | Buffer's "Bulk Upload" CSV feature (`buffer.com/resources/introducing-bulk-upload`) | Existing Buffer feature, not new | This is exactly the feature D-18's export targets — confirms the CSV-export-only approach (no API integration) is the correct, currently-supported way to hand a multi-week calendar to Buffer |

**Deprecated/outdated:** None identified — no prior approach in this codebase is being replaced; this is net-new functionality layered on existing, current patterns.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | YouTube Shorts default posting time (Thursday 6:00 PM) is extrapolated from general "YouTube skews afternoon/evening" guidance, not Shorts-specific data | Per-Platform Posting Defaults | Low — it's only a *default*, always overridable per-slot (D-15); worst case an artist gets a slightly suboptimal default and adjusts it |
| A2 | Genre → platform nudge rationale text (the "why" column) is general music-marketing domain knowledge, not sourced from a specific citation | Genre → Platform Nudge Table Content | Low — nudges are explicitly advisory-only (D-09), not load-bearing; badge text can be refined post-launch without a schema change |
| A3 | Collaborators passed into the calendar prompt should be the artist's full global roster (not project-scoped), since no project-collaborator link exists | Pitfall 1 / Reusable Codebase Assets | Medium — if the planner instead builds a project-scoped join through `split_sheet_parties`, most projects (especially newly-created ones, before a split sheet exists) will show zero collaborators in the calendar prompt, silently degrading SOCIAL-03's "collaborators-table data" input to empty most of the time |
| A4 | Demo mode (`NEXT_PUBLIC_VAULT_DEMO`) needs an equivalent no-op path for the new campaign endpoints, matching `app/api/tools/[slug]/route.ts`'s `addDemoToolOutput` branch | Reusable Codebase Assets | Low-Medium — if omitted, demo-mode users hitting the campaign generation button get a real Supabase call (which will fail against demo data) instead of a graceful demo response; confirm `lib/vault/demo-store.ts`'s actual scope during planning |

**If this table is empty:** N/A — see rows above.

## Open Questions

1. **Where does `platforms` (SOCIAL-01's per-project platform selection) live — on `social_campaigns` or on `vault_projects`?**
   - What we know: D-01 says platform selection is "editable anytime, not locked before first generation," and D-04 allows multiple campaigns per project. If `platforms` lives only on `social_campaigns`, switching the active campaign could implicitly change "which platforms this project is on," which may not be the intended UX.
   - What's unclear: Whether platform selection is a project-level setting (persists across campaigns) or a per-campaign snapshot (each campaign remembers what platforms it was generated for).
   - Recommendation: Store `platforms TEXT[]` on `social_campaigns` (each campaign is a self-contained snapshot including which platforms it targeted — matches D-01's "adding a platform triggers scoped regeneration of just that platform's slots" language, which reads as an edit to the *current active campaign*, not a project-wide setting). This is the schema already proposed above; flagged here so the planner explicitly confirms this reading against CONTEXT.md rather than it being an implicit/undiscussed default.

2. **Does the existing `NEXT_PUBLIC_VAULT_DEMO` demo mode need to cover the Launchpad campaign feature?**
   - What we know: `app/api/tools/[slug]/route.ts` has a demo-mode branch; `lib/vault/demo-store.ts` exists but its exact scope (does it cover Launchpad checklist/pitch data too, or just Sound Vault tool outputs?) was not read in this research pass.
   - What's unclear: Whether Phase 5/6's Launchpad routes (`app/api/launchpad/[projectId]/progress/route.ts`, `app/api/curators/...`) already have demo-mode branches the planner can follow, or whether Launchpad demo support is itself an open gap from prior phases.
   - Recommendation: Planner should grep `NEXT_PUBLIC_VAULT_DEMO` usage across `app/api/launchpad/` and `app/api/curators/` during plan-writing to confirm the actual precedent before deciding whether the new campaign routes need a demo branch.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `ANTHROPIC_API_KEY` env var | Calendar + slot-scoped generation calls | Assumed ✓ (used identically by 5+ existing routes in this codebase; not independently re-verified this session — reading `.env.local` was blocked by sandbox permissions) | — | None needed — existing tools already depend on this being configured in every deployment environment |
| Supabase project (migrations 001-032 applied) | `social_campaigns` table, RLS | ✓ | — | — |
| Node.js / npm | Build tooling | ✓ | Node v24.15.0 / npm 11.12.1 (confirmed via `node --version`/`npm --version`) | — |

**Missing dependencies with no fallback:** none identified.
**Missing dependencies with fallback:** none — this phase adds no new external dependency surface.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None detected in project (`package.json` has no test runner) — confirmed identically to Phase 5 and Phase 6's research |
| Config file | None |
| Quick run command | Manual verification only |
| Full suite command | `npm run build` (TypeScript compile + implicit `next lint` proxy) |

No automated test infrastructure exists anywhere in this project. Nyquist validation for Phase 7 is manual/smoke verification against each requirement's acceptance criteria, same convention as Phases 5 and 6.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SOCIAL-01 | Platform checkboxes persist per campaign; editable anytime (D-01) | manual-smoke | In `/launchpad/{projectId}`, toggle platforms before/after generating a calendar, verify persistence and scoped regeneration | N/A — no test file |
| SOCIAL-02 | Genre nudge badges appear next to genre-recommended platforms, none pre-checked | manual-smoke | Set a project genre matching a nudge-map entry, verify badge text appears on the correct platform checkboxes; verify none are pre-checked | N/A |
| SOCIAL-03 | One-click generates a 4-week, week/platform-structured calendar from release + collaborator data | manual-smoke | Click generate on a project with release data + at least one collaborator on file, verify calendar renders all 4 weeks with slots only for selected platforms | N/A |
| SOCIAL-04 | Each slot shows caption/hook + content-type tag + week | manual-smoke | Visually inspect generated slots for all three fields present and non-empty | N/A |
| SOCIAL-05 | DropReady/SoundBait work both inline (slot) and standalone (tools view), standalone doesn't mutate slots unless saved | manual-smoke | Run standalone DropReady from tools view, verify no calendar slot changes; use "Save to calendar" picker, verify target slot updates only after explicit confirm | N/A |
| SOCIAL-06 | Checkbox completion persists per project | manual-smoke | Check off a slot, reload page, verify checked state persists; verify checkbox toggle doesn't open the edit panel (mirrors ChecklistItem's stopPropagation) | N/A |
| SOCIAL-07 | CSV export downloads with correct 4 columns, correct format, respects platform/week subset selection | manual-smoke | Export a subset (e.g. one platform, two weeks), open the CSV, verify header casing, `Posting Time` format (`YYYY-MM-DD HH:mm`), `Image URL` blank for non-image slot types, `Tags` = "platform, content type"; attempt an actual Buffer bulk-upload with the exported file if a Buffer test account is available | N/A |

### Sampling Rate
- **Per task commit:** Manual smoke-check of the specific behavior just implemented.
- **Per wave merge:** Full manual pass through the Phase Requirements → Test Map table above.
- **Phase gate:** `npm run build` green + full manual pass before `/gsd-verify-work`.

### Wave 0 Gaps
- No test framework exists — if this phase is expected to introduce one, that decision belongs to the planner/user, not implied by this research (out of scope: this research documents the existing convention, doesn't recommend adding a framework for one phase in isolation).
- No `tests/` directory or fixtures exist to extend.

*(No test-file gaps beyond "no framework exists at all," consistent with Phases 5 and 6.)*

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | All new routes reuse `createApiClient()` + `auth.getUser()` — identical to every existing `app/api/tools/*` and `app/api/launchpad/*` route; `/launchpad` is in `middleware.ts`'s protected-prefix list, but `api` paths are excluded from the middleware matcher (`matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)']`), so **every new API route must independently call `auth.getUser()`** — do not rely on middleware alone |
| V3 Session Management | yes | Unchanged — existing Supabase cookie-based session, no new session surface introduced |
| V4 Access Control | yes | `social_campaigns` scoped by `user_id` at both the RLS layer (`auth.uid() = user_id`) and defense-in-depth `.eq('user_id', user.id)` in every route query — matches `pitch_history`'s established double-check pattern; slot-level PATCH must re-verify the campaign belongs to the requesting user before mutating any slot (IDOR mitigation, same class of bug curators' claimed-row PATCH already guards against) |
| V5 Input Validation | yes | `sanitizeSlotEdit()`-style allowlist (see JSONB Schema Design) on every slot PATCH — never accept a client-supplied full `posts` array; validate `platform`/`content_type`/`week` against their `*_VALUES` arrays on every write path (calendar generation output AND manual edits) since AI-generated JSON is not inherently trustworthy input either |
| V6 Cryptography | no | No new tokens/secrets/crypto surface introduced by this phase (no claim links, no signed URLs beyond existing Supabase Storage signed-URL usage for `cover_art_url`, which is unchanged) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Slot PATCH targeting a `slotId` inside a campaign the requester doesn't own (IDOR) | Tampering / Elevation of Privilege | Load the campaign scoped by `.eq('user_id', user.id)` first; 404 if not found/not owned, before ever touching `posts[]` — never trust a bare `slotId` without first re-deriving ownership from the parent campaign row |
| Oversized/malformed AI-generated JSON silently corrupting `posts` (e.g. AI hallucinates a `platform` value outside the 6 supported, or an out-of-range `week`) | Tampering (unintentional, not adversarial, but still a data-integrity risk) | `readPosts()`'s enum validation against `PLATFORM_VALUES`/`CONTENT_TYPE_VALUES`/`week ∈ {1,2,3,4}` must run on the AI's own generation output before saving, not only on human-submitted edits — treat AI output with the same "never trust raw" posture as client input, since a hallucinated field would otherwise corrupt the calendar silently |
| CSV export used as a data-exfiltration/injection vector (e.g. a caption containing a formula-injection payload like `=HYPERLINK(...)` opened in Excel) | Tampering | `csvCell()`'s existing quote-escaping handles CSV-structure injection (commas/quotes/newlines) but not spreadsheet-formula injection; since captions are artist-authored (not third-party-submitted) this is low-severity self-harm risk only, but the CSV is explicitly for Buffer import (not necessarily opened in Excel first) — no additional mitigation required beyond the existing `csvCell()` escaping, flagged here only for completeness given the export touches user-authored free text |
| Concurrent "set campaign active" requests both succeeding, leaving 2 active campaigns (undermines D-04's invariant, which downstream completion-tracking/CSV-export/DropReady-SoundBait wiring all assume holds) | Tampering (data integrity) | Partial unique index (`WHERE is_active`) at the DB layer, per Pitfall 5 |

## Sources

### Primary (HIGH confidence — verified directly against this codebase)
- `lib/tools/registry.ts` — full file read, confirmed `ToolProjectContext`, `buildDropReadyPrompt`/`buildSoundBaitPrompt`/`buildToolPrompt` shapes
- `app/api/tools/[slug]/route.ts` — full file read, confirmed batch-call/`extractJson`/`tool_outputs`-save pattern
- `components/launchpad/LaunchpadRoom.tsx`, `ChecklistItem.tsx`, `TipPanel.tsx`, `ChecklistSection.tsx` — full files read
- `app/(artist)/launchpad/[projectId]/page.tsx` — full file read, confirmed Phase 6's stacking pattern
- `lib/metadata/export.ts`, `app/api/vault/[projectId]/metadata/export/route.ts` — full files read, confirmed CSV export precedent
- `lib/metadata/schema.ts` (readComposers/sanitizeComposers section) — read, confirmed JSONB read/sanitize convention
- `supabase/migrations/030_curators_pitch_history.sql`, `032_curators_claim_token_unique.sql`, `018_collaborators_split_sheets.sql`, `022_artist_profile_genres_array.sql` — read, confirmed RLS pattern, collaborators schema, genre column history
- `lib/genres.ts`, `lib/benchmarks/engine.ts` (GENRE_FACTORS section) — read, confirmed genre slug list + free-text-matching precedent
- `components/vault/EditProjectForm.tsx` — read, confirmed `vault_projects.genre` is free-text input, not a slug select
- `lib/anthropic/index.ts` vs. grep of `MODEL =` across 6 files — confirmed the dead-vs-active model-constant discrepancy
- `middleware.ts` — read, confirmed `/launchpad` protected prefix + `api` matcher exclusion
- `ls supabase/migrations/` — confirmed `032` is the latest migration on disk

### Secondary (MEDIUM confidence — WebSearch/WebFetch cross-checked against official source)
- [Buffer bulk upload support article](https://support.buffer.com/article/926-how-to-upload-posts-in-bulk-to-buffer) — fetched directly, confirmed exact column names, Posting Time format, Tags comma-separation, Image URL constraints, row limits
- [Best Time to Post on Social Media in 2026 — Buffer](https://buffer.com/resources/best-time-to-post-social-media/) — aggregated with Sprout Social, SocialPilot, Hopper HQ, PostFast results for per-platform posting-time defaults

### Tertiary (LOW confidence — flagged for validation)
- YouTube Shorts-specific posting-time default (extrapolated from general YouTube long-form data, no Shorts-specific dataset found) — see Assumptions Log A1
- Genre → platform nudge rationale text (general music-marketing domain knowledge) — see Assumptions Log A2

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; every pattern verified directly against existing, working code in this repo
- Architecture: HIGH — RLS pattern, JSONB read/sanitize pattern, tool-runner pattern, CSV export pattern all directly confirmed by reading the actual source files, not inferred
- Pitfalls: HIGH — every pitfall traces to a specific confirmed fact in this codebase (free-text genre field, global collaborators table, dead model constant, existing race-condition precedent from migration 032's own commit history)
- Buffer CSV format: MEDIUM — confirmed via Buffer's own support documentation (fetched directly), not merely training-data recall
- Per-platform posting defaults: MEDIUM (LOW for YouTube Shorts specifically) — cross-referenced across multiple 2026-dated aggregator sources, general best-practice guidance rather than a single authoritative spec

**Research date:** 2026-07-02
**Valid until:** 30 days for the codebase-pattern findings (stable, changes only if this codebase's own conventions change); 90 days for Buffer's CSV format (a documented product feature, low churn); 30 days for the posting-time-default guidance (social platform algorithm behavior shifts faster than codebase conventions — re-verify if this phase's planning is delayed significantly past the research date)
