---
slug: team-members-multi-role
description: Port the approved Team Members redesign to real code as a full multi-role staff model (staged) — 7 roles incl. Legal/TMS, multi-hat people, card/list+filter, contact fields, manage-member workflow, TMS-can-manage
date: 2026-08-21
files_modified:
  - lib/admin/staff-role.ts
  - lib/admin/gate.ts
  - components/admin/StaffAdmin.tsx
  - components/admin/TeamDirectory.tsx
  - lib/admin/staff-role.test.ts
  - lib/admin/gate.test.ts
  - supabase/migrations/119_staff_roles_multi.sql
  - lib/staff/createStaffAccount.ts
  - app/api/admin/staff/route.ts
  - app/api/admin/staff/[id]/route.ts
  - app/(admin)/admin/team-members/page.tsx
---

<objective>
Port the approved Team Members redesign (mockup https://claude.ai/code/artifact/74c34d60-c313-4a5e-b9eb-34ea0a9fcc63,
memory `project_team_members_redesign`) to real code as a FULL multi-role staff
model. Overturns the documented single-role decision (D-03) deliberately, per
owner approval ("Full multi-role, staged"). No RLS change (the gate is app-code;
funun_staff is service-role-only). Migration is owner-gated `supabase db push`.

Roles: leadership, ae, bd, anr, it (existing) + **legal, tms (new)**. People can
hold **multiple** roles. Team management opens to **leadership + tms**.

Built in 4 stages, each: atomic commit + tsc + lint + tests; production build at
cluster boundaries. NEVER touch `.claude/launch.json`.
</objective>

---

## Stage 1 (THIS commit) — core auth, backward-compatible, ZERO behavior change

Existing single-role users are unaffected: readers become set-aware but fall
back to the legacy single `app_metadata.staff_role`.

**`lib/admin/staff-role.ts`**
- Add `'legal' | 'tms'` to `StaffRole`; add to `ALL_STAFF_ROLES` and
  `OPERATIONAL_STAFF_ROLES` (both operational staff; `it` stays read-only-only).
- Add `isStaffRole()` type guard + `ROLE_PRIORITY` (leadership highest).
- Add `getStaffRoles(user): StaffRole[]` — reads `app_metadata.staff_roles`
  (array, validated, deduped, sorted by priority); falls back to
  `[staff_role]`, then `is_admin → ['leadership']`, else `[]`.
- `getStaffRole` returns the PRIMARY (highest-priority) role = `getStaffRoles()[0] ?? null`.

**`lib/admin/gate.ts`**
- `requireStaff` / `requireStaffPage`: pass if ANY of the user's roles is in
  `allowed` (`getStaffRoles().some(...)`); still return `{staffRole: primary}`.
- Re-export `getStaffRoles`.

**Exhaustive maps (keep tsc green):** add `legal`/`tms` labels to the
`Record<StaffRole,string>` maps in `StaffAdmin.tsx` and `TeamDirectory.tsx`.
Do NOT add them to `STAFF_ROLE_VALUES` (the creatable allowlist) yet — that
waits for Stage 2's migration.

**Tests:** `staff-role.test.ts` (array/fallback/is_admin/invalid-filtered/
priority/primary); extend `gate.test.ts` (any-role-match, primary returned,
single-role unchanged).

---

## Stage 2 (next) — storage + write path + migration
- `119_staff_roles_multi.sql`: add `funun_staff.staff_roles text[]` (CHECK each
  in the 7 values), backfill `staff_roles = ARRAY[staff_role]`, widen the
  `staff_role` CHECK to add `legal`/`tms` (primary copy). Owner-gated push.
- `createStaffAccount.ts`: write `app_metadata.staff_roles` + `funun_staff.staff_roles`
  in sync (keep `staff_role` = primary). Tests.

## Stage 3 — UI + endpoints
- Port `StaffAdmin.tsx` to the redesign (7 multi-select roles, contact email+phone
  mailto/tel, card/list toggle, "Filter by role" + search, manage-member menu →
  edit-roles drawer / resend / remove, pending state, light+dark tokens).
- `app/api/admin/staff/[id]/route.ts`: PATCH (roles[] + phone) and DELETE (remove),
  writing token + record in sync, guards (no self-remove, no last-leadership removal).
- Open management to `requireStaff(['leadership','tms'])` on GET/POST/PATCH/DELETE +
  the page gate. Add `legal`/`tms` to the creatable `STAFF_ROLE_VALUES`.

## Stage 4 — owner migration push + deploy (atomic) + post-deploy verification.
