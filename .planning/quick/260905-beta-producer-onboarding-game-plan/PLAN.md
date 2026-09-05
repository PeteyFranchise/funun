# Beta Producer Onboarding Game Plan

## Objective

Publish the approved producer-onboarding checklist in The Playbook and make it usable as a reusable, per-call Member Account game plan for A&R, AE, and Leadership staff before the September 6, 2026 beta onboarding.

## Scope

- Publish a clearly marked **BETA TESTING ONLY** Playbook SOP containing the onboarding checklist, safety guidance, definition of success, and Recommended CRM Workflow.
- Add service-role-only reusable Member onboarding templates and per-call game-plan runs.
- Add a Team Console Member Onboarding CRM page for selecting a Member, starting the template, checking/completing/skipping items, taking item notes, saving progress, and completing/logging the call.
- Preserve completed runs as the Member's call log and keep the reusable template unchanged.
- Restrict the page and APIs to Leadership, AE, and A&R staff.
- Add the Team Console navigation entry.

## Files Expected to Change

- `supabase/migrations/181_beta_producer_onboarding_game_plan.sql`
- `lib/member-onboarding/*`
- `app/(admin)/admin/member-onboarding/*`
- `app/api/admin/member-onboarding/*`
- `components/admin/MemberOnboardingCRM.tsx`
- `components/nav/AdminNav.tsx`
- focused tests for validation, progress, and access-sensitive behavior

## Validation Plan

- Run focused Jest tests for the Member onboarding domain.
- Run strict TypeScript checking and lint.
- Run the production build.
- Confirm the migration contains service-role-only tables, the Playbook entry, and the reusable beta template.
- Confirm the working tree contains no unrelated changes.

## Risks / Coordination Notes

- The migration is human-gated and must be applied before the new production page can load.
- Existing Client Partner `game_plans` remain organization-scoped and are intentionally unchanged.
- Completed call records are immutable through the UI; a new call always creates a new run from the current template snapshot.
- Rights data is entered in the Member's own Settings flow; the call plan records progress and notes, not duplicate sensitive rights identifiers.
