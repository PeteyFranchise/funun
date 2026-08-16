# Deferred Items — Phase 31

Out-of-scope discoveries logged per the executor's scope-boundary rule (not fixed by this plan's executor).

## 31-04

- **`npm run build` fails on `app/api/cron/daily-observability-check/route.ts`** ("DOC_PATH" is not a valid Route export field) and, transitively via the same generated-route-type mechanism, **`app/api/health/route.ts`** ("SUPABASE_CHECK_TIMEOUT_MS" is not a valid Route export field) — both pre-existing at this worktree's base commit (`e87168204e250912da9158404821bbefea7bf275`; the cron one introduced by Phase 32-05, `68f0258`), entirely unrelated to any file this plan touches. Both route files export a non-handler constant alongside their HTTP method handlers, which Next.js 15's route-type validation rejects. `npx tsc --noEmit` is clean for all of 31-04's files (confirmed clean both before and after running `npm run build`, once the resulting `.next/` build artifacts — gitignored, never committed — are removed). Not fixed here (out of scope — Phase 32's concern).
