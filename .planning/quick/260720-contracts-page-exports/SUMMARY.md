---
status: complete
date: 2026-07-20
slug: contracts-page-exports
---

# Quick task: unblock `npm run build`

## Problem

`app/(artist)/contracts/page.tsx` exported `mergeContractRows` and `fetchContractRows` alongside its default component. A Next.js 15 page module may only export a fixed set of names, so `next build` failed with a page-type error.

Shipped in 17-05 (`b349e5a`). It went unnoticed because it surfaces only through build-generated `.next/types` — `tsc --noEmit` on a clean tree passes, and the error appears only after a build has run, at which point it looks like a fresh regression from whatever plan is currently in flight.

**Why it was urgent:** a failing build cannot deploy; no deploy means no public webhook URL; no webhook URL means DocuSeal cannot deliver `submission.completed`. Phase 17's blocking human checkpoint (17-07 Task 3) was therefore unreachable. Two misplaced exports blocked the entire live verification.

## Fix

Moved the whole data layer to `lib/contracts/locker-rows.ts`: `DOC_LABELS`, `DocRow`, `Proj`, `splitPicture`, `detailFor`, `rowsFromProjects`, `standaloneRow`, `mergeContractRows`, `fetchContractRows`.

The page now exports only `dynamic` and `default`. Behaviour is unchanged — the moved code is byte-identical apart from adding `export` to the previously file-private helpers.

`__tests__/contracts-standalone-docs.test.ts` repointed to the new module. The helpers were only ever exported from the page so they could be unit-tested; a lib module is where they belonged.

## Verification

- `npm run build` — **succeeds** (was failing)
- `npx tsc --noEmit` clean BEFORE and AFTER a build, so `.next/types` no longer contaminates the typecheck
- `npm run lint` clean
- `npm test` — 71 suites / 831 tests, unchanged from baseline
- `__tests__/contracts-standalone-docs.test.ts` — 3/3 against the new import path

## Follow-up worth considering

No lint rule prevents a page module from exporting arbitrary names, so this can recur silently. A CI step running `npm run build`, or an ESLint restriction on page-module exports, would catch it at the point of introduction rather than three plans later.
