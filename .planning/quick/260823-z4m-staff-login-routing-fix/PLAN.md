---
slug: staff-login-routing-fix
description: Fix staff login routing — role-aware root redirect (keep staff/buyers off the artist side) + temporary STAFF_HOME repoint to team-members (my-client-partners crashes on prod)
date: 2026-08-23
files_modified:
  - app/page.tsx
  - lib/auth/postSignInPath.ts
---

<objective>
A Team Member (Leadership) reported two login symptoms on prod; both are code
bugs, NOT account data (pete@funun.studio verified: app_metadata.staff_role
= "leadership" + matching funun_staff row). See memory
`project_my_client_partners_crash`.

1. **"Lands on the artist side."** `app/page.tsx` (root) does an unconditional
   `redirect('/dashboard')` with no role check, so any staff member (or buyer)
   who hits the site root is dropped on the artist dashboard. `postSignInPath`
   itself is already role-correct — the root just doesn't use it. FIX: read the
   user server-side and route staff→STAFF_HOME, buyer→BUYER_HOME; leave artists
   on `/dashboard` unchanged (minimal blast radius — do NOT switch artists to
   DEFAULT_HOME=/vault).

2. **Staff sign-in walks into a crash.** `postSignInPath` correctly sends staff
   to STAFF_HOME = `/admin/my-client-partners`, which throws on prod (root cause
   still needs the Vercel/Sentry digest). INTERIM FIX: repoint STAFF_HOME to
   `/admin/team-members` (a known-good all-staff page) so staff can actually get
   in. Mark it TEMPORARY — repoint back once the crash is root-caused.

No tests reference STAFF_HOME / postSignInPath. Verify tsc + lint + jest +
next build (stop the dev server first). Two atomic commits, then FF `main`.
NEVER touch `.claude/launch.json`.
</objective>
