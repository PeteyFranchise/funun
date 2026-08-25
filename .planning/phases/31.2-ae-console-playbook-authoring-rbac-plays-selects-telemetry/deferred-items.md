# Deferred items — 31.2

## `npm run build`'s ESLint step fails on a pre-existing, unrelated file

**Found during:** 31.2-10, final verification pass (`npm run build`).

**Issue:** `next build`'s lint step fails with:
```
./lib/client-partners/health.test.ts
217:5  Error: Definition for rule '@typescript-eslint/no-var-requires' was not found.  @typescript-eslint/no-var-requires
```

**Scope:** Out of scope for 31.2-10 (Rule scope boundary) — `lib/client-partners/health.test.ts` was last touched by 31.1 work (commit `53e8e9a`), months before this plan; not a file this plan reads, writes, or depends on. `next build`'s own webpack compile step succeeds ("Compiled successfully in 49s"); only the separate ESLint pass fails, which is an ESLint plugin/config mismatch (a rule the project's `eslint-config-next` no longer registers), not a code defect introduced by any 31.2 plan.

**Not fixed here.** Whoever picks this up next should check whether `@typescript-eslint/eslint-plugin`'s installed version still ships `no-var-requires` (it was merged into `no-require-imports` in some v6+ releases) and either update the rule name in whatever config references it, or remove the now-dead rule reference.
