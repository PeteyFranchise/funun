---
type: quick
quick_id: 260926-w7o
slug: call-it-sound-vault-everywhere-a-member-reads-it
status: complete
completed: 2026-09-26
branch: sound-vault-naming
base: origin/main @ 3499f7f2
commits:
  - 821b3cf9 test(sound-vault-naming): add drift guard for bare "vault" copy
  - f2074d2c fix(copy): say Sound Vault, not bare vault, in member-facing strings
---

# Call it Sound Vault everywhere a member reads it — Summary

Renamed bare "vault" to "Sound Vault" in all 14 member-facing strings identified by
the plan's dry-run, and added a drift guard (`__tests__/sound-vault-naming.test.ts`)
that fails on any future bare `your|the|a vault` in `app/` or `components/` `.tsx`
prose. Guard was proven RED against the unfixed tree first (naming all 14), then the
noun-only edits turned it GREEN. `components/nav/ArtistNav.tsx:45`'s `'Sound Vault'`
label is pinned as the guard's second assertion so a future product rename re-opens
the guard instead of leaving it enforcing a dead name.

## What changed

**New:**
- `__tests__/sound-vault-naming.test.ts` — filesystem walk of `app/` + `components/`
  `.tsx` files (skipping `*.test.tsx`/`*.spec.tsx`), matcher
  `/\b(?:your|the|a)\s+vault\b/i`, comment-line skip (lines starting `//`, `*`, `/*`,
  `{/*`), asserting zero hits and pinning `ArtistNav.tsx`'s canonical label.

**Modified (12 files, 14 strings, noun-only):**
- `app/(artist)/tools/pitchplug/page.tsx:60`
- `app/(artist)/coach/page.tsx:78`
- `app/(artist)/antenna/page.tsx:102,109` (×2)
- `app/(artist)/antenna/[opportunityId]/page.tsx:206`
- `app/(artist)/vault/page.tsx:672,681` (×2) + `:302` comment (tracks the :681 rename)
- `app/(artist)/vault/[projectId]/pitch/page.tsx:53`
- `app/(auth)/signup/page.tsx:413`
- `app/(auth)/signin/page.tsx:160`
- `components/coach/RightsCoach.tsx:48`
- `components/antenna/ApplyButton.tsx:49`
- `components/contracts/ContractLocker.tsx:394`
- `components/split-sheets/AttachSheetPanel.tsx:173`

Character-sensitive spots verified preserved exactly: the curly apostrophe (U+2019)
in `Couldn't` at `vault/page.tsx:672`, and the `&rsquo;` HTML entities on/near
`antenna/page.tsx:102` and `vault/[projectId]/pitch/page.tsx:53`.

## Order of operations (as required by the plan)

**Task 1 — guard written, proven RED first.** Ran
`npm test -- --runInBand __tests__/sound-vault-naming.test.ts` against the unfixed
tree. It failed and named exactly the 14 locations the plan's dry-run predicted —
no more, no fewer:

```
FAIL __tests__/sound-vault-naming.test.ts
  ● Sound Vault naming › has no bare "vault" left in member-facing copy

    expect(received).toEqual(expected) // deep equality

    - Expected  -  1
    + Received  + 16

    - Array []
    + Array [
    +   "app/(artist)/antenna/[opportunityId]/page.tsx:206: readiness in your vault to qualify.",
    +   "app/(artist)/antenna/page.tsx:102: As you complete projects in your vault, the Antenna surfaces opportunities you&rsquo;re a",
    +   "app/(artist)/antenna/page.tsx:109: Go to your vault",
    +   "app/(artist)/coach/page.tsx:78: <p className=\"text-[14px] text-lavdim\">Add a release to your vault to see its direct-deal eligibility.</p>",
    +   "app/(artist)/tools/pitchplug/page.tsx:60: PitchPlug writes from a real release in your vault. Add a project first.",
    +   "app/(artist)/vault/[projectId]/pitch/page.tsx:53: pre-filled from your vault. Just pick who you&rsquo;re pitching.",
    +   "app/(artist)/vault/page.tsx:672: Couldn't load your vault: {error.message}",
    +   "app/(artist)/vault/page.tsx:681: <p className=\"text-lg font-semibold text-white\">Your vault is empty</p>",
    +   "app/(auth)/signin/page.tsx:160: : 'Sign in to your vault.'}",
    +   "app/(auth)/signup/page.tsx:413: finish setting up your vault.",
    +   "components/antenna/ApplyButton.tsx:49: notified and your vault package was shared.",
    +   "components/coach/RightsCoach.tsx:48: return <p className=\"text-[14px] text-lavdim\">Add a release to your vault to see its deal eligibility.</p>",
    +   "components/contracts/ContractLocker.tsx:394: <p className=\"mt-3 text-[12.5px] text-lavdim\">Create a Vault project first to attach this sheet.</p>",
    +   "components/split-sheets/AttachSheetPanel.tsx:173: <p className=\"mt-2 text-[12.5px] text-lavdim\">Create a Vault project first to attach this sheet.</p>",
    + ]

Test Suites: 1 failed, 1 total
Tests:       1 failed, 1 passed, 2 total
```

(Note: the second `it()` — pinning `ArtistNav.tsx`'s label — passed even in this run,
since that file was never in scope for the rename.)

**Task 2 — noun changed in all 14, guard turned green.** After the edits:

```
Test Suites: 1 passed, 1 total
Tests:       2 passed, 2 total
```

Residual grep (`grep -rniE "(your|the|a) vault" --include="*.tsx" app/ components/ | grep -viE "sound vault"`)
returned exactly the 5 out-of-scope code comments the plan named — nothing else:

```
app/(artist)/sync-library/agreement/page.tsx:13
components/catalogue/CatalogueShelf.tsx:4
components/catalogue/CatalogueShelf.tsx:14
components/catalogue/CatalogueShelf.tsx:19
components/vault/LinkSplitSheet.tsx:4
```

## Verification gate (full CI validate job)

| Step | Result |
|---|---|
| `npm run security:migrations:verify` | PASS — "migrations 214–218 are transactional, collision-sensitive, least-privilege, checksum-pinned, and covered by read-only probes." |
| `npm run typecheck:strict` | PASS — no output, exit 0 |
| `npm run lint` (`--max-warnings=0`) | PASS — exit 0 (only an ESLint-tooling deprecation notice about eslintrc vs flat config, not a lint finding) |
| `npm test -- --runInBand` | PASS — 631 suites, 7747 tests, 0 failures |
| `npm audit --omit=dev --audit-level=moderate` | PASS — 0 vulnerabilities |
| `npm audit --audit-level=high` | PASS — 0 vulnerabilities |

## Deviations from plan

None. The plan's corrected 14-string scope (not the brief's 11) was followed exactly
as written — no additional strings found, no strings dropped, no allowlist added to
the guard. `app/(auth)/auth-rendering.test.ts` was confirmed (again, incidentally, via
the full suite run) to not pin old copy — no test needed updating, as the plan
predicted.

## Files touched

- `__tests__/sound-vault-naming.test.ts` (new)
- `app/(artist)/tools/pitchplug/page.tsx`
- `app/(artist)/coach/page.tsx`
- `app/(artist)/antenna/page.tsx`
- `app/(artist)/antenna/[opportunityId]/page.tsx`
- `app/(artist)/vault/page.tsx`
- `app/(artist)/vault/[projectId]/pitch/page.tsx`
- `app/(auth)/signup/page.tsx`
- `app/(auth)/signin/page.tsx`
- `components/coach/RightsCoach.tsx`
- `components/antenna/ApplyButton.tsx`
- `components/contracts/ContractLocker.tsx`
- `components/split-sheets/AttachSheetPanel.tsx`

Not touched (per plan's explicit exclusions): `.planning/ROADMAP.md` (PR #112 owns
it), the split-sheet identity worktree, route paths, table names, identifiers,
directory names, and the 5 code comments listed above.
