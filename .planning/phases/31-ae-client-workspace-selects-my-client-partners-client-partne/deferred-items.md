# Deferred Items — Phase 31 (AE Client Workspace + Selects)

Out-of-scope discoveries found during plan execution, logged per the executor's
scope-boundary rule (not fixed — pre-existing, unrelated to the plan that found them).

## 31-07: `npm run build` fails on an unrelated pre-existing route (Phase 32-05)

- **Found during:** 31-07 Task 2 verification (`npm run build`).
- **File:** `app/api/cron/daily-observability-check/route.ts`
- **Error:**
  ```
  Type error: Route "app/api/cron/daily-observability-check/route.ts" does not
  match the required types of a Next.js Route.
    "DOC_PATH" is not a valid Route export field.
  ```
- **Origin:** commit `68f0258` — `feat(32-05): daily observability cron (R10 automated)`.
  Confirmed present at the 31-07 worktree's base commit (`e871682`), before any
  Phase 31 changes — not introduced or touched by this plan (`31-07` only
  modifies `lib/crate-requests/ranking.ts`, `lib/crate-requests/ranking.test.ts`,
  `app/api/admin/crate-requests/route.ts`).
- **Why not fixed here:** out of scope per the executor's scope-boundary rule —
  this file belongs to Phase 32's observability work, not Phase 31's AE
  workspace/Selects work. Fixing it would touch a file outside this plan's
  `files_modified` list and outside its review/verification context.
- **Verification used instead for 31-07:** `npx tsc --noEmit` (project-wide,
  clean) + `npx jest lib/crate-requests/ranking.test.ts` (14/14 green) +
  `grep -q "rankCrateRequests" app/api/admin/crate-requests/route.ts` (confirmed).
  Next.js's build-time route-export-shape check (which only runs inside
  `next build`, not plain `tsc`) is the one check this plan's own files could
  not independently prove green, purely because the unrelated cron route fails
  first and aborts the whole build.
- **Suggested follow-up:** rename `DOC_PATH` to a non-exported local constant
  (or move it into a `lib/observability/` module) in
  `app/api/cron/daily-observability-check/route.ts` — Next.js route files may
  only export the HTTP method handlers plus a small allow-listed set of config
  fields (`dynamic`, `runtime`, etc.); any other named export is rejected by
  the App Router's route-type validation. Owned by whoever resumes Phase 32.
