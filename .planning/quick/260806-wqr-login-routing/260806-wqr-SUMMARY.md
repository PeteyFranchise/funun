---
quick_id: 260806-wqr
slug: login-routing
status: complete
completed: 2026-08-07
tags: [auth, staff-rbac, routing, security]
---

# Quick Task Summary: 25-11 — Role-aware post-sign-in routing

Shipped the Phase 25 login-routing fast-follow (Option A). After sign-in, staff land on the admin surface and everyone else on the Sound Vault, with an explicit same-origin `?next=` deep link taking precedence. Also closed an incidental open-redirect in the old raw `router.push(next)`.

## Files

- **`lib/admin/staff-role.ts`** (NEW) — client-safe `getStaffRole` / `StaffRole` / `ALL_STAFF_ROLES`, pure (no server imports).
- **`lib/admin/gate.ts`** — imports + re-exports `getStaffRole` / `StaffRole` from `./staff-role`; the moved definitions are removed. `requireStaff` / `verifyAdmin` / `EDITABLE_FIELDS` etc. unchanged. All ~8 existing `@/lib/admin/gate` importers keep working via the re-export.
- **`lib/auth/postSignInPath.ts`** (NEW) — pure resolver + `safeNext` open-redirect guard.
- **`lib/auth/postSignInPath.test.ts`** (NEW) — 6 tests.
- **`app/(auth)/signin/page.tsx`** — `router.push(postSignInPath({ user: data.user, next }))`.

## Behavior

- staff (`leadership` / `ae` / `bd`, or the `is_admin=true` leadership fallback) → `/admin/my-client-partners`
- everyone else / null user → `/vault`
- explicit same-origin `?next=` → honored (wins, even for staff)
- off-site `next` (absolute URL, protocol-relative `//host`, `javascript:`) → rejected → role default (closes an open-redirect the prior raw `router.push(next)` allowed)

## Verification

- `lib/auth/postSignInPath.test.ts` 6/6; `lib/admin/gate.test.ts` 13/13.
- `npx tsc --noEmit` clean; `eslint --max-warnings=0` clean on all touched files.
- `npm run build` clean — the client sign-in bundle compiles without pulling server-only code (the reason `getStaffRole` was extracted).
- Full suite: 129 suites / 1553 tests green.

## Note

No `/admin` index page exists (`GET /admin` 404s), so staff are routed to `/admin/my-client-partners`. The live browser check (sign in as a staff account vs an artist and confirm the landing) needs real credentials, so it's left to the owner — the routing logic itself is unit-covered.
