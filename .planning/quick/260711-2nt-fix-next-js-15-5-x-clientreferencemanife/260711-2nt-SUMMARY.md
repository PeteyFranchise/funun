---
quick_id: 260711-2nt
description: Fix Next.js 15.5.x clientReferenceManifest build regression for server-only (admin) route group
date: 2026-07-11
status: complete
commits:
  - fix-admin-manifest-regression branch (PR #28) — add ManifestBoundary + wire into (admin) layout
---

# Quick Task 260711-2nt — Summary

## What was done

Diagnosed and fixed the root cause of every Vercel deployment failing across the project
(Preview and Production, weeks of history, unrelated to any feature branch). Confirmed as
[vercel/next.js#93862](https://github.com/vercel/next.js/issues/93862): a Next.js 15.5.x
regression where a route tree with zero `'use client'` boundaries never gets its
`page_client-reference-manifest.js` written, but Next's output-file-tracing step still expects
it and crashes with `ENOENT`.

`app/(admin)/page.tsx` (bare `redirect('/admin/checklist')`) and `app/(admin)/layout.tsx` had
no client-component boundary anywhere — exactly the trigger shape.

## Diagnostic process (for the record)
1. Ruled out env-var misconfiguration (initially suspected; confirmed real but separate issue —
   `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` were Production-scoped only, fixed
   by widening to include Preview — necessary but not sufficient).
2. Ruled out stale build cache — reproduced identically with cache fully cleared via Vercel's
   "Redeploy without cache" option.
3. Ruled out a Vercel platform incident — checked vercel-status.com, all systems operational.
4. Ruled out Next.js version drift between local and Vercel — `package-lock.json` and local
   `node_modules` both resolve to `next@15.5.19` (in sync).
5. Confirmed via Vercel build logs — the `Error: ENOENT ... app/(admin)/page_client-reference-manifest.js`
   failure occurred identically on 2 separate deployment attempts (with and without cache).
6. Matched the failure to vercel/next.js#93862 via web search — exact error string, exact route
   shape (server-only page, no client boundary).

## Fix
- New `components/admin/ManifestBoundary.tsx` — no-op `'use client'` component, renders `null`.
- Rendered alongside `{children}` in `app/(admin)/layout.tsx` — gives the whole `(admin)` route
  group (`/`, `/admin/checklist`, `/admin/members`, `/admin/curators`, `/tips`) a real
  client-component boundary, not just the one page that surfaced the bug.

## Verification
- `npx tsc --noEmit` — clean.
- `npm run build` — exit 0, all `/admin/*` routes present in output, no ENOENT.
- Note: this bug never reproduced locally (Vercel-environment-specific), so a clean local build
  does not fully prove the fix — the real test is the Vercel Preview check on PR #28, being
  watched separately.

## Deliverable
[PR #28](https://github.com/PeteyFranchise/funun/pull/28) — `fix-admin-manifest-regression`
branch off `origin/main`. 2 files changed (1 new, 1 edited). No dependency changes.

## Out of scope (untouched)
- No `package.json`/`package-lock.json` changes.
- No phase-15 files or `auth-password-reset-flow` branch files touched — separate PR, separate
  branch, isolated worktree used throughout.

## Related — same session
- [PR #27](https://github.com/PeteyFranchise/funun/pull/27) (password-reset flow) has been
  blocked by this exact same regression. Once this PR merges and a clean build is confirmed,
  PR #27 (and PR #26, phase 14) should also go green without further changes.
