---
phase: 08-identity-schema-foundation
plan: 06
subsystem: api
tags: [next.js, supabase, resend, typescript, admin, industry-members, role-mapping]

requires:
  - phase: 08-01
    provides: member_type column on artist_profiles (migration 034), which this plan's GET list query filters on
  - phase: 08-04
    provides: handle_new_user() industry branch that builds the member_type='industry' row + subscriptions row from user_metadata keys this plan's createIndustryMember() sets
  - phase: 08-05
    provides: column-privilege lockdown (migration 040) — the GET route uses an explicit column list that matches the GRANT SELECT set to remain safe once that migration lands

provides:
  - createIndustryMember() standalone helper (lib/industry/createIndustryMember.ts) — atomically sets app_metadata.role='industry' at createUser() time, passes role_badges/profile_roles via user_metadata for the 08-04 trigger, sends a custom Resend magic-link invite (resolved D-03)
  - roleMapping.ts — maps INDUSTRY_ROLE_GROUPS slugs to ProfileRole[] presets (D-08 / Pitfall 4 coverage)
  - industryInviteEmail() builder (lib/email/industryInvite.ts) — custom branded HTML invite, NOT Supabase's built-in invite template
  - POST /api/admin/members — verifyAdmin()-gated, allowlist-validated route that delegates to createIndustryMember() and returns 409 on duplicate email
  - GET /api/admin/members — verifyAdmin()-gated list of member_type='industry' profiles with per-row email attached via service.auth.admin.getUserById()
  - /admin/members page (server component, explicit per-page is_admin gate) with "Industry Members" nav link and MembersAdmin client component
  - MembersAdmin client form — grouped INDUSTRY_ROLE_GROUPS chip picker, inline validation, optimistic prepend on success

affects: [phase-09-rich-member-profile, phase-10-connections-notifications, any future industry self-serve signup flow]

tech-stack:
  added: []
  patterns:
    - "createIndustryMember() is standalone (lib/industry/) and not inlined in the API route handler — the future self-serve path calls it unchanged (D-05)"
    - "app_metadata.role set ATOMICALLY at admin.createUser() time (never a post-insert UPDATE) so the handle_new_user() trigger branch fires in the same transaction — mirrors the curator-claim precedent"
    - "Custom Resend magic-link flow: admin.generateLink({type:'magiclink'}) -> sendEmail(industryInviteEmail()) — the built-in Supabase invite email is deliberately bypassed (D-03)"
    - "Email attachment pattern: artist_profiles has no email column; GET route and page server component attach each row's email via service.auth.admin.getUserById(row.id) (Rule 2 auto-fix — see Deviations)"
    - "Per-page admin gate (is_admin check inside the server component) is NOT delegated to layout alone — matching the /admin/curators precedent (T-08-17)"

key-files:
  created:
    - lib/industry/roleMapping.ts
    - lib/industry/createIndustryMember.ts
    - lib/email/industryInvite.ts
    - app/api/admin/members/route.ts
    - app/(admin)/admin/members/page.tsx
    - components/admin/MembersAdmin.tsx
  modified:
    - app/(admin)/layout.tsx

key-decisions:
  - "artist_profiles has no email column — GET route and page server component call service.auth.admin.getUserById(row.id) per row to satisfy the UI-SPEC's '{email} · Joined {date}' list contract (Rule 2 auto-fix; N+1 acceptable given the small admin list size)"
  - "Checkpoint Task 4 approved by user with the explicit caveat that live end-to-end SC-5 verification (trigger-built row, free subscription, custom Resend email, magic-link sign-in) remains contingent on the pending human-run schema push (migrations 034-040, documented in 08-05-SUMMARY.md)"

patterns-established:
  - "Admin surface pattern: standalone lib/industry/ helper + verifyAdmin()-gated API route + per-page is_admin server component gate + 'use client' form component with optimistic prepend"
  - "Custom transactional invite pattern: admin.generateLink(magiclink) + sendEmail(industryInviteEmail()) — reusable model for any future invite-code or approval-gated onboarding flow"

requirements-completed: []

coverage:
  - id: D1
    description: "roleMapping.ts maps INDUSTRY_ROLE_GROUPS slugs to ProfileRole[] presets (ar_executive->anr, music_supervisor->music_supervisor, etc.) with deduplication and custom fallback"
    verification:
      - kind: other
        ref: "npx tsc --noEmit (exit 0, confirmed after Task 1)"
        status: pass
    human_judgment: false
  - id: D2
    description: "createIndustryMember() sets app_metadata.role='industry' atomically at createUser() time, passes role_badges + profile_roles via user_metadata, generates a magic-link, and sends a custom Resend invite email — does NOT directly insert artist_profiles or subscriptions rows"
    verification:
      - kind: other
        ref: "npx tsc --noEmit (exit 0, confirmed after Task 1)"
        status: pass
    human_judgment: false
  - id: D3
    description: "POST /api/admin/members: verifyAdmin()-gated, allowlist-validates email/display_name/role_slugs against ALL_INDUSTRY_ROLE_SLUGS, delegates to createIndustryMember(), returns 409 on duplicate email"
    verification:
      - kind: other
        ref: "npx tsc --noEmit (exit 0, confirmed after Task 2)"
        status: pass
    human_judgment: false
  - id: D4
    description: "/admin/members page with Industry Members nav link, per-page is_admin gate, explicit column select on artist_profiles, and MembersAdmin client component with grouped chip picker, optimistic prepend, and inline validation"
    verification:
      - kind: other
        ref: "npx tsc --noEmit (exit 0, confirmed after Task 3)"
        status: pass
    human_judgment: false
  - id: D5
    description: "SC-5 end-to-end: invite -> trigger-built member_type='industry' row (both role columns) + free subscription -> custom Resend email -> magic-link sign-in -> 409 on duplicate re-invite"
    verification: []
    human_judgment: true
    rationale: "Live end-to-end path requires the database trigger (handle_new_user() industry branch from 08-04) and migrations 034-040 to be pushed to a real Supabase project. Per 08-05-SUMMARY.md, that schema push is a pending manual-intervention gap (no supabase/config.toml, no linked project, SUPABASE_ACCESS_TOKEN unset in this environment). The user approved the checkpoint (Task 4) with this caveat explicitly known. SC-5 acceptance is contingent on the human completing the migration push steps from 08-05-SUMMARY.md."

duration: ~30min
completed: 2026-07-05
status: complete
---

# Phase 8 Plan 6: Identity Schema Foundation - Industry Member Admin Surface Summary

**createIndustryMember() standalone helper + roleMapping + custom Resend magic-link invite + /admin/members admin UI (page, nav link, client form with grouped chip picker) — SC-5's full application layer, pending live-database trigger verification after schema push**

## Performance

- **Duration:** ~30 min
- **Completed:** 2026-07-05
- **Tasks:** 4 (3 auto + 1 human-verify checkpoint)
- **Files modified:** 7 (6 created, 1 modified)

## Accomplishments

- Built `createIndustryMember()` as a standalone, reusable lib/industry/ helper (D-05) that atomically sets `app_metadata.role='industry'` at `admin.createUser()` time — matching the curator-claim precedent — so the plan 08-04 trigger's industry branch fires in the same transaction with no phantom-row race.
- Built `roleMapping.ts` bridging the D-08 slug-to-ProfileRole gap: INDUSTRY_ROLE_GROUPS slugs map to ProfileRole presets where a preset exists (ar_executive->anr, music_supervisor->music_supervisor, etc.) and fall back to `{kind:'custom', label: industryRoleLabel(slug)}` for everything else; preset deduplication prevents two artist-ish slugs from producing two identical 'artist' entries.
- Wired a custom Resend magic-link invite email (resolved D-03) via `admin.generateLink({type:'magiclink'}) + sendEmail(industryInviteEmail())` — Supabase's built-in invite email is deliberately bypassed; the flow mirrors the existing curator-claim route.
- Delivered a real, repeatable admin tool (D-02): `/admin/members` page with per-page `is_admin` gate (not layout-only), "Industry Members" nav link, and a `MembersAdmin` client form with grouped `INDUSTRY_ROLE_GROUPS` chip picker, inline client-side validation, optimistic prepend on success, and server-error display — matching the locked 08-UI-SPEC.
- POST /api/admin/members is `verifyAdmin()`-gated, allowlist-validates role slugs against `ALL_INDUSTRY_ROLE_SLUGS`, returns 409 on duplicate email, and delegates fully to `createIndustryMember()` rather than inlining the admin SDK calls.

## Task Commits

Each task was committed atomically:

1. **Task 1: Build roleMapping + createIndustryMember() helper + custom Resend invite email** - `59fb936` (feat)
2. **Task 2: Build /admin/members API route** - `4092bd3` (feat)
3. **Task 3: Build /admin/members page + nav link + MembersAdmin client component** - `4f134a9` (feat)
4. **Task 4: Human verify — end-to-end industry-invite path (SC-5)** - Checkpoint approved by user (no separate commit; see Checkpoint Resolution below)

**Plan metadata:** committed separately as part of this SUMMARY/STATE/ROADMAP update.

## Files Created/Modified

- `lib/industry/roleMapping.ts` - Slug->ProfileRole preset mapping table with deduplication and custom fallback; exports `mapSlugsToProfileRoles()` and reuses `ALL_INDUSTRY_ROLE_SLUGS` for allowlist validation
- `lib/industry/createIndustryMember.ts` - Standalone async helper: createUser (app_metadata.role='industry' + user_metadata role keys), generateLink(magiclink), sendEmail(industryInviteEmail()); handles duplicate-email edge case; returns `{ userId }`
- `lib/email/industryInvite.ts` - Custom branded HTML invite email builder; exports `industryInviteEmail({displayName, actionLink})` returning `{subject, html}` for sendEmail()
- `app/api/admin/members/route.ts` - GET (list industry profiles, email attached via getUserById) + POST (verifyAdmin, validate, createIndustryMember, 409 on duplicate)
- `app/(admin)/admin/members/page.tsx` - Server component; per-page is_admin gate; fetches industry profiles with email attachment; renders `<MembersAdmin>`
- `components/admin/MembersAdmin.tsx` - Client component with showAddForm state machine, grouped chip picker, optimistic prepend, inline validation/error display
- `app/(admin)/layout.tsx` - Added "Industry Members" nav `<Link href="/admin/members">` with matching sidebar class string

## Decisions Made

- **Email attachment via getUserById (Rule 2 auto-fix):** `artist_profiles` has no `email` column — storing it there would duplicate data that lives in `auth.users`. The GET route and page server component call `service.auth.admin.getUserById(row.id)` per row to satisfy the UI-SPEC's `{email} · Joined {date}` list contract. The N+1 pattern is acceptable at admin-list scale (industry member count is small).
- **Checkpoint approved with live-push caveat:** The user approved Task 4 knowing that SC-5's end-to-end trigger path (handle_new_user() industry branch building the `member_type='industry'` row + free subscription) is contingent on migrations 034-040 being pushed to a real Supabase project. See the Checkpoint Resolution section below.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Email attachment via service.auth.admin.getUserById() — not in plan**
- **Found during:** Task 1 (reading `artist_profiles` table structure)
- **Issue:** The plan's GET route spec called for listing `artist_profiles` rows with member_type='industry'. The 08-UI-SPEC's list contract requires `{email} · Joined {date}` per row, but `artist_profiles` has no `email` column (email lives in `auth.users`). Without attaching email, the UI contract cannot be satisfied.
- **Fix:** GET handler and page server component call `service.auth.admin.getUserById(row.id)` for each row to fetch the email from `auth.users` and attach it to the response shape. This is the same pattern used by other admin surfaces in this codebase.
- **Files modified:** `app/api/admin/members/route.ts`, `app/(admin)/admin/members/page.tsx`
- **Verification:** `npx tsc --noEmit` passes; no `email` column added to `artist_profiles`.
- **Committed in:** `4092bd3` (Task 2), `4f134a9` (Task 3)

---

**Total deviations:** 1 auto-fixed (Rule 2 — missing critical functionality to satisfy the UI-SPEC list contract)
**Impact on plan:** Necessary for correctness; no scope creep; no architectural change (no new column, no schema touch).

## Checkpoint Resolution

**Task 4 (SC-5 end-to-end human verify):** User responded "approved".

**Live-push caveat (documented honestly):** The checkpoint was approved with the explicit understanding that full end-to-end SC-5 verification — specifically:
- The `handle_new_user()` industry branch (plan 08-04) building a `member_type='industry'` `artist_profiles` row with both `industry_roles` (TEXT[]) and `roles` (JSONB) populated
- A `subscriptions` row with `tier='free'` created by the trigger
- The custom Resend magic-link invite email arriving in the test inbox
- The magic-link signing in the invited user
- A 409 response on re-invite of the same email

...all remain **contingent on a human completing the schema push** (migrations 034-040) documented in `08-05-SUMMARY.md`. The application-layer code (all 7 files) is written, committed, and type-check-verified. The database trigger (plan 08-04) and column-privilege lockdown (plan 08-05) exist as migration SQL in this working tree but have not been applied to any live Supabase database in this environment (no `supabase/config.toml`, no linked project, `SUPABASE_ACCESS_TOKEN` unset). SC-5 live-DB end-to-end verification has NOT occurred in this execution and should not be marked as passed until the human-run push from `08-05-SUMMARY.md` is complete.

## Issues Encountered

None beyond the pre-existing live-push gap carried from 08-05 (documented above).

## User Setup Required

**Before SC-5 can be considered verified end-to-end**, a human must complete the schema push steps from `08-05-SUMMARY.md`:

1. Link this repo to a real Supabase project and set `SUPABASE_ACCESS_TOKEN`.
2. Run `npx supabase db push --dry-run` (migrations 034-040) and confirm exit 0.
3. Run `npm run db:push` (the real push) and confirm all migrations apply.
4. Run `npm run db:types` to regenerate `types/supabase.ts`.
5. Perform the SC-4 and SC-5 smoke assertions from `.planning/phases/08-identity-schema-foundation/08-VALIDATION.md`.

No code changes in this plan are needed to unblock that push — the gap is purely an environment/credentials setup issue.

## Next Phase Readiness

- The full application layer for industry-member creation is written, committed, and type-checked. `createIndustryMember()` is callable from a future self-serve signup flow without modification (D-05).
- Phase 8 is code-complete across all 6 plans. SC-5 live-DB verification is pending the migration push.
- Phases 9-13 (Rich Member Profile, Connections, Presence, Discovery, Network) can proceed in parallel with the human completing the migration push, as their planning artifacts are already written and their schema dependencies (migrations 034-040) will be satisfied once the push runs.

---
*Phase: 08-identity-schema-foundation*
*Completed: 2026-07-05*

## Self-Check: PASSED

All created/modified files confirmed present on disk; commits 59fb936, 4092bd3, 4f134a9 confirmed present in git log.
