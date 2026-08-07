# Phase 17 — Deferred Items

Out-of-scope discoveries logged during execution. Not fixed by the plan
that found them (SCOPE BOUNDARY: only auto-fix issues directly caused by
the current task's changes).

## `npm run build` fails on `app/(artist)/contracts/page.tsx`

**Found during:** 17-06 Task 3 (production build verification)
**Introduced by:** `b349e5a feat(17-05): Contract Locker standalone (projectless) document query`
**Status:** pre-existing, untouched by 17-06

```
app/(artist)/contracts/page.tsx
Type error: Page "app/(artist)/contracts/page.tsx" does not match the required
types of a Next.js Page.
  "mergeContractRows" is not a valid Page export field.
```

A Next.js `page.tsx` may only export a default component plus a fixed set
of route-segment config fields (`dynamic`, `revalidate`, `metadata`, …).
`mergeContractRows` is a helper exported from the page module, which
`next build` rejects.

Note on why this hid for a whole plan cycle: `npx tsc --noEmit` accepts
the source and reports nothing. The constraint is enforced by types
Next.js GENERATES into `.next/types/app/(artist)/contracts/page.ts`
during `next build`. So on a clean checkout the TS and lint gates are
both green and only `npm run build` is red — and once a build has run,
the same error starts appearing in `tsc --noEmit` too (it now sees the
generated file), which can read misleadingly like a fresh regression from
whatever plan happens to be running. Deleting `.next/types` restores a
clean `tsc`.

**Likely fix:** move `mergeContractRows` into `lib/contracts/` (or a
sibling non-page module) and import it from the page. Worth checking
whether it is exported only for its own test, which would make the move
straightforward.

**Impact:** `npm run build` cannot currently complete, so no plan in this
phase can verify production bundling end-to-end. Webpack compilation
itself succeeds (`✓ Compiled successfully`) — the failure is in the
later type-validation pass — so bundling of new client dependencies
(e.g. 17-06's `@docuseal/react`) is still confirmed by that stage.
