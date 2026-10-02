---
phase: 261001-ngc-nonce-guard-case-insensitive
plan: 01
subsystem: marketing
tags: [security, csp, nonce, regex, codeql-sibling]
dependency-graph:
  requires: []
  provides:
    - "injectNonce: case-insensitive <script> tag detection with case-sensitive nonce value comparison"
  affects:
    - app/marketing-document/route.ts (sole runtime caller of injectNonce)
tech-stack:
  added: []
  patterns:
    - "single-scan guard: one regex exec loop produces both counts that must agree, instead of two independently-constructed regexes"
    - "lookahead tag-name boundary (?=[\\s/>]) to avoid matching <scriptfoo> as a script tag"
key-files:
  created: []
  modified:
    - lib/marketing/nonceInjection.ts
    - __tests__/marketing-root-route.test.ts
decisions:
  - "Rejected bare `i` flag on the nonce-match RegExp: it would make the nonce VALUE comparison case-insensitive too, reintroducing an equally unreachable-but-wrong gap. Chose case-insensitive tag-name match + case-sensitive startsWith on the nonce value instead."
  - "Adopted the <scriptfoo> word-boundary lookahead on merit (precedent: build-marketing-artifact.ts:848 already requires it) even though that direction was always fail-closed, never a security hole -- free to fix in a single scan."
  - "Declared the tag regex inside injectNonce (not module scope) to avoid a shared /g lastIndex leaking across the one-call-per-request usage."
  - "Deleted escapeRegExp: the fix uses a plain string comparison, so there is no pattern left to inject into, and the dead function would fail typecheck:strict/lint."
metrics:
  duration: "~35 minutes"
  completed: 2026-10-01
status: complete
---

# Quick Task 261001-ngc: Nonce guard case-insensitive tag counting Summary

Fixed `injectNonce`'s runtime CSP nonce guard, which failed OPEN on uppercase/mixed-case `<script>` tags because both of its tag-matching regexes were case-sensitive and therefore blind to the same tags in the same way — replaced the two-regex comparison with a single case-insensitive scan that keeps the nonce VALUE comparison case-sensitive.

## What Was Built

`lib/marketing/nonceInjection.ts`'s `injectNonce()` previously computed two separate counts to detect un-nonced inline scripts: a raw `<script` tag count (`/<script/g`, no `i` flag) and a nonced-tag count (`new RegExp(`<script nonce="${escapeRegExp(nonce)}"`, 'g')`, also no `i` flag). An uppercase or mixed-case tag (`<SCRIPT>`, `<Script>`) was invisible to both regexes equally, so the counts still agreed with each other while disagreeing with the actual document — the function returned success with an un-nonced script present. This was a sibling of the CodeQL `js/bad-tag-filter` finding already fixed in `build-marketing-artifact.ts` (PR #131), found by sweeping for siblings of that pattern rather than widening the already-reviewed PR.

The fix replaces both regexes with a single `exec` loop over one case-insensitive tag-matching regex (`/<script(?=[\s/>])/gi`), declared inside the function (not module scope, to avoid a shared `/g` `lastIndex` leaking across the one-call-per-request usage from `app/marketing-document/route.ts:74`). For each matched tag, the code checks whether the literal, case-sensitive string `" nonce=\"<nonce>\""` immediately follows — a plain `startsWith` check, not a regex, so the nonce (a secret) is never compared case-insensitively. The lookahead requires `<script` to be followed by whitespace, `/`, or `>`, so `<scriptfoo>` is correctly excluded from the tag count (previously a spurious fail-closed miscount — never a hole, but an inaccuracy fixed for free in the same pass).

`escapeRegExp` (the helper that previously escaped the nonce for safe interpolation into a RegExp) is deleted — the new logic does a plain string comparison, so there is no pattern left to inject a hostile nonce into, and the dead function would otherwise fail `typecheck:strict` (`--noUnusedLocals`) and `lint` (`--max-warnings=0`).

No change to `scripts/build-marketing-artifact.ts`, `scripts/verify-marketing-artifact.ts`, or `assets/marketing/landing.html`. No re-freeze.

## RED Run (Task 1)

Six new test cases added to a new `describe('injectNonce — tag casing (sibling of CodeQL js/bad-tag-filter)')` block in `__tests__/marketing-root-route.test.ts`, immediately after the existing 7-test `injectNonce` block (`:60-117`), mirroring the style of the precedent block at `scripts/marketing-artifact.test.ts:741`.

`npx jest __tests__/marketing-root-route.test.ts --runInBand --json`:

```
Test Suites: 1 failed, 1 total
Tests:       3 failed, 20 passed, 23 total
```

The 3 failing tests (captured from the jest JSON, before the fix):
- `throws when an uppercase <SCRIPT> tag is present unnonced alongside a correctly nonced lowercase script` — expected `/carry the nonce/` to throw; received function did not throw.
- `throws when a mixed-case <Script> tag is present unnonced alongside a correctly nonced lowercase script` — same failure mode.
- `does not throw for a <scriptfoo> element alongside one correctly nonced script` — expected not to throw; it threw `injectNonce: 2 <script> tag(s) present but only 1 carry the nonce`.

These 3 are exactly R1/R2/R3 from the plan — the uppercase case, the mixed-case case, and the `<scriptfoo>` boundary case. The other 3 new cases (G1, G2, and the G3 note) plus the 7 pre-existing `injectNonce` tests were all already passing (20 total), as expected for over-correction guards and unmodified prior coverage.

This RED evidence was committed alone, staging only `__tests__/marketing-root-route.test.ts`:
`11224b95 test(marketing): RED -- uppercase script slips past the runtime nonce guard`

## GREEN Run (Task 2)

After rewriting `lib/marketing/nonceInjection.ts`:

```
Test Suites: 1 passed, 1 total
Tests:       23 passed, 23 total
```

`numPassedTests` strictly increased (RED: 20 passed → GREEN: 23 passed), `numFailedTests` is 0. The fix is proven by a flip, not asserted.

The discriminating case (G2) — `still throws when a tag carries a case-variant of the nonce VALUE rather than the real nonce` — passes both before and after the fix, confirming the chosen single-scan design (case-sensitive `startsWith` on the nonce value) rather than the rejected bare-`i`-flag fix, which would have let `nonce="ABC123NONCE"` satisfy nonce `abc123nonce`.

This fix was committed alone, staging only `lib/marketing/nonceInjection.ts`:
`aa8bbdc9 fix(marketing): make injectNonce's script-tag count case-insensitive`

## Scope Check

```
git diff --name-only origin/main -- lib scripts assets app components middleware.ts package.json package-lock.json
```
→ `lib/marketing/nonceInjection.ts` (exactly one file; builder, verifier, artifact, and dependency manifests untouched).

## Artifact Integrity

`shasum -a 256 assets/marketing/landing.html` → `598ab38a96b95367b3375ae58e97072575b4ce37980fbccb014b244a494a68fa` — matches the pinned sha exactly. No re-freeze occurred or was needed.

`npm run marketing:verify` → `verify ok — assets/marketing/landing.html passes all checks` (unweakened cross-check, `scripts/verify-marketing-artifact.ts` untouched).

## Full Verification Gate (all six, no substitutions)

1. `npm run security:migrations:verify` → `PASS: migrations 214–218 are transactional, collision-sensitive, least-privilege, checksum-pinned, and covered by read-only probes.`
2. `npm run typecheck:strict` (`tsc --noEmit --noUnusedLocals --noUnusedParameters`) → clean, no output (confirms `escapeRegExp` deletion left no unused symbol and the `RegExpExecArray | null` exec loop typechecks under strict).
3. `npm run lint` (`eslint . --max-warnings=0`) → clean (only a tool-level ESLintRC deprecation notice, zero lint warnings/errors).
4. `npm test -- --runInBand` → `Test Suites: 638 passed, 638 total` / `Tests: 7963 passed, 7963 total`.
5. `npm audit --omit=dev --audit-level=moderate` → `found 0 vulnerabilities`.
6. `npm audit --audit-level=high` → `found 0 vulnerabilities`.

`npm run build` was intentionally NOT run (dev server active on :3000; not part of CI's `validate` job per CLAUDE.md).

## Deviations from Plan

None — plan executed exactly as written. The design decision (single scan, case-insensitive tag name, case-sensitive nonce value, `<scriptfoo>` boundary adopted, `escapeRegExp` deleted, regex declared inside the function) was already fully specified in the plan's `<design_decision>` block and followed verbatim.

## Known Stubs

None.

## Threat Flags

None. All five threats in the plan's `<threat_model>` (T-ngc-01 through T-ngc-05, plus the accepted T-ngc-SC) were mitigated exactly as planned; no new security-relevant surface was introduced. No package-manager installs occurred in this change.

## Self-Check: PASSED

- `lib/marketing/nonceInjection.ts` exists and contains the single-scan fix (verified by reading the file post-edit).
- `__tests__/marketing-root-route.test.ts` exists and contains the new casing block (23 tests total, confirmed by the GREEN jest run).
- Commit `11224b95` (RED) found in `git log --oneline`.
- Commit `aa8bbdc9` (GREEN) found in `git log --oneline`.
- `escapeRegExp` confirmed absent from `lib/marketing/nonceInjection.ts` (`grep` exit code 1).
- The five pre-existing untracked `.planning/reviews/` + `.planning/todos/pending/` files remain untracked (not staged by either commit).

All self-check commands re-run live and confirmed: both files present, both commit hashes present in `git log --oneline --all`, five pre-existing untracked `.planning/` files still untracked (plus this task's own `.planning/quick/261001-ngc-.../` directory, which stays untracked per the quick-task convention — the orchestrator commits docs separately).
