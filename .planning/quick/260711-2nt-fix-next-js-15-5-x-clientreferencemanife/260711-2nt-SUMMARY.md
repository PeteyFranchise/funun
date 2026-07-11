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

## Fix — iteration 1 (insufficient, reverted)
- New `components/admin/ManifestBoundary.tsx` — no-op `'use client'` component.
- Rendered alongside `{children}` in `app/(admin)/layout.tsx`.
- **Result:** Vercel Preview build failed identically. Confirmed locally that this bug DOES
  reproduce (contrary to initial assumption) — `.next/server/app/(admin)/page_client-reference-manifest.js`
  was still absent from the local build output even with the layout-level fix, and even after a
  second attempt placing a runtime-gated client reference directly inside `page.tsx`. Next
  generates a manifest per page, not per layout subtree, so neither workaround touched the page
  actually missing one.

## Fix — iteration 2 (root cause, actual fix)
Investigating why `app/(admin)/page.tsx` specifically never got a manifest (even with a direct,
non-tree-shakeable client reference) surfaced the real root cause: **`app/(admin)/page.tsx` and
`app/page.tsx` both resolve to the same URL, `/`** — route groups don't add a URL segment. Next.js
does not hard-error on this collision; it silently resolves in favor of `app/page.tsx` (confirmed:
`/` in the build output is unchanged, still served by the real root page). `app/(admin)/page.tsx`
was orphaned, unreachable dead code, excluded from the real route manifest — which is exactly why
Next never wrote its `client-reference-manifest.js`, while Vercel's build still expects that file
for every `page.tsx` found on disk.

**Fix:** delete `app/(admin)/page.tsx` entirely (zero behavior change — it could never have been
reached in production). Reverted the now-unnecessary `ManifestBoundary` component and layout
wiring from iteration 1.

## Verification
- `npx tsc --noEmit` — clean.
- `npm run build` — exit 0.
- **Stronger local proof this time:** inspected `.next/server/app/(admin)/` directly — every
  remaining page (`tips`, `checklist`, `admin/curators`, `admin/members`) has its manifest; no
  orphaned page remains to be missing one.
- Real confirmation is still the Vercel Preview check on PR #28 (2nd commit) — being watched.

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
