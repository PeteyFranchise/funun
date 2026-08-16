# Deferred Items — Phase 31

Out-of-scope discoveries logged during plan execution (never auto-fixed —
scope boundary rule: only auto-fix issues directly caused by the current
task's changes).

## 31-05: `npm run build` fails on pre-existing, unrelated route

`npm run build` fails during "Linting and checking validity of types" with:

```
app/api/cron/daily-observability-check/route.ts
Type error: Route "app/api/cron/daily-observability-check/route.ts" does not
match the required types of a Next.js Route.
  "DOC_PATH" is not a valid Route export field.
```

This file was not touched by 31-05 (`git log -1 -- app/api/cron/daily-observability-check/route.ts`
shows it untouched at the worktree's base commit) and is unrelated to the
Selects/AI-draft/saved-searches work in this plan. `npx tsc --noEmit`
(scoped, with `.next/types` cleared) is clean for both files this plan
created (`lib/selects/ai-draft.ts`, `app/api/admin/selects/[id]/ai-draft/route.ts`,
`app/api/admin/selects/saved-searches/route.ts`) — the failure is isolated
to the cron route's `export const DOC_PATH` (a non-standard route export
Next.js 15's route-type validator rejects).

Not fixed here (out of scope). A future plan touching
`app/api/cron/daily-observability-check/route.ts` should rename `DOC_PATH`
to a non-exported constant (or move it out of the route file) to restore
a clean `npm run build`.
