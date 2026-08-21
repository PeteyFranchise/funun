---
slug: team-members-multi-role
status: incomplete
date: 2026-08-21
reason: Code complete + committed (stages 1–3 + deploy-safety trigger); owner-gated migration 119 push + deploy + verify (stage 4) remain.
---

# Team Members multi-role port — SUMMARY

Ported the approved Team Members redesign (mockup + memory `project_team_members_redesign`)
to real code as a FULL multi-role staff model. Built in stages, each an atomic
commit with tsc + lint + full-suite + build green.

## Commits
- `1b78c08` **Stage 1 — core auth** (backward-compatible, zero behavior change):
  `getStaffRoles()` + set-aware `requireStaff`/`requireStaffPage`; added `legal`/`tms`
  to `StaffRole`/`ALL`/`OPERATIONAL`; `getStaffRole` = primary. 86 call sites untouched.
- `02307db` **Stage 2 — storage + write path** + migration 119 (`funun_staff.staff_roles[]`,
  backfill, widened CHECK); `createStaffAccount` writes both stores; `primaryStaffRole`.
- `fbd3c1c` **Stage 3a — API**: POST (staff_roles[] + phone, all 7 creatable), PATCH
  (roles/phone + last-leadership guard), DELETE (self + last-leadership guards), resend;
  all gated `requireStaff(['leadership','tms'])`.
- `fc15756` **Stage 3b — UI**: `StaffAdmin` rewritten to the mockup (add flow, List/Cards,
  filter+search, ⋯ manage → edit-roles drawer / resend / remove, pending state, light+dark);
  page gate → `requireStaffPage(['leadership','tms'])`; 7 role hues in `console-theme.ts`.
- `9f9f0fb` **Deploy-safety**: BEFORE INSERT trigger backfills `staff_roles` from
  `staff_role`, so pre-redesign code can still INSERT during the migration→deploy window.

Full suite 2459/2459; tsc + lint clean; production build green.

## Stage 4 — OWNER-GATED (remaining)
Deploy ordering (migration-first is safe thanks to the trigger; the new code
REQUIRES the staff_roles column, so don't deploy the branch before the migration):
1. Owner: `supabase db push` (applies migration **119**). Safe with the current live
   code (the trigger backfills staff_roles on any old-code insert).
2. Push the branch → Vercel auto-deploys the new code.
3. Verify: as leadership, open Team Members → add a teammate with 2 roles → they show
   both pills + Pending; edit roles / phone; resend; remove (confirm). As a TMS-only
   member, confirm Team Members is reachable and manageable; as an AE, confirm it is not.

## Notes / decisions
- New roles: leadership, ae, bd, anr (existing) + **legal, tms**. Management opened to
  **leadership + tms**.
- No RLS change (gate is app-code; funun_staff is service-role-only).
- Client component value-imports role constants from `lib/admin/staff-role` (client-safe),
  not `gate.ts` (which pulls `next/headers`).
- Deferred (not blocking): last-sign-in-derived Pending is best-effort; the ⋯ menu could
  later gain "edit name/title"; the read-only Directory (`/admin/directory`) vs this
  management page merge question is still open (see the memory).
