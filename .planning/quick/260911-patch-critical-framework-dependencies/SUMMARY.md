# Patch Critical Framework Dependencies — Summary

## Outcome

Critical audit finding C2 is resolved locally. Funūn remains on the Next.js 15.5 Maintenance LTS line while moving onto the August 2026 security release, avoiding a Next.js 16 or React 19 migration.

No commit, push, deployment, database change, or production change was performed.

## Changes

- Pinned `next` from `^15.5.23` to `15.5.24`.
- Pinned the matching `eslint-config-next` package to `15.5.24`.
- Pinned Next.js's Sharp override from `0.35.3` to `0.35.4`.
- Regenerated `package-lock.json` and performed a clean `npm ci` installation.
- Preserved all uncommitted C1 invitation-claim remediation already in the worktree.

## Verification

- Installed tree: `next@15.5.24`, `eslint-config-next@15.5.24`, `sharp@0.35.4`.
- `npm audit --omit=dev --json`: pass, zero production vulnerabilities.
- `npm run typecheck`: pass.
- `npm run lint`: pass with zero warnings.
- `npm test -- --runInBand`: pass, 571 suites and 7,036 tests.
- `npm run build`: pass on Next.js 15.5.24; 151 static pages generated.
- `git diff --check`: pass.

## Residual development-tooling findings

The full `npm audit` reports 27 development-only findings: 26 high and one low, primarily through ESLint 8, Jest tooling, minimatch/brace-expansion, and js-yaml. The production audit is clean, so these do not reopen C2, but they should be handled as a separate toolchain-maintenance change rather than mixed into this framework security patch.

`npm run typecheck:strict` also continues to report the three pre-existing unused-variable findings in `__tests__/migration-186.test.ts`, `lib/deals/catalog.test.ts`, and `lib/playbook/markdown-components.tsx`. Standard typecheck, lint, tests, and build pass; no new strict-typecheck finding was introduced by this dependency-only change.

## Source decision

The official Next.js August 2026 security release identifies `15.5.24` as the patched Maintenance LTS release for two Critical vulnerabilities. The registry confirms Sharp `0.35.4` and the matching `eslint-config-next@15.5.24` package are published and compatible with the repository's current Node runtime.
