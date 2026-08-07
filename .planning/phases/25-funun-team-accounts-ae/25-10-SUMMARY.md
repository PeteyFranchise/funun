---
phase: 25-funun-team-accounts-ae
plan: 10
subsystem: ui
tags: [nextjs, react, supabase, admin, directory]

# Dependency graph
requires:
  - phase: 25-funun-team-accounts-ae
    provides: "25-03: funun_staff title/phone/avatar_url columns (migration 089); 25-06: role-aware sidebar /admin/directory nav link + StaffRole gate helpers; 25-08: console-theme.ts tokens for light/dark theming"
provides:
  - "/admin/directory — all-roles, read-only Team Member contact directory"
  - "TeamDirectory component — Cards/List contact-card views with mailto:/tel: actions"
affects: [team-console, staff-onboarding]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Any-staff gate pattern: getStaffRole(user) === null → redirect('/'), contrasted with leadership-only requireStaff(['leadership']) pattern used by /admin/team-members"
    - "View-mode toggle persisted to localStorage, read in a useEffect after mount (SSR-safe)"

key-files:
  created:
    - app/(admin)/admin/directory/page.tsx
    - components/admin/TeamDirectory.tsx
  modified: []

key-decisions:
  - "Gate uses getStaffRole(user) === null (admits leadership/AE/BD) rather than requireStaff(['leadership']) used by the management page — this is the all-roles/read-only distinction the plan requires"
  - "Local initials() helper mirrors components/messages/Composer.tsx's implementation rather than importing across domains (messages vs admin)"

requirements-completed: [TEAM-09]

coverage:
  - id: D1
    description: "/admin/directory page gates on any non-null staff role (leadership, AE, BD all admitted; non-staff redirected) and reads funun_staff column-explicit with per-row email attach from auth.users"
    requirement: "TEAM-09"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit"
        status: pass
    human_judgment: true
    rationale: "Gate behavior across three staff roles + non-staff redirect requires a live/dev-run smoke test (per plan's own <verification> section) to confirm in practice; no test suite exists in this repo (CLAUDE.md notes no test framework)."
  - id: D2
    description: "TeamDirectory component renders Cards and List views with avatar (photo/initials fallback), role pill, title, mailto: Email action, and tel: Call action (only when phone set), themed via console tokens for light + dark"
    requirement: "TEAM-09"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit && npm run build"
        status: pass
      - kind: other
        ref: "grep -nE '#[0-9a-fA-F]{3,6}' components/admin/TeamDirectory.tsx (no hardcoded hex found)"
        status: pass
    human_judgment: true
    rationale: "Visual rendering correctness in both light and dark themes, and the mailto/tel links actually opening the viewer's mail/phone app, require a live browser check per the plan's <verification> section."

# Metrics
duration: 20min
completed: 2026-08-07
status: complete
---

# Phase 25 Plan 10: Team Member Directory Summary

**All-roles, read-only Team Member phone book at /admin/directory — contact cards (avatar, name, role, title, email, phone) in switchable Cards/List views with mailto:/tel: actions, themed via console tokens.**

## Performance

- **Duration:** ~20 min
- **Tasks:** 2 completed
- **Files modified:** 2 (both new)

## Accomplishments
- Built `/admin/directory` as a server component gated by `getStaffRole(user) !== null` (any staff role — leadership, AE, BD — unlike the leadership-only `/admin/team-members` management page)
- Page reads `funun_staff` column-explicit (`user_id, staff_role, display_name, title, phone, avatar_url`), ordered by `display_name`, and attaches each row's email from `auth.users` per-row via the admin API, mirroring `app/(admin)/admin/members/page.tsx`
- Built `TeamDirectory` client component with a segmented Cards/List view toggle (default Cards, persisted to `localStorage`), a shared client-side search across name/title/role, and real contact actions: `mailto:` Email link on every card/row, `tel:` Call link only when a phone is present
- Avatar renders the member's photo (`avatar_url`) when set, else an initials-circle fallback, in both views
- Styled entirely through the console design tokens (`var(--ink)`, `var(--panel)`, `var(--border)`, `var(--indigo)`, etc.) established in 25-08 — no hardcoded hex, confirmed by grep

## Task Commits

Each task was committed atomically:

1. **Task 1: /admin/directory page — any-staff gate + funun_staff read + email join** - `8651107` (feat)
2. **Task 2: TeamDirectory component — contact-card grid + contact actions** - `61e7da7` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `app/(admin)/admin/directory/page.tsx` - Server component: any-staff gate, funun_staff column-explicit read, per-row email join, renders TeamDirectory
- `components/admin/TeamDirectory.tsx` - Client component: Cards/List toggle, search, avatar-with-initials-fallback, role pill, mailto:/tel: contact actions

## Decisions Made
- Used `getStaffRole(user) === null → redirect('/')` as the any-staff gate, explicitly distinct from the `requireStaff(['leadership'])` / `getStaffRole(user) !== 'leadership'` pattern the leadership-only `/admin/team-members` page uses — this is the load-bearing distinction between the phone book (Directory) and HR management.
- Wrote a small local `initials()` helper in `TeamDirectory.tsx` mirroring `components/messages/Composer.tsx`'s implementation rather than importing across the messages/admin domain boundary, keeping `lib/` and `components/` module boundaries clean per project convention.

## Deviations from Plan

None — plan executed exactly as written. One micro-fix during Task 2 verification: moved an `eslint-disable-next-line @next/next/no-img-element` comment to sit directly above the `<img>` JSX line (it was one line off, above the enclosing `return (`), which the Next.js build's lint pass flagged as an unsuppressed warning. This is scoped entirely within the task's own new file and required no logic change — verified clean by re-running `npx tsc --noEmit` and `npm run build` (zero warnings).

## Issues Encountered
None.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
This was the final plan (10 of 10) in Phase 25 (funun-team-accounts-ae). All plan-level automated verification (`npx tsc --noEmit`, `npm run build`, hardcoded-hex grep) passes. Remaining verification is the plan's own stated live check: an AE and a BD both reaching `/admin/directory`, seeing every teammate's card, and confirming the Email/Call links work — this is a human_judgment item (see `coverage` above) to be exercised during the phase's live/dev-run pass, consistent with STATE.md's existing note that Phase 25 has a blocking human-verify checkpoint (migration push + live smoke) pending.

## Self-Check: PASSED

- FOUND: `app/(admin)/admin/directory/page.tsx`
- FOUND: `components/admin/TeamDirectory.tsx`
- FOUND: commit `8651107`
- FOUND: commit `61e7da7`
