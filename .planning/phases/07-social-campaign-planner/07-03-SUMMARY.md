---
phase: 07-social-campaign-planner
plan: 03
subsystem: api
tags: [nextjs, anthropic, supabase, security, jsonb, typescript]

# Dependency graph
requires:
  - phase: 07-social-campaign-planner
    plan: 01
    provides: social_campaigns table (migration 033), lib/launchpad/campaigns.ts (readPosts/sanitizeSlotEdit/readCalendarPosts/PLATFORM_VALUES/SocialCampaign)
  - phase: 07-social-campaign-planner
    plan: 02
    provides: lib/tools/registry.ts (buildCalendarPrompt/ToolProjectContext), lib/launchpad/campaigns.ts (readCalendarPosts)
provides:
  - app/api/launchpad/[projectId]/campaigns/route.ts (POST generate, GET list, PATCH set-active, DELETE inactive)
  - app/api/launchpad/[projectId]/campaigns/[campaignId]/slots/[slotId]/route.ts (PATCH single slot)
affects: [07-05, 07-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "flip-old-active-off UPDATE before new-active INSERT — same-request two-step keeps partial unique index from seeing two active rows simultaneously (D-04)"
    - "D-01 scoped regeneration: POST body with campaignId+regeneratePlatform retains other platforms' readPosts()-filtered slots and merges only newly generated platform slots"
    - "IDOR mitigation: load parent campaign with .eq('user_id', user.id).eq('id', campaignId) FIRST — ownership re-derived from parent row before any posts[] access (T-07-07)"
    - "sanitizeSlotEdit() allowlist applied to located slot; full posts array re-saved; raw client posts array never written (T-07-08)"
    - "completed_at set/cleared server-side on completed boolean flip; source='manual' on caption edit (D-03, D-13)"

key-files:
  created:
    - app/api/launchpad/[projectId]/campaigns/route.ts
    - app/api/launchpad/[projectId]/campaigns/[campaignId]/slots/[slotId]/route.ts
  modified: []

key-decisions:
  - "const MODEL = 'claude-sonnet-4-6' declared inline, new Anthropic() constructed inline — no @/lib/anthropic import (RESEARCH.md Pitfall 4 — avoids stale model constant)"
  - "No NEXT_PUBLIC_VAULT_DEMO branch in either route — confirmed no existing launchpad route has one (RESEARCH.md Open Question 2 resolved; tools-route precedent does not apply to launchpad routes)"
  - "Collaborators fetched as global roster by .eq('user_id', user.id) selecting name only — no project join (RESEARCH.md Pitfall 1; collaborators table has no project_id FK)"
  - "Scoped D-01 regeneration implemented in POST body variant: campaignId + regeneratePlatform keeps retained posts from readPosts() (pre-validated), merges newly generated platform slots from readCalendarPosts()"
  - "DELETE reads body.campaignId (not a query param) to match the existing launchpad PATCH body convention"

requirements-completed: [SOCIAL-01, SOCIAL-03, SOCIAL-06]

coverage:
  - id: D1
    description: "POST /campaigns generates 4-week calendar via buildCalendarPrompt + claude-sonnet-4-6 batch call, validates with readCalendarPosts(), flips prior active campaign off before insert, inserts with is_active=true (D-04, SOCIAL-03)"
    requirement: "SOCIAL-03"
    verification:
      - kind: automated
        ref: "npx tsc --noEmit — clean, no errors in campaigns/route.ts"
        status: pass
      - kind: other
        ref: "Source assertion: const MODEL = 'claude-sonnet-4-6', new Anthropic() inline, no @/lib/anthropic import, no NEXT_PUBLIC_VAULT_DEMO, 4x auth.getUser() (one per handler)"
        status: pass
    human_judgment: false
  - id: D2
    description: "GET /campaigns returns caller's campaigns for the project ordered by is_active desc, created_at desc; each campaign's posts run through readPosts() (SOCIAL-01)"
    requirement: "SOCIAL-01"
    verification:
      - kind: automated
        ref: "npx tsc --noEmit — clean"
        status: pass
    human_judgment: false
  - id: D3
    description: "PATCH /campaigns (set active) verifies ownership, flips all project campaigns inactive, sets target active — sequential within one request (D-04)"
    requirement: "SOCIAL-01"
    verification:
      - kind: other
        ref: "Source assertion: ownership check (.eq('user_id', user.id).maybeSingle() + 404) before any mutation; two sequential UPDATE calls"
        status: pass
    human_judgment: false
  - id: D4
    description: "DELETE /campaigns returns 409 (not a delete) when target campaign is_active=true; deletes only inactive campaigns (D-05)"
    requirement: "SOCIAL-01"
    verification:
      - kind: other
        ref: "Source assertion: campaign.is_active check returns NextResponse.json({error:...},{status:409}) before .delete()"
        status: pass
    human_judgment: false
  - id: D5
    description: "PATCH /slots/[slotId] loads parent campaign scoped by user_id+campaignId FIRST, locates slot by id, applies sanitizeSlotEdit() output only, sets completed_at server-side, sets source='manual' on caption edit, re-saves full posts array (T-07-07, T-07-08, SOCIAL-06)"
    requirement: "SOCIAL-06"
    verification:
      - kind: automated
        ref: "npx tsc --noEmit — clean, no errors in slots/[slotId]/route.ts"
        status: pass
      - kind: other
        ref: "Source assertion: .eq('user_id', user.id) on campaign load before posts access; sanitizeSlotEdit(body) is sole source of applied fields; updatedSlot.completed_at set/null server-side; updatedSlot.source='manual' on caption edit; .update({posts: updatedPosts}) with the full reconstructed array"
        status: pass
    human_judgment: false
  - id: D6
    description: "D-01 scoped regeneration: body with campaignId+regeneratePlatform retains other platforms' slots (including manual edits), generates only new platform's slots, merges and updates — existing posts untouched (SOCIAL-01)"
    requirement: "SOCIAL-01"
    verification:
      - kind: other
        ref: "Source assertion: retainedPosts = existingPosts.filter(p => p.platform !== regenPlatform); mergedPosts = [...retainedPosts, ...newPlatformPosts]; .update({posts: mergedPosts})"
        status: pass
    human_judgment: false

duration: ~12min
completed: 2026-07-03
status: complete
---

# Phase 07 Plan 03: Campaign Lifecycle API Summary

**POST/GET/PATCH/DELETE campaign route + slot PATCH route — the server backbone for social calendar generation, campaign switching/deletion, and single-slot mutation, with the one-active-per-project invariant (D-04) and IDOR-guarded allowlist-only slot edits (T-07-07, T-07-08)**

## Performance

- **Duration:** ~12 min
- **Completed:** 2026-07-03T06:37:00Z
- **Tasks:** 2 (both auto)
- **Files modified:** 2 (both new)

## Accomplishments

- `app/api/launchpad/[projectId]/campaigns/route.ts` implements the full campaign CRUD surface:
  - POST generates a 4-week social calendar via `buildCalendarPrompt` + `claude-sonnet-4-6` batch call, validates AI output through `readCalendarPosts()`, and enforces D-04's one-active-per-project invariant with a flip-old-off UPDATE before the INSERT (layered on top of migration 033's DB-level partial unique index backstop)
  - D-01 scoped regeneration: POST body with `campaignId` + `regeneratePlatform` retains all other platforms' slots (including manual edits) from `readPosts()`, generates and merges only the targeted platform's new slots
  - GET lists campaigns ordered by `is_active desc, created_at desc`, running each campaign's posts through `readPosts()` before returning
  - PATCH (set active) verifies ownership then flips all project campaigns inactive before setting the target active
  - DELETE returns 409 when the target campaign is active (D-05 invariant); hard-deletes only inactive campaigns
- `app/api/launchpad/[projectId]/campaigns/[campaignId]/slots/[slotId]/route.ts` provides the sole write path for inline slot edits:
  - IDOR guard: parent campaign loaded with `.eq('user_id', user.id).eq('id', campaignId)` before any `posts[]` access — ownership re-derived from the parent row, a bare `slotId` is never trusted independently
  - `sanitizeSlotEdit(body)` is the sole source of applied fields (`caption`, `posting_time`, `completed`); fields like `posts`, `is_active`, `platform` are silently dropped
  - `completed_at` set server-side to ISO timestamp on `completed=true` flip, nulled on `completed=false` flip (D-13)
  - `source` set to `'manual'` when `caption` is edited (D-03 provenance tracking)
  - Full `posts` array re-saved after applying the targeted slot edit; a raw client-supplied `posts` array is never accepted as the column value (T-07-08)

## Task Commits

Each task was committed atomically:

1. **Task 1: Campaign lifecycle route** - `b721f2e` (feat)
2. **Task 2: Slot PATCH route with IDOR guard + allowlist** - `5a0c9c8` (feat)

## Files Created/Modified

- `app/api/launchpad/[projectId]/campaigns/route.ts` — `POST`, `GET`, `PATCH`, `DELETE` handlers; local `extractJson`; `const MODEL = 'claude-sonnet-4-6'`; inline `new Anthropic()`
- `app/api/launchpad/[projectId]/campaigns/[campaignId]/slots/[slotId]/route.ts` — `PATCH` handler; IDOR guard; `sanitizeSlotEdit` allowlist; server-side `completed_at` and `source` management

## Decisions Made

- `const MODEL = 'claude-sonnet-4-6'` declared inline with `new Anthropic()` constructed inline — no `@/lib/anthropic` import (RESEARCH.md Pitfall 4 avoidance — that module's model constant is stale)
- No `NEXT_PUBLIC_VAULT_DEMO` branch in either route — confirmed that no existing `app/api/launchpad/*` route has a demo branch; the tools-route demo precedent does not apply here (RESEARCH.md Open Question 2, resolved)
- Collaborators fetched with `.eq('user_id', user.id)` selecting `name` only, no project join — the `collaborators` table is a global per-user roster with no `project_id` FK (RESEARCH.md Pitfall 1)
- D-01 scoped regeneration implemented in the POST handler as a body variant (`campaignId` + `regeneratePlatform` present) rather than a separate route, to keep the campaign mutation surface consolidated
- `DELETE` reads `body.campaignId` (not a query param) to match the existing launchpad PATCH body convention

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None. Both files type-check clean (`npx tsc --noEmit` — no output). All source assertions passed (model constant, inline Anthropic, no demo branch, per-handler auth, IDOR guard ordering, sanitizeSlotEdit application, completed_at server-set, source='manual' on caption).

## Threat Mitigations Applied

| Threat ID | Mitigation |
|-----------|------------|
| T-07-07 (IDOR) | Campaign loaded with `.eq('user_id', user.id).eq('id', campaignId)` before any posts[] access — slotId is never used to gate access independently |
| T-07-08 (posts overwrite) | `sanitizeSlotEdit()` allowlist applied to located slot; full array reconstructed server-side; client-supplied posts array never accepted |
| T-07-09 (missing auth) | Every handler independently calls `auth.getUser()` and returns 401 |
| T-07-10 (concurrent set-active) | API flip-off-then-set-on inside one request, layered on migration 033's partial unique index |
| T-07-11 (AI output corruption) | AI output routed through `readCalendarPosts()` → `readPosts()` before insert — hallucinated platform/content_type/week dropped |

## Known Stubs

None. Both routes are fully wired: `buildCalendarPrompt` (07-02), `readCalendarPosts`/`readPosts`/`sanitizeSlotEdit`/`PLATFORM_VALUES` (07-01/07-02), and `social_campaigns` table (migration 033, live) are all present. No placeholder data, no TODO comments.

## Next Phase Readiness

- Both route files are ready for Plan 05 (CampaignCalendar component — fetches from GET /campaigns, PATCHes slots) and Plan 06 (page.tsx — displays the active campaign from GET /campaigns)
- Plan 04 (slot-scoped generation + CSV export) can build on the IDOR and allowlist patterns established here
- No blockers identified

---
*Phase: 07-social-campaign-planner*
*Completed: 2026-07-03*

## Self-Check: PASSED
