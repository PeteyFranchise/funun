---
slug: staff-login-routing-fix
status: complete
date: 2026-08-23
commits:
  - 8e9c1d5 fix(auth): make the root redirect role-aware
  - 0852531 fix(auth): temporarily land staff on Team Members
files_modified:
  - app/page.tsx
  - lib/auth/postSignInPath.ts
---

# Staff login routing fix — SUMMARY

Fast-follow to `260806-wqr-login-routing`. A Leadership Team Member could not
reach the staff side on prod. Diagnosed as two code bugs — the account was
verified correct (`pete@funun.studio`: `app_metadata.staff_role = "leadership"`
+ matching `funun_staff` row).

## What shipped

1. **Role-aware root redirect** (`8e9c1d5`, `app/page.tsx`) — the root now reads
   the user server-side and routes staff → `STAFF_HOME`, buyers → `BUYER_HOME`;
   artists stay on `/dashboard`. Previously it sent *everyone* to `/dashboard`,
   dropping staff/buyers on the artist side.
2. **Temporary `STAFF_HOME` repoint** (`0852531`, `lib/auth/postSignInPath.ts`)
   — from the crashing `/admin/my-client-partners` to the known-good
   `/admin/team-members`, so staff sign-in no longer lands on the crash.

## Verification
`tsc` OK · `lint` OK · `jest` 2519 passed · `next build` EXIT 0 (dev server
stopped first). No tests reference `STAFF_HOME`/`postSignInPath`.

## Deploy
Fast-forwarded to `main` with this batch (production = `main`).

## Follow-ups (out of scope here)
- **Root-cause the `/admin/my-client-partners` crash**, then repoint `STAFF_HOME`
  back. Needs the Vercel/Sentry error — the `(admin)/error.tsx` boundary shows a
  `digest` to map. See memory `project_my_client_partners_crash`.
- Optional: fully unify the root with `postSignInPath` (would move artists
  `/dashboard` → `/vault`). Deliberately NOT done — minimal blast radius.
