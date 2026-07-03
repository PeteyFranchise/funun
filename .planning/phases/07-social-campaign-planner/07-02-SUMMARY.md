---
phase: 07-social-campaign-planner
plan: 02
subsystem: ai-integration
tags: [anthropic, prompt-engineering, date-math, typescript]

# Dependency graph
requires:
  - phase: 07-social-campaign-planner
    plan: 01
    provides: social_campaigns table, lib/launchpad/campaigns.ts (Platform/ContentType/SocialPost types, readPosts/sanitizeSlotEdit), lib/tools/registry.ts's existing ToolProjectContext type + buildDropReadyPrompt/buildSoundBaitPrompt tail convention
provides:
  - lib/launchpad/campaigns.ts additions -- PLATFORM_POSTING_DEFAULTS, computeDefaultPostingTime(), readCalendarPosts()
  - lib/tools/registry.ts additions -- PLATFORM_CONSTRAINTS, buildCalendarPrompt(), buildSlotCaptionPrompt(), buildSlotHookPrompt(), SlotCaptionOutput
affects: [07-03, 07-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Local-midnight date parsing (parseLocalDate helper) instead of new Date('YYYY-MM-DD') to avoid the UTC-parse/local-timezone day-shift bug when computing week windows"
    - "readCalendarPosts() enriches raw AI JSON with id/completed/source/posting_time BEFORE routing through the existing readPosts() enum/range validator, reusing the Wave-3-established untrusted-AI-output-as-untrusted-input posture"
    - "Slot-scoped prompt builders (buildSlotCaptionPrompt/buildSlotHookPrompt) copy buildDropReadyPrompt/buildSoundBaitPrompt's exact tail convention but return the narrower { caption } shape and are deliberately never registered in TOOLS/ToolSlug or dispatched through getTool()/buildToolPrompt() (D-12)"

key-files:
  created: []
  modified:
    - lib/launchpad/campaigns.ts
    - lib/tools/registry.ts

key-decisions:
  - "computeDefaultPostingTime() parses YYYY-MM-DD release dates via a manual regex-based parseLocalDate() helper rather than `new Date(releaseDate)`, because the native constructor parses date-only ISO strings as UTC midnight, which rolls back to the previous calendar day in negative-UTC-offset local timezones once .setHours(0,0,0,0) or .getDay()/.getHours() are called -- this would silently shift every slot's week window and weekday-of-week off by one in most of the US"
  - "buildSlotHookPrompt has an identical (platform, week, content_type, existingCaption) signature and { caption } output shape to buildSlotCaptionPrompt -- only the creative framing (hook vs caption) and system-role sentence differ, per the plan's instruction that 'the field stays caption; only the creative framing differs'"

patterns-established:
  - "readCalendarPosts(raw, releaseDate) is the sole entry point for turning AI calendar JSON into stored-shape SocialPost[] -- 07-03's calendar-generation route must call this rather than hand-rolling id/posting_time assignment"

requirements-completed: [SOCIAL-03, SOCIAL-05, SOCIAL-07]

coverage:
  - id: D1
    description: "PLATFORM_POSTING_DEFAULTS has all 6 platform keys with the exact weekday/hour values from RESEARCH.md's Per-Platform Posting Defaults table (Instagram Wed 12:00, TikTok Tue 19:00, X Wed 13:00, YouTube Shorts Thu 18:00, Facebook Wed 13:00, Threads Thu 09:00)"
    requirement: "SOCIAL-07"
    verification:
      - kind: other
        ref: "npx tsc --noEmit -- clean, no errors in campaigns.ts"
        status: pass
      - kind: manual_procedural
        ref: "Source-read confirmation against 07-RESEARCH.md's Per-Platform Posting Defaults table -- all 6 weekday/hour/minute values match exactly"
        status: pass
    human_judgment: false
  - id: D2
    description: "computeDefaultPostingTime('2026-07-15', 1, 'instagram') returns an ISO string whose parsed Date has getDay()===3 (Wednesday) and getHours()===12; week-2 call lands inside [release+7, release+13]; same-platform-same-week slots get offset (not identical) timestamps; a null release date does not throw"
    requirement: "SOCIAL-07"
    verification:
      - kind: unit
        ref: "manual node verification (temp compile, deleted after use) -- computeDefaultPostingTime('2026-07-15',1,'instagram') -> getDay()===3, getHours()===12; week-2 call landed inside the [start+7, start+13] window; sameWeekIndex=0 vs 1 for tiktok/week1 produced two distinct timestamps 2 days apart; computeDefaultPostingTime(null,2,'tiktok') returned a valid ISO string with no throw"
        status: pass
    human_judgment: false
  - id: D3
    description: "readCalendarPosts(rawWithBadRows, releaseDate) drops slots with platform='linkedin' or week=5, assigns a stable id + computed posting_time to every surviving slot, and sets completed=false / source='ai'"
    requirement: "SOCIAL-03"
    verification:
      - kind: unit
        ref: "manual node verification (temp compile, deleted after use) -- 3-row raw input (1 valid tiktok/week2, 1 platform='linkedin', 1 week=5) -> readCalendarPosts returned exactly 1 row with a non-empty UUID id, completed===false, source==='ai', and a valid ISO posting_time"
        status: pass
    human_judgment: false
  - id: D4
    description: "buildCalendarPrompt() isolates release + collaborator data in a <release_data> block, hard-codes the 6 platforms' constraints in non-user-controllable prompt text, and instructs the model to return { posts: [{ platform, week, content_type, caption }] } with AI-decided pacing (D-06) and AI-assigned content_type (D-07)"
    requirement: "SOCIAL-03"
    verification:
      - kind: unit
        ref: "manual node verification (temp compile, deleted after use) -- buildCalendarPrompt() output contained literal '<release_data>'/'</release_data>' and the substrings \"posts\"/\"platform\"/\"week\"/\"content_type\"/\"caption\""
        status: pass
      - kind: other
        ref: "npx tsc --noEmit -- clean, no errors in registry.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "buildSlotCaptionPrompt()/buildSlotHookPrompt() each return a single-slot prompt ending in a { caption: string } JSON instruction (not the multi-field standalone DropReadyOutput/SoundBaitOutput shape); neither function is registered as a 7th ToolSlug"
    requirement: "SOCIAL-05"
    verification:
      - kind: unit
        ref: "manual node verification (temp compile, deleted after use) -- buildSlotCaptionPrompt() output ends with '{ \"caption\": \"the single caption for this slot\" }' and contains no 'instagram_caption'/'hooks' substrings; buildSlotHookPrompt() ends with the analogous '{ \"caption\": \"the single hook for this slot\" }'"
        status: pass
      - kind: other
        ref: "node -e TOOLS-array-entry-count check -- 6 entries (unchanged); grep confirms getTool()/buildToolPrompt() switch statement untouched aside from a new explanatory comment"
        status: pass
    human_judgment: false
  - id: D6
    description: "Neither modified file introduces the dead claude-sonnet-4-20250514 model constant or an @/lib/anthropic import"
    requirement: "SOCIAL-03"
    verification:
      - kind: other
        ref: "grep -n 'claude-sonnet-4-20250514|@/lib/anthropic' lib/tools/registry.ts -- no matches"
        status: pass
    human_judgment: false

duration: ~10min
completed: 2026-07-03
status: complete
---

# Phase 07 Plan 02: AI Prompt Builders + Posting-Time Logic Summary

**buildCalendarPrompt/buildSlotCaptionPrompt/buildSlotHookPrompt (lib/tools/registry.ts) plus PLATFORM_POSTING_DEFAULTS/computeDefaultPostingTime/readCalendarPosts (lib/launchpad/campaigns.ts) — the pure prompt-building and default-scheduling logic wave-3 routes will call directly, kept out of the ToolSlug dispatcher**

## Performance

- **Duration:** ~10 min
- **Completed:** 2026-07-03T05:55:52Z
- **Tasks:** 2 (both auto, Task 1 tdd="true" behavior-verified via a temporary out-of-tree compile)
- **Files modified:** 2 (both pre-existing, extended only)

## Accomplishments
- `lib/launchpad/campaigns.ts` now exports `PLATFORM_POSTING_DEFAULTS` (the D-15 weekday/hour table for all 6 platforms), `computeDefaultPostingTime()` (week-window-aware default scheduling with same-week-same-platform offsetting), and `readCalendarPosts()` (turns raw AI calendar JSON into id-stamped, scheduled, validated `SocialPost[]` by routing enriched rows through the existing `readPosts()` enum/range filter)
- `lib/tools/registry.ts` now exports `PLATFORM_CONSTRAINTS` (the 6-platform character/content-type limit text block), `buildCalendarPrompt()` (isolates release + collaborator data in a `<release_data>` block, hard-codes platform rules outside user control, asks for AI-decided pacing and content-type assignment), and `buildSlotCaptionPrompt()`/`buildSlotHookPrompt()` (single-slot prompts returning the narrow `{ caption }` shape) — none of the three are wired into the `TOOLS` array or `getTool()`/`buildToolPrompt()` dispatcher, per D-12

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend lib/launchpad/campaigns.ts with posting-time defaults + readCalendarPosts** - `75eb8f6` (feat)
2. **Task 2: Extend lib/tools/registry.ts with calendar + slot-scoped prompt builders** - `59f1904` (feat)

**Plan metadata:** (pending — final docs commit follows this SUMMARY)

## Files Created/Modified
- `lib/launchpad/campaigns.ts` - added `PLATFORM_POSTING_DEFAULTS`, `parseLocalDate()` (internal), `computeDefaultPostingTime()`, `readCalendarPosts()`; added `import { randomUUID } from 'crypto'`
- `lib/tools/registry.ts` - added `PLATFORM_CONSTRAINTS`, `buildCalendarPrompt()`, `SlotCaptionOutput`, `buildSlotCaptionPrompt()`, `buildSlotHookPrompt()` (inserted before the existing `buildToolPrompt()` dispatcher, which is unmodified)

## Decisions Made
- `computeDefaultPostingTime()` parses `YYYY-MM-DD` release dates through a manual regex-based `parseLocalDate()` helper instead of `new Date(releaseDate)`, because the native constructor parses date-only ISO strings as UTC midnight — in a negative-UTC-offset local timezone (e.g. US timezones), converting that to local time and then normalizing hours can silently roll the date back one day, shifting the entire week window and target weekday off by one
- `buildSlotHookPrompt` shares `buildSlotCaptionPrompt`'s exact `(profile, project, slot)` signature and `{ caption }` output shape — only the system-role framing sentence and creative instruction differ (hook vs caption), per the plan's explicit note that "the field stays `caption`; only the creative framing differs"

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Behavior assertions from both tasks' acceptance criteria (weekday/time correctness, week-window bounds, same-week offset distinctness, null-release-date no-throw, bad-row dropping, id/completed/source stamping, `<release_data>` isolation, JSON shape strings, `{ caption }` single-field shape, absence of the dead model constant) were manually verified via temporary out-of-tree TypeScript compiles + Node execution (no test framework exists in this project per CLAUDE.md). All temp artifacts were removed after verification.

## User Setup Required

None. This plan writes only pure TypeScript functions (prompt builders and date-math helpers) — no migrations, no environment variables, no Anthropic client construction (that lands in 07-03/07-04's routes).

## Next Phase Readiness
- `buildCalendarPrompt`, `buildSlotCaptionPrompt`, `buildSlotHookPrompt`, and `readCalendarPosts`/`computeDefaultPostingTime` are ready for Plan 03 (campaign CRUD + calendar-generation route) and Plan 04 (slot-scoped generation route + CSV export), which must call these functions directly rather than duplicating prompt text or date math
- No blockers identified

---
*Phase: 07-social-campaign-planner*
*Completed: 2026-07-03*

## Self-Check: PASSED

All modified files verified present on disk (lib/launchpad/campaigns.ts, lib/tools/registry.ts, this SUMMARY.md). Both task commits (75eb8f6, 59f1904) verified present in git log.
