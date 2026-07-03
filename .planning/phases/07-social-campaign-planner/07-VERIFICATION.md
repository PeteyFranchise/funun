---
phase: 07-social-campaign-planner
verified: 2026-07-03T14:00:00Z
status: human_needed
score: 5/5 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 4/5
  gaps_closed:
    - "CampaignCalendar.handleGenerate() now parses (json.data as SocialCampaign) — matches POST route's { data: <campaignRow> } shape"
    - "CampaignCalendar.refetchCampaign() now parses (json.data as SocialCampaign[]) — matches GET route's { data: <row[]> } shape"
    - "SlotGeneratePanel imported and mounted inside CampaignCalendar; handleOpenGenerate() local branch no longer a dead placeholder — sets generatePost state which opens the panel"
    - "SaveToCalendarPicker imported and mounted in ToolsPanel; client-side active campaign fetch wired; 'Save to calendar' button rendered on DropReady/SoundBait outputs; onSave PATCHes slot caption without touching tool_outputs (D-11)"
    - "Placeholder comment '07-06 will remove this branch and wire the panel' removed from CampaignCalendar"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Confirm that clicking 'Generate caption' or 'Generate hook' on a calendar slot opens the SlotGeneratePanel slide-in with a real AI-generated suggestion"
    expected: "Panel slides in from the right, shows 'Generating...' text, then shows the current caption alongside an AI suggestion. 'Use this' writes to the slot via the slot PATCH route. 'Discard' closes without writing."
    why_human: "Visual panel behavior and AI response content cannot be verified by code reading alone; requires a running Supabase instance with migration 033 applied and a real Anthropic API key"
  - test: "Confirm that after clicking 'Generate calendar', calendar slots appear immediately in the UI without requiring a page reload"
    expected: "Calendar slots appear in week sections directly after the POST response completes; no manual refresh needed"
    why_human: "Requires a live running app with real Anthropic API key and applied DB migration"
  - test: "Confirm that a DropReady or SoundBait standalone tool run surfaces a 'Save to calendar' action, and clicking it opens SaveToCalendarPicker"
    expected: "After a DropReady run, artist can click 'Save to calendar', a centered modal opens with Platform/Week/Slot selects, and confirming writes the caption to the chosen slot via PATCH — without recording anything to tool_outputs"
    why_human: "Requires a live running app with an active campaign containing slots"
  - test: "Confirm Buffer CSV export downloads a valid CSV with the correct four columns (Text, Image URL, Tags, Posting Time) and that Posting Time is formatted as YYYY-MM-DD HH:mm (not ISO 8601)"
    expected: "Downloaded file opens in a spreadsheet with four columns; Text contains slot captions; Posting Time values look like '2026-07-15 12:00'"
    why_human: "Requires a live running app, an active campaign with completed generation, and opening the CSV in a spreadsheet"
---

# Phase 07: Social Campaign Planner Verification Report

**Phase Goal:** Artists generate and work a 4-6 week social content calendar tailored to their release and the platforms they are active on, take inline content-generation actions, track which posts went live, and export the plan to their scheduler.
**Verified:** 2026-07-03T14:00:00Z
**Status:** human_needed
**Re-verification:** Yes — after gap closure (commit c45628d)

## Gap Closure Summary

Two blockers identified in the initial verification were closed in commit c45628d (`fix(07): close verification gaps — wire generate panels + fix campaign response parsing`). Both are confirmed resolved by code reading.

**Blocker 2 (SOCIAL-03) — calendar response parsing: CLOSED**

- `handleGenerate()` line 85: was `json.data?.campaign ?? json.campaign ?? null`; now `(json.data as SocialCampaign) ?? null`. Matches POST route's `return NextResponse.json({ data: newCampaign }, { status: 201 })`.
- `refetchCampaign()` line 104: was `json.data?.campaigns`; now `(json.data as SocialCampaign[]) ?? []`. Matches GET route's `return NextResponse.json({ data: sanitized })` where `sanitized` is the array.
- Placeholder comment "Local placeholder — 07-06 will remove this branch and wire the panel" removed.

**Blocker 1 (SOCIAL-05) — orphaned SlotGeneratePanel and SaveToCalendarPicker: CLOSED**

- `CampaignCalendar.tsx` line 6: `import { SlotGeneratePanel } from './SlotGeneratePanel'` is present.
- `generatePost` state (line 58) drives the panel; `handleOpenGenerate()` (line 60-66) sets it when no parent override prop is supplied. The "local placeholder" comment branch is gone; the else branch now simply calls `setGeneratePost(post)`.
- `<SlotGeneratePanel>` mounted at lines 421-429: `slot={generatePost}`, `onClose={() => setGeneratePost(null)}`, `onAccept={onEditCaption}`, `campaignId={campaign.id}`. The `onAccept` callback writes via the existing `onEditCaption` PATCH flow — no separate write path.
- `ToolsPanel.tsx` line 15: `import { SaveToCalendarPicker } from '@/components/launchpad/SaveToCalendarPicker'` is present.
- `ToolsPanel` fetches the active campaign client-side in a `useEffect` (lines 267-284): `GET /api/launchpad/${projectId}/campaigns`, parses `(json.data as SocialCampaign[])`, sets `activeCampaign` to the first `is_active` entry.
- `saveToSlot()` (lines 288-298) PATCHes `slots/${slotId}` with `{ caption }` — no write to `tool_outputs` (D-11 satisfied; comment on line 287 confirms intent).
- `canSaveToCalendar` (line 300): only `true` when `activeCampaign && activeCampaign.posts.length > 0`.
- "Save to calendar" button rendered at lines 380-387 only when `canSaveToCalendar && saveCaption`. `saveCaption` uses `saveableCaption()` (lines 62-66): returns `instagram_caption` for DropReady, `hooks[0]` for SoundBait, `null` for all other tool types.
- `<SaveToCalendarPicker>` mounted at lines 414-420: `open={pickerCaption !== null}`, `onSave={saveToSlot}`.

No regressions observed in the three other previously-verified truths (SOCIAL-01, SOCIAL-04, SOCIAL-06/07).

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Artist selects which platforms they are active on per project and sees best-practice nudges toward highest-impact platform combinations for their genre | VERIFIED | PlatformSelector.tsx renders all 6 platforms from PLATFORM_VALUES with checkboxes, nothing pre-checked; getPlatformNudges() from lib/launchpad/platform-nudges.ts drives "Best fit for {Genre}" badges; GENRE_PLATFORM_NUDGES has all 20 genre slugs; page.tsx passes profileGenres and projectGenre |
| 2 | Artist generates a 4-6 week content calendar with one action; AI receives release metadata and collaborators-table data, and returns a calendar structured by week and platform | VERIFIED | API route POST correct; client now parses (json.data as SocialCampaign) at line 85 — matches route's { data: newCampaign } return shape. refetchCampaign() parses (json.data as SocialCampaign[]) at line 104 — matches GET route's { data: sanitized } return shape. Data flow is now complete end-to-end. |
| 3 | Each calendar slot shows a draft caption or hook, a content-type tag, and its suggested week | VERIFIED | CampaignSlot.tsx renders platform chip (PLATFORM_LABELS), content-type chip (CONTENT_TYPE_LABELS), caption text, week context, posting-time meta line; readPosts() validates and coerces slot shape; CampaignCalendar groups by WEEK_NUMBERS [1,2,3,4] |
| 4 | DropReady and SoundBait are usable both as inline calendar-slot actions and as standalone quick tools, with standalone runs not mutating calendar slots unless explicitly saved | VERIFIED | Inline: SlotGeneratePanel now imported and mounted in CampaignCalendar; handleOpenGenerate sets generatePost state which opens the panel; onAccept writes via onEditCaption PATCH. Standalone: SaveToCalendarPicker imported and mounted in ToolsPanel; "Save to calendar" button only on DropReady/SoundBait outputs (saveableCaption returns null for other tools); saveToSlot PATCHes caption only, never touches tool_outputs. |
| 5 | Artist can check off calendar posts as they go live and export the calendar as a Buffer-compatible CSV | VERIFIED | Completion checkbox in CampaignSlot calls onToggleComplete which PATCHes the slot with {completed: true/false}; slot PATCH route sets completed_at server-side. Export route produces CSV with BUFFER_CSV_HEADERS = ['Text','Image URL','Tags','Posting Time']; formatBufferPostingTime formats as YYYY-MM-DD HH:mm; subset filter works via query params. Export anchor in CampaignCalendar wires to buildExportUrl(). |

**Score:** 5/5 truths verified (0 behavior-unverified)

### Deferred Items

None.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/033_social_campaigns.sql` | Table with RLS, partial unique index, trigger | VERIFIED | ENABLE ROW LEVEL SECURITY, CREATE UNIQUE INDEX ... WHERE is_active, EXECUTE FUNCTION update_updated_at(); all columns present |
| `lib/launchpad/campaigns.ts` | Types, readPosts, sanitizeSlotEdit, posting defaults, readCalendarPosts | VERIFIED | All exports present; PLATFORM_VALUES 6 entries, CONTENT_TYPE_VALUES 5 entries; readPosts filters invalid platform/content_type/week; sanitizeSlotEdit allowlists only caption/posting_time/completed |
| `lib/launchpad/platform-nudges.ts` | GENRE_PLATFORM_NUDGES, aliases, getPlatformNudges | VERIFIED | 20 genre slugs, GENRE_ALIASES, resolveNudge() shared internal helper, empty list on no match |
| `lib/tools/registry.ts` (extensions) | buildCalendarPrompt, buildSlotCaptionPrompt, buildSlotHookPrompt, PLATFORM_CONSTRAINTS, SlotCaptionOutput | VERIFIED | All exports present (confirmed in initial verification; no regressions in commit c45628d which did not touch registry.ts) |
| `app/api/launchpad/[projectId]/campaigns/route.ts` | POST generate, GET list, PATCH set-active, DELETE | VERIFIED | All 4 handlers present; MODEL = 'claude-sonnet-4-6'; auth.getUser() per handler; user_id scoping; D-04 flip-before-insert; D-05 active-cannot-be-deleted; returns { data: newCampaign } (POST) and { data: sanitized } (GET) |
| `app/api/launchpad/[projectId]/campaigns/[campaignId]/slots/[slotId]/route.ts` | PATCH single slot | VERIFIED | IDOR guard (loads campaign by user_id first); sanitizeSlotEdit applied; completed_at set server-side; source='manual' on caption edit; never accepts client-supplied posts[] array |
| `app/api/launchpad/[projectId]/campaigns/[campaignId]/slots/[slotId]/generate/route.ts` | POST slot generation, preview-only | VERIFIED | No DB writes; loads parent campaign with user_id guard first; content_type drives prompt builder choice; returns { data: { caption } } |
| `app/api/launchpad/[projectId]/campaigns/[campaignId]/export/route.ts` | GET Buffer CSV | VERIFIED | BUFFER_CSV_HEADERS correct; formatBufferPostingTime produces YYYY-MM-DD HH:mm; IMAGE_CONTENT_TYPES allowlist; subset filter via query params; csvCell escaper |
| `components/launchpad/PlatformSelector.tsx` | 6-platform multi-select with genre nudge badges | VERIFIED | PLATFORM_VALUES.map(); nothing pre-checked; getPlatformNudges drives isNudged; genreLabel resolved; Generate calendar CTA wired |
| `components/launchpad/CampaignCalendar.tsx` | Week-grouped container, optimistic PATCH, export sub-block, SlotGeneratePanel mount | VERIFIED | Week grouping, optimistic PATCH, and export sub-block correctly implemented; handleGenerate parses (json.data as SocialCampaign); refetchCampaign parses (json.data as SocialCampaign[]); SlotGeneratePanel imported and mounted at lines 421-429 |
| `components/launchpad/CampaignSlot.tsx` | Slot card: chips, checkbox, inline-edit, posting-time, generate button | VERIFIED | Platform/content-type chips; completion checkbox with stopPropagation; inline caption textarea with blur-save; posting-time datetime-local; "Generate hook"/"Generate caption" button present and now wired to a mounted panel |
| `components/launchpad/SlotGeneratePanel.tsx` | D-10 preview-then-accept panel | VERIFIED | Imported in CampaignCalendar line 6; mounted at lines 421-429; slot prop driven by generatePost state; onAccept={onEditCaption}; no DB writes in panel itself (preview-only, write only on "Use this" click) |
| `components/launchpad/SaveToCalendarPicker.tsx` | D-11 standalone output save modal | VERIFIED | Imported in ToolsPanel line 15; mounted at lines 414-420; open={pickerCaption !== null}; onSave={saveToSlot}; never writes to tool_outputs; canSaveToCalendar guard prevents rendering when no active campaign |
| `components/launchpad/CampaignHistoryList.tsx` | Campaign history with switch-active and delete | VERIFIED | Active badge with no delete trigger; Set active PATCH; inline confirm delete; no window.confirm; imported and used in page.tsx |
| `app/(artist)/launchpad/[projectId]/page.tsx` | Campaign server fetch + CampaignCalendar + CampaignHistoryList stacked block | VERIFIED | CampaignCalendar and CampaignHistoryList mounted in the mt-9 space-y-9 block; active campaign server fetch present; readPosts applied; passed as initialCampaign; profileGenres and projectGenre passed for nudge badges |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| CampaignCalendar | POST /api/launchpad/[projectId]/campaigns | fetch in handleGenerate | WIRED | Fetch call correct; response parsed as (json.data as SocialCampaign) — matches route shape |
| CampaignCalendar | GET /api/launchpad/[projectId]/campaigns | fetch in refetchCampaign | WIRED | Fetch call correct; response parsed as (json.data as SocialCampaign[]) — matches route shape |
| CampaignSlot → CampaignCalendar → SlotGeneratePanel | POST slots/[slotId]/generate | handleOpenGenerate sets generatePost; panel fetches generate route on open | WIRED | handleOpenGenerate() calls setGeneratePost(post) when no parent override; SlotGeneratePanel mounts with slot={generatePost}; on open it POSTs to generate route; onAccept calls onEditCaption (PATCH) |
| ToolsPanel (DropReady/SoundBait outputs) | SaveToCalendarPicker | "Save to calendar" button sets pickerCaption; picker onSave calls saveToSlot | WIRED | saveableCaption() extracts instagram_caption or hooks[0]; button renders only when canSaveToCalendar && saveCaption; SaveToCalendarPicker mounted; saveToSlot PATCHes slot caption |
| ToolsPanel | GET /api/launchpad/[projectId]/campaigns | useEffect fetch on mount | WIRED | Active campaign loaded client-side; used to populate SaveToCalendarPicker posts and derive canSaveToCalendar |
| SaveToCalendarPicker.onSave | PATCH /api/launchpad/[projectId]/campaigns/[campaignId]/slots/[slotId] | saveToSlot() in ToolsPanel | WIRED | saveToSlot PATCHes { caption } to the slot endpoint; never touches tool_outputs |
| CampaignCalendar | export route | anchor href={buildExportUrl()} | WIRED | Export link correctly built and wired; unchanged from initial verification |
| page.tsx | CampaignCalendar | initialCampaign prop from server fetch | WIRED | Active campaign fetched server-side via createServerClient, readPosts applied, passed as initialCampaign |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|-------------------|--------|
| CampaignCalendar | campaign state (after generation) | POST response (json.data as SocialCampaign) | Yes — matches { data: newCampaign } route return | FLOWING |
| CampaignCalendar | campaign state (after re-fetch) | GET response (json.data as SocialCampaign[]) | Yes — matches { data: sanitized } route return | FLOWING |
| CampaignCalendar | initialCampaign prop | Server-side supabase query via page.tsx | Yes | FLOWING |
| ToolsPanel | activeCampaign | GET /api/launchpad/[projectId]/campaigns, parses json.data | Yes — same route shape as refetchCampaign | FLOWING |
| export route | posts | readPosts(campaign.posts) | Yes (DB-backed) | FLOWING |

### Behavioral Spot-Checks

Step 7b skipped: no test framework in this project (per CLAUDE.md: "No test framework in dependencies"). Behavioral verification routes to human verification items above.

### Probe Execution

No probes declared in PLAN files for this phase. Step 7c: no probes to run.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| SOCIAL-01 | 07-01, 07-03, 07-05 | Platform selection per project (6 platforms) | SATISFIED | PlatformSelector renders all 6 from PLATFORM_VALUES; social_campaigns.platforms[] stores selection; page passes profileGenres/projectGenre |
| SOCIAL-02 | 07-01, 07-05 | Genre nudge badges toward highest-impact platforms | SATISFIED | GENRE_PLATFORM_NUDGES (20 slugs), GENRE_ALIASES, getPlatformNudges() imported by PlatformSelector; "Best fit for {Genre}" badges render |
| SOCIAL-03 | 07-02, 07-03, 07-06 | AI generates 4-6 week calendar from release + collaborators data | SATISFIED | API route calls buildCalendarPrompt with collaboratorNames; readCalendarPosts validates AI output; client now correctly parses { data: <row> } and { data: <row[]> } response shapes; calendar updates immediately after generation |
| SOCIAL-04 | 07-01, 07-02, 07-05 | Each slot: caption/hook + content-type tag + suggested week | SATISFIED | CampaignSlot renders platform chip, content-type chip, caption, week label, posting-time; readPosts validates structure |
| SOCIAL-05 | 07-02, 07-04, 07-06 | DropReady and SoundBait as inline slot actions AND standalone tools, no silent mutation | SATISFIED | Inline: "Generate caption"/"Generate hook" button opens SlotGeneratePanel (now mounted in CampaignCalendar); preview-then-accept, write only on "Use this". Standalone-to-slot: SaveToCalendarPicker now imported and mounted in ToolsPanel; "Save to calendar" button appears on DropReady/SoundBait output cards; saveToSlot PATCHes only the caption, never tool_outputs (D-11) |
| SOCIAL-06 | 07-01, 07-03, 07-05 | Completion tracking per post | SATISFIED | Checkbox in CampaignSlot with stopPropagation; PATCH route sets completed_at server-side; sanitizeSlotEdit allows completed; optimistic update in CampaignCalendar |
| SOCIAL-07 | 07-02, 07-04, 07-05 | Buffer-compatible CSV export (Text, Image URL, Tags, Posting Time) | SATISFIED | Export route produces BUFFER_CSV_HEADERS; formatBufferPostingTime outputs YYYY-MM-DD HH:mm; IMAGE_CONTENT_TYPES allowlist; subset filter; export link wired in CampaignCalendar |

### Anti-Patterns Found

No TBD/FIXME/XXX markers found in any phase-7 files after gap closure.
No placeholder comments remaining in CampaignCalendar.tsx.
No console.log statements.
No unreferenced debt markers.

### Human Verification Required

The following require a running app with migration 033 applied and real Anthropic API access:

**1. Inline slot generation**

**Test:** Click "Generate caption" on a calendar slot in an active campaign
**Expected:** SlotGeneratePanel slides in from the right, shows "Generating..." then the current caption alongside an AI-suggested caption; "Use this" writes the suggestion to the slot via the slot PATCH route; "Discard" closes without writing
**Why human:** Visual panel behavior; AI response content; requires live Supabase with migration 033 and real Anthropic API key

**2. Calendar update after generation**

**Test:** Click "Generate calendar" with at least one platform selected
**Expected:** Within seconds (after AI call completes), the week-grouped slots appear in the UI without a page reload
**Why human:** Requires a live running app with real API key and DB migration applied

**3. Standalone tool to slot save**

**Test:** Run DropReady from the tool side panel for a project that has an active campaign with slots; click the "Save to calendar" action on the DropReady output card
**Expected:** Centered modal opens with Platform/Week/Slot selects; confirming writes the caption to the chosen slot without recording anything to tool_outputs
**Why human:** Multi-component interaction requiring a live app with an active campaign; D-11 no-mutation guarantee is verified by code reading but the end-to-end flow needs a running instance to confirm

**4. Buffer CSV export format**

**Test:** Click "Export CSV" after campaign generation; open the downloaded file in a spreadsheet
**Expected:** Four columns (Text, Image URL, Tags, Posting Time); Posting Time values formatted as YYYY-MM-DD HH:mm; Image URL populated for static_image/lyric_graphic slots; Tags follow "Platform, Content type" pattern
**Why human:** File download and spreadsheet inspection cannot be verified by code reading alone

---

## Gaps Summary

No gaps remain. Both blockers from the initial verification are resolved in commit c45628d. All 5 observable truths are VERIFIED, all 7 requirement IDs (SOCIAL-01 through SOCIAL-07) are SATISFIED.

Status is `human_needed` (not `passed`) because 4 items require a running app to confirm end-to-end behavior — this is unchanged from the initial verification's human-verification section, which was always present. The code path exists and is correctly wired; live confirmation of the AI-generated content, the slide-in panel animation, and the CSV file download format requires a running instance.

---

_Verified: 2026-07-03T14:00:00Z_
_Verifier: Claude (gsd-verifier) — re-verification after commit c45628d_
