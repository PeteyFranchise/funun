# Deferred Items — Phase 31

Out-of-scope discoveries logged during execution (Scope Boundary rule — not
fixed, only documented).

## 31-06: `npm run build` fails on pre-existing, unrelated Phase 32 files

**Found during:** Plan 31-06, Task 1 acceptance-criteria verification.

**Issue:** `npm run build` fails at the Next.js "Linting and checking
validity of types" step with:

```
app/api/cron/daily-observability-check/route.ts
Type error: Route "app/api/cron/daily-observability-check/route.ts" does not match the required types of a Next.js Route.
  "DOC_PATH" is not a valid Route export field.
```

`app/api/health/route.ts` has the identical problem (`SUPABASE_CHECK_TIMEOUT_MS`
export). Both files export a non-standard top-level `const` from a
`route.ts` file, which Next.js 15's typed-route validation rejects during
`next build`'s own type-check pass (this is NOT caught by plain
`tsc --noEmit`, which stays clean).

**Evidence this is pre-existing and unrelated to 31-06:**
- `git log` shows both files introduced by already-merged Phase 32 commits
  (`68f0258 feat(32-05)`, `32d2d6a feat(32-03)`), present in this worktree's
  base commit before any Phase 31 Plan 06 work started.
- `git status --short` at the time of discovery shows only this plan's two
  net-new paths (`lib/client-partners/`, `app/api/admin/client-partners/`)
  as untracked — no Phase 32 files were touched.
- `npx tsc --noEmit` is clean both before and after this plan's changes
  (verified with `.next/types` cleared to rule out stale-cache noise).

**Action:** Not fixed (out of scope — Phase 32 owns those files). Flagging
here per the Scope Boundary rule. `npm run build`'s failure is pre-existing
and not caused by this plan; Plan 31-06's own acceptance criteria (jest +
`tsc --noEmit`) are green.
