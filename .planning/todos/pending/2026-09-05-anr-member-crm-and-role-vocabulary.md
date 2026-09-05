---
created: 2026-09-05T18:00:00-04:00
title: A&R-facing member CRM — assigned book, supply-side health, and role-vocabulary consolidation
area: team-console / member-onboarding
priority: ready-for-gsd-discussion
status: ready-for-gsd-discussion
files:
  - app/(admin)/admin/member-onboarding/page.tsx
  - components/admin/MemberOnboardingCRM.tsx
  - components/nav/AdminNav.tsx
  - app/(admin)/admin/sync-library/page.tsx
  - app/api/sync-library/tag-approve/route.ts
  - types/index.ts
  - lib/industry-roles.ts
  - lib/industry/roleMapping.ts
---

## Origin

Surfaced 2026-09-05 while scoping "what an A&R sees when onboarding members." That discussion
became **Phase 38 (Member Organization & Team Workspaces)**, which covers the *relationship*
layer. The A&R-facing CRM itself was never planned and is recorded here so the findings are not
lost. `38-CONTEXT.md` § Deferred Ideas points at this file.

## Owner decisions already taken (2026-09-05, do not re-ask)

- **Assigned book, like the AE model.** Every Member is assigned to one A&R who owns the
  relationship — reuse 31.1's assignment, handoff-with-note and coverage machinery rather than
  inventing a parallel one.
- **Consolidate the role vocabulary BEFORE designing the flow**, because the flow branches on role.

## Findings from the code audit (verified, not speculation)

1. **There is no A&R book.** `app/(admin)/admin/member-onboarding/page.tsx` renders a flat
   `<select>` over up to 500 `user_profiles` and calls `service.auth.admin.listUsers({ perPage: 1000 })`
   on every page load. No search, no filter, no "who needs onboarding", no ownership.

2. **No supply-side health signal.** The AE side has a 5-state engine driven by executed-license
   recency (`lib/client-partners/health.ts`). The member side has only completed game-plan runs —
   nothing indicates a member who went quiet, stalled mid-setup, or never returned after signup.
   Owner has NOT chosen a clock for this yet (candidates discussed: last real creative action,
   onboarding-completion + activity, sign-in recency, or defer).

3. **LIVE INCONSISTENCY — A&R can approve Sync Library tags via API but cannot reach the page.**
   `app/api/sync-library/tag-approve/route.ts:31` calls `requireStaff(['leadership', 'anr'])`, but
   `app/(admin)/admin/sync-library/page.tsx` is gated to `leadership | ae` and `AdminNav.tsx` shows
   no Sync Library entry to `anr`. Meanwhile `AdminNav` DOES show A&R the buyer-side sales rooms
   (Client Partners, Crate Requests, Selects). A&R's nav is pointed at the demand pipeline while its
   own curation surface is unreachable. Small, self-contained fix; worth doing independently.

4. **Role vocabulary is fractured across three lists.**
   - `PROFILE_ROLE_LABELS` (types/index.ts) — 6 presets: artist, producer, songwriter,
     music_supervisor, anr, exec. These are what render as profile badges.
   - `INDUSTRY_ROLE_GROUPS` (lib/industry-roles.ts) — 31 slugs in 5 groups, including **Manager**
     and **Label Executive**.
   - `mapSlugsToProfileRoles()` (lib/industry/roleMapping.ts) maps only 7 of the 31; the other 24
     degrade to custom text badges.
   So Manager and Label Executive exist in the picker but have no first-class representation.

5. **Onboarding is disconnected from the funnel.** `artist_waitlist` → `artist_invites` (Artist
   Invites room) is where people enter; Member Onboarding is a separate room keyed off
   `user_profiles`. Nothing carries a person from invited → signed up → onboarded → active. Same
   shape as the Phase 34 hole on the AE side.

## What already exists and should be reused, not rebuilt

`member_game_plan_templates` + `member_game_plan_runs` (migration 181, shipped 2026-09-05) are a
good design: templates are versioned and reusable, each run freezes the template version and
checklist so editing a template never rewrites a captured call, completed runs form an append-only
call log, and rights identifiers deliberately stay in the member's profile rather than being copied
into the run. Access is `['leadership','ae','anr']`. One template exists — Beta Producer Onboarding
Call, 7 sections, ~35 items.

## Open question the owner did NOT answer

Managers and label teams have little to be onboarded *into* until roster/delegated access exists.
**Phase 38 now builds exactly that**, so this question should be re-asked after Phase 38 ships
rather than before — the answer may simply become "design all six audiences, the represent lane
now works."

## GSD instruction

Run `/gsd-discuss-phase` for this after Phase 38 (or at least after Phase 38's roster relationships
land in Slice B). Finding 3 is independent of everything else and can be fixed any time via
`/gsd-quick`.
