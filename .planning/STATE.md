---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Launchpad
current_phase: 1
status: Awaiting next milestone
stopped_at: Phase 07 complete — milestone v1.1 Launchpad 100%, ready to archive
last_updated: "2026-07-04T01:04:29.664Z"
last_activity: 2026-07-04
last_activity_desc: Milestone v1.1 completed and archived
progress:
  total_phases: 7
  completed_phases: 7
  total_plans: 32
  completed_plans: 32
  percent: 100
current_phase_name: social-campaign-planner
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-04)

**Core value:** An artist finishes a release and immediately knows their next moves — who to pitch, what to post, and when — without leaving Funūn. The Launchpad turns release day into a 6-week playbook.
**Current focus:** Milestone v1.1 Launchpad shipped & archived (2026-07-04) — planning next milestone (Wave 4) via `/gsd-new-milestone`

## Current Position

Phase: Milestone v1.1 complete
Plan: —
Status: Awaiting next milestone
Last activity: 2026-07-04 — Milestone v1.1 completed and archived

## Performance Metrics

**Velocity:**

- Total plans completed: 18 (Wave 3)
- Average duration: -
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 05 | 6 | - | - |
| 06 | 6 | - | - |
| 07 | 6 | - | - |

**Recent Trend:**

- Last 5 plans: n/a
- Trend: n/a

*Updated after each plan completion*
| Phase 05 P01 | 4 | 3 tasks | 2 files |
| Phase 05 P02 | 12 | 3 tasks | 8 files |
| Phase 05 P03 | 3 | 2 tasks | 2 files |
| Phase 05 P05 | 8m | 3 tasks | 5 files |
| Phase 05 P06 | 15 | 3 tasks | 4 files |
| Phase 06 P01 | 5min | 5 tasks | 6 files |
| Phase 06 P02 | 35min | 3 tasks | 11 files |
| Phase 06 P03 | 20min | 3 tasks tasks | 7 files files |
| Phase 06 P04 | ~40min | 3 tasks | 8 files |
| Phase 06 P05 | ~35min | 3 tasks | 10 files |
| Phase 06 P06 | 20min | 3 tasks | 8 files |
| Phase 07 P01 | ~15min | 3 tasks | 3 files |
| Phase 07 P02 | ~10min | 2 tasks | 2 files |
| Phase 07 P04 | 8min | 2 tasks | 2 files |
| Phase 07 P06 | 6 | - tasks | - files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Wave 3 init: Launchpad as a guided checklist, not a tool junk drawer — tools surface as actions within items
- Wave 3 init: Playlist pitching is a lean manual curator directory; grow via curator-claim links in pitch emails
- Wave 3 init: Pitch emails link to `/r/[projectId]` player as a curator-onboarding growth loop
- Wave 3 init: Social planning only (no execution) — Meta/TikTok OAuth deferred to Wave 4
- Wave 3 init: Buffer-compatible CSV is the V1 social export — Later has no CSV import
- Wave 3 research: `pitch.funun.studio` subdomain (DKIM/SPF/DMARC + ~2-week warmup) is a prerequisite for PITCH-02 — keeps cold outreach off the transactional domain
- Wave 3 research: every new table in every migration must `ENABLE ROW LEVEL SECURITY` immediately after `CREATE TABLE` (CVE-2025-48757 pattern)
- Wave 3 research: checklist items carry a `suggested_week` field to sequence the post-release Spotify algorithmic window (weeks 1–4)
- Wave 3 research: curator claim is explicit link-click only (do NOT wire into `handle_new_user()`), unlike Wave 2 collaborator auto-claim; 32-byte token, 72-hour expiry, one-time use
- Wave 3 research: AI calendar is a batch (non-streaming) Claude call; release data isolated in `<release_data>` block; platform limits hard-coded in system prompt
- [Phase 5]: admin gate helper centralized in `lib/admin/gate.ts` — every `/api/admin/*` route re-verifies independently, not just the `(admin)` layout redirect
- [Phase 5]: Admin pages query Supabase directly via createServiceClient() (not self-fetching API routes)
- [Phase 06]: svix approved for install despite [SUS] heuristic flag -- 5-year-old official svix/svix-webhooks package, ~4.88M weekly downloads; flag fired on release recency not package age — Task 1 checkpoint:human-verify review of RESEARCH.md Package Legitimacy Audit evidence
- [Phase 06]: Migration 030 applied to the live Supabase DB by the user directly (own authenticated supabase db push / Dashboard SQL Editor), not by the executor sandbox which has no Supabase CLI credentials — Sandbox has no linked project/access token and .env.local is intentionally not readable here; user's explicit confirmation treated as authoritative per checkpoint resolution instructions
- [Phase ?]: [Phase 06 P02]: Reach re-fetch on PATCH only triggers when platform or playlist_url changes, not on every field edit -- avoids wasting Spotify/YouTube API quota
- [Phase ?]: [Phase 06 P02]: resetBaseline is a distinct PATCH action, not an implicit side effect of a genre_focus edit -- lets admin clear drift flag independently
- [Phase ?]: [Phase 06 P03]: Moved app/(admin)/curators/page.tsx to app/(admin)/admin/curators/page.tsx to resolve a route collision with the locked /curators artist artifact -- also fixes one of three pre-existing broken admin sidebar links
- [Phase ?]: [Phase 06 P04]: app/api/pitches/route.ts pre-existed as a dead industry-pitch-credits route with zero UI callers -- replaced after confirming no references outside that one file, since this plans locked artifact requires the identical path
- [Phase ?]: [Phase 06 P04]: Duplicate/blocked curator detection rejects the entire send request with 409 rather than partially sending to eligible curators -- keeps atomic bulk-insert semantics simple
- [Phase ?]: [Phase 06 P05]: Curator claim account creation sets app_metadata.role at admin.createUser() time (never a post-insert UPDATE) so handle_new_user() curator branch fires -- avoids creating an artist_profiles row for curators
- [Phase ?]: [Phase 06 P05]: On an admin.createUser() email conflict, the claim route reuses the existing auth.users id for claimed_by via generateLink() rather than failing, without touching that account's existing role/profile
- [Phase ?]: [Phase 06 P06]: Public accept/decline/unsubscribe pages are single-file 'use client' components using next/navigation's useParams() instead of a server-page + client-island split -- React is pinned to 18.3 in this project, which lacks the use() hook needed to unwrap an async params Promise in a Client Component
- [Phase 06]: Code review found 3 critical findings (HTML injection in pitch emails; RLS row policies on curators/pitch_history didn't restrict columns, exposing claim_token/response_token via direct PostgREST) -- fixed via escapeHtml() and additive migrations 031 (column REVOKE/GRANT) + 032 (claim_token UNIQUE index), both pushed to live DB by the user and confirmed during UAT
- [Phase 06]: Security review closed 22 threats (20 authored at plan time + 2 added post-hoc from code review) with zero open -- see 06-SECURITY.md
- [Phase 07]: [Phase 07 P01]: Corrected RESEARCH.md's 'TikTik' typo to 'tiktok' in hip_hop_rap's platform ranking in lib/launchpad/platform-nudges.ts, per plan instruction
- [Phase 07]: [Phase 07 P01]: getPlatformNudges()/getPlatformNudgeRationale() share one internal resolveNudge() helper for the profile-slug-preferred, free-text-alias-fallback, empty-on-no-match resolution logic
- [Phase ?]: [Phase 07 P02]: computeDefaultPostingTime parses YYYY-MM-DD release dates via a manual regex-based parseLocalDate() helper instead of new Date(releaseDate), to avoid the UTC-parse/local-timezone day-shift bug
- [Phase ?]: [Phase 07 P02]: buildSlotHookPrompt shares buildSlotCaptionPrompt's exact signature and { caption } output shape -- only the creative framing (hook vs caption) differs
- [Phase 07]: const MODEL = 'claude-sonnet-4-6' inline in campaigns/route.ts — no @/lib/anthropic import (RESEARCH.md Pitfall 4 avoidance) — The tools route already established this constant; importing from lib/anthropic would risk a stale model value
- [Phase 07]: No NEXT_PUBLIC_VAULT_DEMO branch in launchpad campaign routes — launchpad-route precedent, not tools-route (Open Question 2 resolved) — No existing app/api/launchpad/* route has a demo branch; the tools route precedent does not apply
- [Phase 07]: Collaborators fetched as global roster by user_id with no project join (RESEARCH.md Pitfall 1 — collaborators table has no project_id FK)
- [Phase ?]: [Phase 07 P04]: const MODEL = 'claude-sonnet-4-6' inline in generate route — no @/lib/anthropic import (Pitfall 4)
- [Phase ?]: [Phase 07 P04]: generate route IDOR guard: campaign loaded with user_id+campaignId+projectId before slot lookup; slotId alone never trusted (T-07-12)
- [Phase ?]: Phase 07 Plan 06

### Pending Todos

None yet.

### Blockers/Concerns

None currently.

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| E-sign | Dropbox Sign live implementation | Blocked — paid account needed | Wave 2 init |
| Integrations | Songtrust API integration | Blocked — BD conversation pending | Wave 2 init |
| Integrations | SoundExchange direct filing | Blocked — partner agreement required | Wave 2 init |
| Social | Direct post scheduling / publishing (Meta/TikTok OAuth) | Deferred — Wave 4 | Wave 3 init |
| Social | Direct Later/Buffer API calendar push | Deferred — Wave 4 | Wave 3 init |
| Curators | Automated curator directory seeding (scraping/API) | Deferred — Wave 4; manual + claim for Wave 3 | Wave 3 init |
| Verification (v1.0) | Phase 01 verification | human_needed — legacy v1.0, shipped 2026-06-29 | v1.1 close |
| Verification (v1.0) | Phase 04 verification | human_needed — legacy v1.0, shipped 2026-06-29 | v1.1 close |
| UAT (v1.0) | Phase 04 UAT (partial, 0 pending scenarios) | legacy v1.0, shipped 2026-06-29 | v1.1 close |

## Session Continuity

**Resume file:** None

Last session: 2026-07-04
Stopped at: Phase 07 complete — milestone v1.1 Launchpad 100%, ready to archive
Resume file: None

## Operator Next Steps

- Start the next milestone with /gsd-new-milestone
