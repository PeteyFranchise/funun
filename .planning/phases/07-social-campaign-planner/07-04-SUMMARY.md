---
phase: 07-social-campaign-planner
plan: 04
subsystem: api
tags: [nextjs, anthropic, csv-export, buffer, typescript, security]

# Dependency graph
requires:
  - phase: 07-social-campaign-planner
    plan: 01
    provides: social_campaigns table, lib/launchpad/campaigns.ts (readPosts, PLATFORM_LABELS, CONTENT_TYPE_LABELS, Platform, ContentType)
  - phase: 07-social-campaign-planner
    plan: 02
    provides: lib/tools/registry.ts (buildSlotCaptionPrompt, buildSlotHookPrompt, SlotCaptionOutput, ToolProjectContext)
  - phase: 07-social-campaign-planner
    plan: 03
    provides: slot PATCH route (the write path that receives "Use this" after this plan's preview)
provides:
  - app/api/launchpad/[projectId]/campaigns/[campaignId]/slots/[slotId]/generate/route.ts (POST, preview-only, no DB write)
  - app/api/launchpad/[projectId]/campaigns/[campaignId]/export/route.ts (GET, Buffer CSV with subset filter)
affects: [07-05, 07-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "D-10 preview-then-accept: generate route returns { data: { caption } } with zero DB writes — the write lands exclusively in 07-03's slot PATCH on the user's 'Use this' click"
    - "content_type-driven prompt dispatch: short_form_video/stories → buildSlotHookPrompt; static_image/lyric_graphic/text → buildSlotCaptionPrompt — maps to the UI-SPEC's 'Generate hook' vs 'Generate caption' label"
    - "formatBufferPostingTime() builds YYYY-MM-DD HH:mm from getFullYear/getMonth+1/getDate/getHours/getMinutes with zero-padding — never .toISOString() (Pitfall 3/D-15)"
    - "IMAGE_CONTENT_TYPES allowlist governs Image URL cell — cover_art_url for static_image/lyric_graphic; empty string for all other content types (D-16)"
    - "D-18 subset filter uses Array.filter() not row-blanking — excluded posts are absent from the CSV, not emitted as empty rows"

key-files:
  created:
    - app/api/launchpad/[projectId]/campaigns/[campaignId]/slots/[slotId]/generate/route.ts
    - app/api/launchpad/[projectId]/campaigns/[campaignId]/export/route.ts
  modified: []

key-decisions:
  - "const MODEL = 'claude-sonnet-4-6' declared inline in generate route, new Anthropic() constructed inline — no @/lib/anthropic import (RESEARCH.md Pitfall 4 — that module's model constant is stale)"
  - "No NEXT_PUBLIC_VAULT_DEMO branch in either route — confirmed no existing launchpad route has a demo branch (RESEARCH.md Open Question 2 resolved in 07-03; same precedent applies here)"
  - "generate route loads the parent campaign with .eq('user_id', user.id).eq('id', campaignId).eq('project_id', projectId) before locating the slot — slotId is never used as an independent ownership gate (T-07-12 IDOR mitigation)"
  - "max_tokens: 1000 for the generate route — single-caption output is small; no need for the 4000-8000 window used by calendar and multi-field tool routes"
  - "csvCell escaper duplicated verbatim from lib/metadata/export.ts's 3-line regex pattern (not imported) — export.ts does not re-export csvCell as a public symbol"

requirements-completed: [SOCIAL-05, SOCIAL-07]

coverage:
  - id: T1-1
    description: "POST generate route loads campaign with .eq('user_id', user.id) before slot lookup; returns 404 on unknown campaignId or slotId"
    requirement: "SOCIAL-05"
    verification:
      - kind: other
        ref: "Source assertion: .eq('user_id', user.id) on social_campaigns query at line 48; slot = posts.find(p => p.id === slotId) guarded by 404 at line 52"
        status: pass
    human_judgment: false
  - id: T1-2
    description: "Generate route routes content_type to correct prompt builder: short_form_video/stories → buildSlotHookPrompt; static_image/lyric_graphic/text → buildSlotCaptionPrompt"
    requirement: "SOCIAL-05"
    verification:
      - kind: other
        ref: "Source assertion: isHookSlot = content_type === 'short_form_video' || content_type === 'stories'; ternary dispatches correctly"
        status: pass
    human_judgment: false
  - id: T1-3
    description: "Generate route performs zero DB writes — no .update() or .insert() on social_campaigns"
    requirement: "SOCIAL-05"
    verification:
      - kind: other
        ref: "Source assertion: grep for .from('social_campaigns').update / .insert in generate/route.ts — no matches (D-10)"
        status: pass
    human_judgment: false
  - id: T1-4
    description: "Generate route returns { data: { caption: string } } on success"
    requirement: "SOCIAL-05"
    verification:
      - kind: other
        ref: "Source assertion: NextResponse.json({ data: { caption: String(caption) } }) at line 127"
        status: pass
    human_judgment: false
  - id: T2-1
    description: "Export header row is exactly 'Text,Image URL,Tags,Posting Time' (case-sensitive)"
    requirement: "SOCIAL-07"
    verification:
      - kind: other
        ref: "Source assertion: BUFFER_CSV_HEADERS = ['Text', 'Image URL', 'Tags', 'Posting Time'] at line 11; headerRow = BUFFER_CSV_HEADERS.join(',')"
        status: pass
    human_judgment: false
  - id: T2-2
    description: "Posting Time cells are YYYY-MM-DD HH:mm via formatBufferPostingTime() — no .toISOString() call for posting time (Pitfall 3)"
    requirement: "SOCIAL-07"
    verification:
      - kind: other
        ref: "Source assertion: grep for .toISOString() in export/route.ts — no matches; formatBufferPostingTime() uses getFullYear/getMonth+1/getDate/getHours/getMinutes with padStart"
        status: pass
    human_judgment: false
  - id: T2-3
    description: "Image URL = cover_art_url for static_image/lyric_graphic; blank for short_form_video/text/stories (D-16)"
    requirement: "SOCIAL-07"
    verification:
      - kind: other
        ref: "Source assertion: IMAGE_CONTENT_TYPES = ['static_image', 'lyric_graphic']; imageUrl = IMAGE_CONTENT_TYPES.includes(post.content_type) ? (project.cover_art_url ?? '') : ''"
        status: pass
    human_judgment: false
  - id: T2-4
    description: "Tags cell = 'Platform label, content type label' derived from slot fields, regardless of AI provenance (D-17)"
    requirement: "SOCIAL-07"
    verification:
      - kind: other
        ref: "Source assertion: tags = `${PLATFORM_LABELS[post.platform]}, ${CONTENT_TYPE_LABELS[post.content_type]}` with fallbacks"
        status: pass
    human_judgment: false
  - id: T2-5
    description: "D-18 subset: ?platforms and ?weeks query params filter posts before building rows; no blank rows for excluded slots"
    requirement: "SOCIAL-07"
    verification:
      - kind: other
        ref: "Source assertion: posts = posts.filter(p => selectedPlatforms.includes(p.platform)); posts = posts.filter(p => selectedWeeks.includes(p.week)); filtered array drives dataRows.map() directly"
        status: pass
    human_judgment: false
  - id: T2-6
    description: "Export response has Content-Type: text/csv; charset=utf-8 and Content-Disposition: attachment header"
    requirement: "SOCIAL-07"
    verification:
      - kind: other
        ref: "Source assertion: new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename=\"...\"' } })"
        status: pass
    human_judgment: false

duration: ~8min
completed: 2026-07-03
status: complete
---

# Phase 07 Plan 04: Slot Generate + CSV Export Routes Summary

**Slot-scoped preview generation (D-10 preview-then-accept, no DB write) and Buffer-compatible CSV export (D-15/D-16/D-17/D-18) — the two independent leaf endpoints of the campaign API surface**

## Performance

- **Duration:** ~8 min
- **Completed:** 2026-07-03T06:34:38Z
- **Tasks:** 2 (both auto)
- **Files modified:** 2 (both new)

## Accomplishments

- `app/api/launchpad/[projectId]/campaigns/[campaignId]/slots/[slotId]/generate/route.ts` implements the D-10 preview-then-accept slot generation:
  - POST handler calls `auth.getUser()` independently, scopes the campaign load by `.eq('user_id', user.id).eq('id', campaignId).eq('project_id', projectId)` (IDOR guard, T-07-12/T-07-13), then locates the slot by `id` inside `readPosts()` output
  - Dispatches to `buildSlotHookPrompt` for `short_form_video`/`stories` content types and `buildSlotCaptionPrompt` for `static_image`/`lyric_graphic`/`text` — matching the UI-SPEC "Generate hook" vs "Generate caption" label distinction (D-12)
  - `const MODEL = 'claude-sonnet-4-6'` inline, `new Anthropic()` inline, no `@/lib/anthropic` import (Pitfall 4), `max_tokens: 1000`
  - Returns `{ data: { caption: string } }` on success — zero DB writes (D-10); the write lives exclusively in 07-03's slot PATCH on the user's "Use this" click
  - 502 on null/empty `output.caption` with a human-readable message

- `app/api/launchpad/[projectId]/campaigns/[campaignId]/export/route.ts` implements the Buffer-compatible CSV export:
  - GET handler independently authenticates and scopes both the campaign and project queries by `user_id`
  - `BUFFER_CSV_HEADERS = ['Text', 'Image URL', 'Tags', 'Posting Time']` — case-sensitive, per Buffer's bulk-upload spec (SOCIAL-07)
  - `formatBufferPostingTime()` builds `YYYY-MM-DD HH:mm` from `getFullYear`/`getMonth+1`/`getDate`/`getHours`/`getMinutes` with zero-padding — never `.toISOString()` (Pitfall 3, D-15)
  - `IMAGE_CONTENT_TYPES = ['static_image', 'lyric_graphic']` controls the Image URL cell — `cover_art_url` for those types, empty string for `short_form_video`/`text`/`stories` (D-16)
  - Tags cell = `"${PLATFORM_LABELS[platform]}, ${CONTENT_TYPE_LABELS[content_type]}"` — always derived from slot fields, never from AI provenance (D-17)
  - D-18 subset: `?platforms=instagram,tiktok&weeks=1,2` filters posts via `Array.filter()` before building rows — excluded slots are absent, not emitted as blank rows (no-empty-rows rule)
  - `csvCell` escaper from lib/metadata/export.ts pattern (T-07-14); `new Response(csv, { headers: {...} })` download shape from metadata export sibling

## Task Commits

Each task was committed atomically:

1. **Task 1: Slot-scoped generation route (preview-only, no DB write)** - `5e1df5d` (feat)
2. **Task 2: Buffer CSV export route with D-18 subset filter** - `577e5ca` (feat)

## Files Created/Modified

- `app/api/launchpad/[projectId]/campaigns/[campaignId]/slots/[slotId]/generate/route.ts` — `POST` handler; `const MODEL = 'claude-sonnet-4-6'`; inline `new Anthropic()`; local `extractJson`; no DB write; returns `{ data: { caption } }`
- `app/api/launchpad/[projectId]/campaigns/[campaignId]/export/route.ts` — `GET` handler; `BUFFER_CSV_HEADERS`; `formatBufferPostingTime()`; `IMAGE_CONTENT_TYPES`; `csvCell` escaper; D-18 subset filter; `new Response(csv, ...)` download

## Decisions Made

- `const MODEL = 'claude-sonnet-4-6'` declared inline in generate route, `new Anthropic()` constructed inline — no `@/lib/anthropic` import (RESEARCH.md Pitfall 4 — that module's model constant is stale; same pattern as 07-03)
- No `NEXT_PUBLIC_VAULT_DEMO` branch in either route — no existing `app/api/launchpad/*` route has a demo branch (RESEARCH.md Open Question 2, resolved in 07-03)
- Generate route loads parent campaign with `user_id` + `campaignId` + `projectId` guard before locating the slot — `slotId` alone cannot be used to leak another user's data (T-07-12)
- `max_tokens: 1000` in generate route — single caption output is small; no need for the 4000-8000 window used by multi-field tool routes
- `csvCell` duplicated verbatim from `lib/metadata/export.ts` (3 lines) rather than imported — `csvCell` is not a public export of that module

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None. Both files type-check clean (`npx tsc --noEmit` — no output). All source assertions verified: no DB write in generate route; `const MODEL` inline; no `@/lib/anthropic` import; correct hook/caption dispatch by content_type; Buffer headers case-exact; no `.toISOString()` in export; Image URL logic by content_type; Tags always derived; D-18 filter uses `Array.filter()` not row-blanking.

## Threat Mitigations Applied

| Threat ID | Mitigation |
|-----------|------------|
| T-07-12 (IDOR) | Both routes load campaign with `.eq('user_id', user.id).eq('id', campaignId).eq('project_id', projectId)` before any posts[] access |
| T-07-13 (missing auth) | Both handlers independently call `auth.getUser()` and 401 — /api excluded from middleware |
| T-07-14 (CSV structure injection) | `csvCell` escaper handles `"`, `,`, `\n` in caption text — captions cannot break CSV row structure |
| T-07-15 (spreadsheet formula injection) | Accepted — captions are artist-authored (self-harm only); CSV targets Buffer not Excel (RESEARCH.md Security Domain) |
| T-07-16 (cover_art_url in CSV) | Accepted — Image URL is the project's own cover art, exported by the owning artist for their own Buffer account; no cross-tenant exposure |

## Known Stubs

None. Both routes are fully wired: `buildSlotCaptionPrompt`/`buildSlotHookPrompt` (07-02), `readPosts`/`PLATFORM_LABELS`/`CONTENT_TYPE_LABELS` (07-01), and `social_campaigns` table (migration 033, live) are all present. No placeholder data, no TODO comments.

## Next Phase Readiness

- Plan 05 (CampaignCalendar component) can call `POST .../generate` for slot-level "Generate caption/hook" buttons and render the `{ data: { caption } }` preview in `SlotGeneratePanel`
- Plan 06 (launchpad page) will expose the "Export to CSV" button that calls `GET .../export` with optional platform/week filters
- No blockers identified

---
*Phase: 07-social-campaign-planner*
*Completed: 2026-07-03*

## Self-Check: PASSED

Files verified present on disk:
- app/api/launchpad/[projectId]/campaigns/[campaignId]/slots/[slotId]/generate/route.ts: FOUND
- app/api/launchpad/[projectId]/campaigns/[campaignId]/export/route.ts: FOUND

Commits verified in git log:
- 5e1df5d: FOUND
- 577e5ca: FOUND
