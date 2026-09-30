# Quick Task 260930-ktv: Clear the npm audit advisories blocking CI - Context

**Gathered:** 2026-09-30
**Urgency:** this blocks **every** PR, including #123.

<domain>
## Task Boundary

`npm audit --omit=dev --audit-level=moderate` — a required step of CI's `validate`
job — now fails on `main` and therefore on every branch cut from it. Five advisories,
all in pre-existing transitive dependencies, all **published within the last few hours**:
the same lockfile passed six merges earlier today.

Confirmed on `main` (not just on a feature branch): `5 vulnerabilities (1 low, 3
moderate, 1 high)`.

Raise the three packages to their already-published patch releases. Nothing else.

</domain>

<decisions>
## The three packages, and the exact fixed versions

Verified against the registry 2026-09-30. **All three fixes are patch releases** — no
major or minor bumps, no API surface change:

| package | lock has | vulnerable range | fixed version | severity |
|---|---|---|---|---|
| `brace-expansion` | **5.0.9** (×9 nested copies) | 4.0.0 – 5.0.11 | **5.0.12** | high + moderate (3 DoS advisories) |
| `dompurify` | **3.4.15** | 3.4.13 – 3.4.15 | **3.4.16** | low (DOM XSS via IN_PLACE hook) |
| `fast-uri` | **3.1.7** | 3.0.0 – 3.1.7 | **3.1.8** | moderate (host case normalization) |

### ⚠️ The `fast-uri` override currently pins the vulnerable version

`package.json` already has `"overrides": { "fast-uri": "3.1.7" }`. The advisory range is
**inclusive of 3.1.7**, so that override is now pinning a known-vulnerable version. It
must be raised to `3.1.8`.

**Do NOT jump to `fast-uri` 4.x** (latest is 4.2.1). That is a major bump and out of
scope for a security patch; `3.1.8` clears the advisory.

### ⚠️ `brace-expansion` needs a version-scoped override, not a blanket one

The tree legitimately contains 1.x, 2.x and 5.x copies. Only the **5.0.9** instances are
vulnerable; `node_modules/brace-expansion` at 1.1.18 and the 2.1.4 copies are fine and
must not be forced to 5.x.

The repo already uses scoped overrides for exactly this package:

```json
"minimatch@3.1.5": { "brace-expansion": "1.1.18" },
"minimatch@9.0.9": { "brace-expansion": "2.1.4" }
```

Follow that established pattern. The 5.0.9 copies arrive via `@jest/core`,
`@jest/reporters`, `@sentry/bundler-plugin-core`, `@sentry/bundler-plugins`,
`@typescript-eslint/typescript-estree`, `jest-cli`, `jest-runtime`, `readdir-glob` and
`test-exclude` — so a per-parent override list would be long and brittle. A
**version-selector override** (`"brace-expansion@5": "5.0.12"` or an equivalent npm
override selector) is preferable if it resolves correctly; verify it does rather than
assuming, and fall back to per-parent entries if not.

### Why `npm audit fix` alone is not the answer

It was tried: `npm audit fix --package-lock-only` changes ~30 lines of the lock and the
advisories **still do not clear**, because the existing `overrides` block pins some of
these packages. The overrides are the source of truth here and must be edited directly.

</decisions>

<specifics>
## Specific Ideas

**Branch `clear-audit-advisories` is already created and checked out** from `origin/main`.

**Scope is the lock and the overrides block. Nothing else.** No application code, no
new dependencies, no version bumps beyond these three, no `npm audit fix --force`.

**The risk here is not the bump, it is a silent tooling break.** These packages sit
under jest, eslint, typescript-eslint and the Sentry bundler plugin. A bad resolution
would not show up as a failed audit — it would show up as tests or lint behaving
differently. So the gate that matters most is the **full test suite and lint**, not the
audit command.

Do NOT install anything new. Do not add a dependency to "fix" this.

**Verification Gate** per `.claude/CLAUDE.md` — every step CI's `validate` job runs, and
here all six genuinely matter:

```
npm run security:migrations:verify
npm run typecheck:strict
npm run lint
npm test -- --runInBand
npm audit --omit=dev --audit-level=moderate
npm audit --audit-level=high
```

The last two must go from failing to **passing** — that is the whole point of the task.
The middle three must be **unchanged**: same suite count, same pass count, lint still
clean. Record the before/after test counts explicitly; a drop is a regression even if
everything still "passes".

`npm run build` is FORBIDDEN (live dev server on :3000). `main` is protected — ship
through a PR. Never `git add -A`.

**PR body must state:** that this is a pre-existing repo-wide break, not caused by any
feature branch (the same lockfile passed six merges earlier today); the three exact
version changes; that the `fast-uri` override was itself pinning the vulnerable version;
the before/after audit counts; and the before/after test suite and test counts as
evidence nothing regressed.

</specifics>

<canonical_refs>
## Canonical References

- `package.json` — the `overrides` block, including the stale `fast-uri: 3.1.7` pin
- `package-lock.json` — what `npm audit` actually reads
- `.github/workflows/quality.yml` — the `validate` job whose audit steps are failing
- `.claude/CLAUDE.md` — Verification Gate, branch protection
- PR #123 (`marketing-page-at-root`) — blocked by this; unblocks when this merges

</canonical_refs>
