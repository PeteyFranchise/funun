---
quick_id: 260806-wqr
slug: login-routing
date: 2026-08-07
type: quick
tags: [auth, staff-rbac, routing, security]
---

# Quick Task: 25-11 — Role-aware post-sign-in routing (login-routing Option A)

## Goal

After a successful sign-in, route Funūn staff to the admin surface and everyone else to the Sound Vault, while honoring an explicit same-origin `?next=` deep link. The agreed Phase 25 fast-follow (Option A: staff → `/admin`, others → default).

## Approach

1. Extract the pure `getStaffRole` / `StaffRole` / `ALL_STAFF_ROLES` from `lib/admin/gate.ts` (which imports server-only `createApiClient`) into a new client-safe `lib/admin/staff-role.ts`; re-export `getStaffRole` / `StaffRole` from `gate.ts` so every existing importer is unaffected.
2. Add a pure, unit-tested `postSignInPath({ user, next })` in `lib/auth/postSignInPath.ts`: an explicit same-origin `next` wins; else staff → `/admin/my-client-partners` (there is NO `/admin` index — it 404s), else → `/vault`. Includes an open-redirect guard rejecting absolute / protocol-relative `next`.
3. Wire it into `app/(auth)/signin/page.tsx` (replace the raw `router.push(next)`).

## Verification

- `lib/auth/postSignInPath.test.ts` — role routing, is_admin fallback, `next` precedence, open-redirect guard.
- `lib/admin/gate.test.ts` still green (re-export keeps importers working).
- tsc + lint clean; `npm run build` clean (client bundle proves no server-only leak into the sign-in page); full suite green.
