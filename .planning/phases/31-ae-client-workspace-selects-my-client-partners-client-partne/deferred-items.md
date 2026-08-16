# Deferred Items — Phase 31

Out-of-scope discoveries logged per the executor's scope-boundary rule (not fixed by this plan's executor).

## 31-04

- **`npm run build` fails on `app/api/cron/daily-observability-check/route.ts`** ("DOC_PATH" is not a valid Route export field) — pre-existing at this worktree's base commit (`e87168204e250912da9158404821bbefea7bf275`), introduced by Phase 32-05 (`68f0258`), entirely unrelated to any file this plan touches. `npx tsc --noEmit` is clean for all of 31-04's files. Not fixed here (out of scope — Phase 32's concern).
