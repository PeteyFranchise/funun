# Observed RED — lavender rgba family scan against the unmodified tree

**Observed at:** `1728a221` (branch `neutral-lavender-washes`, tree unmodified — Task 1, before any substitution)

**Command:** `npx jest __tests__/palette-single-source.test.ts --runInBand`

**Result:** `Tests: 1 failed, 12 passed, 13 total` — exactly the new "no lavender rgba
literal survives at any alpha" test failed. The existing hex scan and both half-(a)
agreement tests (7 `it.each` + 2 non-vacuity) stayed green, plus half (b)'s own
non-vacuity + retired-literal test — 12 passed in total, matching the pre-existing
11-test baseline plus the new scan's own non-vacuity test.

## Distinct offender lines: 33

```
app/(artist)/earnings/page.tsx:158
app/(artist)/vault/[projectId]/readiness/page.tsx:199
app/(artist)/vault/[projectId]/readiness/page.tsx:216
components/admin/HealthRulesForm.tsx:137
components/admin/HealthRulesForm.tsx:301
components/admin/HealthRulesForm.tsx:305
components/admin/HealthRulesForm.tsx:338
components/admin/HealthRulesForm.tsx:350
components/admin/console-theme.ts:25
components/antenna/OpportunityCard.tsx:36
components/benchmarks/BenchmarkView.tsx:201
components/buyer/fnbl-theme.ts:22
components/coach/RightsCoach.tsx:98
components/playbook/AccessEditorMatrix.tsx:113
components/playbook/Rail2.tsx:174
components/playbook/Rail2.tsx:188
components/playbook/Rail2.tsx:204
components/playbook/Rail2.tsx:230
components/playbook/Rail2.tsx:251
components/playbook/Rail2.tsx:267
components/playbook/Rail2.tsx:297
components/playbook/Rail2.tsx:313
components/playbook/Rail2.tsx:340
components/playbook/Rail2.tsx:391
components/profile/ProfileView.tsx:101
components/selects-player/theme.ts:22
components/selects-player/theme.ts:76
components/selects-player/theme.ts:81
components/selects-player/theme.ts:163
components/vault/PlaybackView.tsx:249
components/vault/PlaybackView.tsx:385
components/vault/PublicPlaybackView.tsx:254
components/vault/VaultProjectCard.tsx:116
```

## Occurrence count: 38

## File count: 15

## Occurrences-vs-lines reconciliation

38 occurrences collapse to 33 distinct lines because three lines carry more than one
occurrence each:

- `components/buyer/fnbl-theme.ts:22` — 4 occurrences (`.10`, `.12`, `.22`, `.55` —
  `--wash-2`, `--line`, `--line-2`, `--ink-3`)
- `components/admin/console-theme.ts:25` — 2 occurrences (`.12`, `.22` — `--border`,
  `--border-2`)
- `components/selects-player/theme.ts:22` — 2 occurrences (`.12`, `.22` — `--border`,
  `--border2`)

`38 − 8 (occurrences on those 3 lines) + 3 (those 3 lines counted once each) = 33`.
The line-level guard added in Task 1 reports the 33-line list above; the 38 figure is
the raw grep occurrence count, not a discrepancy.

All three counts (33 distinct lines, 38 occurrences, 15 files) match the plan's
preflight prediction exactly — no shortfall, no investigation needed.
