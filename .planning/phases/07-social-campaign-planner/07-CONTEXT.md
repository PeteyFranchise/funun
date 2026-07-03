# Phase 7: Social Campaign Planner - Context

**Gathered:** 2026-07-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Artists select which platforms they're active on per project, get genre-based platform nudges, generate a 4-week AI content calendar from release data, edit and complete calendar slots, use DropReady/SoundBait as inline slot actions or standalone tools, and export the calendar as a Buffer-compatible CSV. Requirements: SOCIAL-01 through SOCIAL-07 (locked in ROADMAP.md / REQUIREMENTS.md — this discussion clarifies HOW, not whether).

**Explicit boundary (confirmed in discussion):** Funūn never posts to or authenticates with any social platform in this phase. The artist either posts manually themselves (then checks the slot off), or exports to Buffer, which handles actual scheduled publishing via its own separate account connections. Direct social posting (Meta/TikTok OAuth) is out of scope — deferred to Wave 4 (see `<deferred>`).

</domain>

<decisions>
## Implementation Decisions

### Calendar Generation, Campaigns & Editing
- **D-01:** Platform selection (SOCIAL-01) is editable anytime, not locked before first generation. Adding a platform after a calendar exists triggers a **scoped regeneration of just that platform's slots** — existing slots for other platforms (including manual edits) are untouched.
- **D-02:** Calendar length is **fixed at 4 weeks** — matches Phase 5's existing checklist week structure (weeks 1-4 = the Spotify algorithmic window), keeps generation a true one-click action, no length selector needed.
- **D-03:** Calendar slots are **inline-editable** — artist can click into any slot's caption/hook and hand-edit the text directly, not just via DropReady/SoundBait regeneration. AI output is a starting point.
- **D-04:** **Multiple campaigns per project are allowed** (no `UNIQUE` constraint on `project_id` in `social_campaigns`). One campaign is marked **active** via an explicit `is_active` boolean; the active campaign is what the Launchpad room displays, what completion tracking / DropReady-SoundBait wiring / CSV export all operate on. Exactly one active campaign per project is an invariant the API must enforce (flip old active off when a new one is set active).
- **D-05:** Inactive campaigns can be **hard-deleted** by the artist from a history/list view (mirrors the hard-delete convention already used for checklist items in Phase 5).
- **D-06:** Slot pacing is **AI-decided per platform**, not a fixed 1-slot-per-platform-per-week grid — the AI can put multiple posts in one week for high-frequency platforms (e.g. TikTok) and fewer for others, based on what's realistic for that platform.
- **D-07:** Content-type tag (short-form video / static image / lyric graphic / text / stories) is **assigned by the AI per slot**, not derived from a fixed platform→type mapping — gives variety (e.g. Instagram getting both a static image slot and a Stories slot across different weeks) using the release story/context the AI already has.

### Genre → Platform Nudge Table (SOCIAL-02)
- **D-08:** Nudge data lives in a **hardcoded TS map** (e.g. `lib/launchpad/platform-nudges.ts`) — genre → ranked platform list + short rationale. No DB table, no admin UI. Matches ROADMAP.md's "static lookup table (no ML)" note; this is low-churn reference data.
- **D-09:** Nudge is surfaced as **advisory badges only** in the platform selector — all 6 platforms shown as plain checkboxes, a small badge/note next to genre-recommended ones (e.g. "Best fit for Hip-Hop"). Nothing is pre-checked, since platforms are editable anytime (D-01) and pre-checking would fight later edits.

### DropReady / SoundBait ↔ Calendar Wiring (SOCIAL-05)
- **D-10:** Inline slot action ("Generate caption" / "Generate hook") uses a **preview-then-accept/discard** flow — clicking generates a preview shown alongside the current caption/hook; artist clicks "Use this" to write it into the slot (uses inline-edit, D-03) or "Discard" to keep the original. Never silently overwrites.
- **D-11:** Standalone DropReady/SoundBait runs (Launchpad tools view, not slot-scoped) get a **"Save to calendar" picker** after generation — opens a small picker (platform + week + slot), writes the result into that slot via the same preview/accept pattern as D-10. This satisfies the "standalone runs must not mutate slots unless explicitly saved" requirement. Standalone `tool_outputs` history is unaffected either way.
- **D-12:** Inline slot generation uses a **new slot-scoped prompt variant** (extends `lib/tools/registry.ts`'s `buildDropReadyPrompt`/`buildSoundBaitPrompt` pattern) that takes platform + week + content-type as additional context and returns one tailored caption/hook for that slot — not the existing multi-field standalone JSON shape (`instagram_caption`, `hooks[]`, etc.), which is designed for a one-time full-project run, not a single slot.

### Completion Tracking (SOCIAL-06)
- **D-13:** Completion is a **field directly on each slot object** inside `social_campaigns.posts` JSONB (`completed: boolean`, `completed_at: timestamptz`) — no separate progress table. Checkbox UI matches Phase 5's `ChecklistItem` pattern (checkbox independent of any preview/edit interaction, same as the checklist's checkbox-vs-panel independence).

### Launchpad Checklist Integration
- **D-14:** Social-adjacent Phase 5 checklist items (e.g. "social teasers") get their `action_href` **deep-linked to the campaign calendar section** of `/launchpad/[projectId]` after Phase 7 ships. This is an **admin data edit through the existing Phase 5 admin checklist CRUD** (`/admin/checklist`) — no schema change, no new code path, just updating existing rows post-launch.

### CSV Export & Posting Time (SOCIAL-07)
- **D-15:** Posting Time is a **hybrid**: auto-derived default (`release_date + (week-1)*7 days`, landing on a fixed day-of-week + time **per platform**, chosen by Claude during planning using general social-timing best practice — e.g. TikTok evenings, Instagram midday) is computed for every slot automatically. The artist can override any slot's date/time individually (uses the same inline-edit mechanism as D-03); export always uses whatever value is currently set on the slot (default or overridden).
- **D-16:** `Image URL` column is **content-type-aware**: populated with the project's release artwork URL only for slots tagged `static image` or `lyric graphic`; left blank for `short-form video`, `text`, and `stories` slots (those don't map to one static image asset).
- **D-17:** `Tags` column = **platform + content type** (e.g. `"tiktok, short-form video"`), derived directly from slot fields — always available on every slot regardless of whether DropReady/SoundBait ever ran on it. Not tied to AI-generated hashtags.
- **D-18:** Export supports a **selectable subset** — artist can choose which platforms/weeks to include via checkboxes before exporting, rather than always dumping the entire active campaign.

### Claude's Discretion
- Exact fixed default day-of-week + time per platform for D-15 (Claude picks during planning, grounded in general best-practice timing per platform).
- Full `social_campaigns` schema beyond what's decided above (columns for `is_active`, `posts` JSONB shape holding platform/week/content_type/caption/completed/completed_at/posting_time per slot) — planner designs the complete migration, RLS enabled immediately after `CREATE TABLE` per project-wide convention.
- Exact genre list and platform rankings in the D-08 hardcoded nudge map — derive from existing genre values used elsewhere in the codebase (`artist_profiles.genre`, `vault_projects.genre`).
- UI placement/layout of the campaign calendar section within `/launchpad/[projectId]` (new tab vs. new section) — no strong preference expressed; follow existing Launchpad room patterns from Phase 5/6.
- History/list view UI for switching/deleting inactive campaigns (D-04/D-05) — minimal list is sufficient, no strong preference expressed.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §"Phase 7: Social Campaign Planner" — goal, success criteria, new table (`social_campaigns`), AI batch-call note, CSV Buffer-only note
- `.planning/REQUIREMENTS.md` §"Social Campaign Planner" — SOCIAL-01 through SOCIAL-07 full text, requirements table (lines ~50-109)
- `.planning/PROJECT.md` §"Key Decisions" and §"What Wave 3 does NOT include" — confirms social post scheduling/OAuth is Wave 4, not this phase

### Prior-phase patterns to reuse
- `.planning/phases/05-launchpad-checklist/05-CONTEXT.md` — shared `/launchpad/[projectId]` route this phase lives inside; `ChecklistItem`/checkbox-independent-of-panel pattern to mirror for slot completion (D-13); admin CRUD pattern (`ChecklistAdmin`, `/admin/checklist`) used for the D-14 deep-link edits; hard-delete convention (D-05)
- `.planning/phases/06-playlist-curator-pitching/06-CONTEXT.md` — RLS-immediately-after-CREATE-TABLE convention; graceful no-op pattern for unconfigured integrations (not directly needed here since no new external API, but stays consistent)

### Codebase integration points
- `lib/tools/registry.ts` — existing `buildDropReadyPrompt`/`buildSoundBaitPrompt`/`buildToolPrompt` dispatch; D-12's new slot-scoped prompt variant extends this file; existing `ToolProjectContext` type shape to reuse/extend
- `app/api/tools/[slug]/route.ts` — existing generic tool-runner pattern (fetches project + profile, calls Anthropic, extracts JSON, saves to `tool_outputs`); slot-scoped generation (D-10, D-12) is a new, parallel code path, not a modification of this route
- `lib/launchpad/playbook.ts` and `components/launchpad/*` (from Phase 5) — `LaunchpadRoom`, `ChecklistSection`, `ChecklistItem`, `TipPanel` components; new calendar section joins this room
- `supabase/migrations/032_curators_claim_token_unique.sql` — most recent migration; new migration for `social_campaigns` starts at `033`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/tools/registry.ts` (`buildDropReadyPrompt`, `buildSoundBaitPrompt`) — both DropReady and SoundBait are **already fully implemented** as standalone tools (not partial, despite PROJECT.md's earlier note) with working prompts and a fixed multi-field JSON output shape (`instagram_caption`, `tiktok_caption`, `hooks[]`, `video_concepts[]`, etc.) — SOCIAL-05's "standalone quick tools" requirement is already satisfied; this phase adds the calendar-wiring layer (D-10, D-11, D-12) on top
- `app/api/tools/[slug]/route.ts` — generic tool-runner; pattern to follow (not modify) for the new slot-scoped generation endpoint
- `components/launchpad/ChecklistItem.tsx`, `TipPanel.tsx` (Phase 5) — checkbox-independent-of-detail-panel pattern maps directly onto calendar slot checkbox (D-13) + preview panel (D-10)
- `components/admin/ChecklistAdmin.tsx` (Phase 5) — reference for the D-14 admin edit flow (though no new admin UI is being built — same existing page is reused)

### Established Patterns
- Every new table gets `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` immediately after `CREATE TABLE` (CVE-2025-48757 pattern, enforced project-wide since Wave 3 research) — applies to `social_campaigns`
- Batch (non-streaming) Claude JSON-prompt pattern (`app/api/tools/[slug]/route.ts`'s `extractJson` + fenced-JSON handling) — reused for the full-calendar generation call and the new slot-scoped generation call
- User-supplied release data should be isolated in a clearly delimited block within prompts (per ROADMAP.md note: `<release_data>` block), with platform constraints hard-coded in the system/prompt text — apply this to both the calendar-generation prompt and the new slot-scoped prompt (D-12)

### Integration Points
- New calendar section hangs off `/launchpad/[projectId]`, alongside the existing Phase 5 checklist and Phase 6 pitch composer in the same room
- New `social_campaigns` table (migration `033_social_campaigns.sql` or similar) — one row per campaign, `is_active` boolean per D-04, `posts` JSONB holding the array of slot objects (fields per D-06/D-07/D-13/D-15/D-16/D-17)
- Existing checklist item rows (Phase 5 seed data) get `action_href` updated post-launch per D-14 — an admin data change, not a code integration point

</code_context>

<specifics>
## Specific Ideas

- The artist-facing framing of the "Image URL" gap (D-16) should feel intentional, not like a missing feature — content-type-aware population (blank for video/text/stories, artwork URL for static-image/lyric-graphic) reflects that a static image genuinely isn't the asset for those slot types.
- CSV export subset selection (D-18) should stay lightweight — checkboxes for platform/week, not a full filter UI.

</specifics>

<deferred>
## Deferred Ideas

- **Direct social posting / scheduling (Meta/TikTok OAuth)** — raised during discussion ("will Funūn have a direct connection to their socials for posting?"). Confirmed out of scope for Phase 7; user explicitly flagged this as a **Wave 4 candidate**. Funūn's role in this phase ends at planning, drafting, and CSV export — the artist posts manually or via Buffer.

</deferred>

---

*Phase: 7-Social Campaign Planner*
*Context gathered: 2026-07-02*
