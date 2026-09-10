# Release 11 — Playbook Authoring Preflight & Review Packet Summary

## What Changed

- Added a deterministic, client-safe Playbook authoring preflight with blockers, warnings, reading statistics, and explicit proceed eligibility.
- Added checks for missing title/content, unfinished starter language, empty Markdown headings, malformed links, inconsistent tables, and incomplete Mermaid blocks.
- Added advisory checks for an accountable owner, intended audience, and review cadence. These remain warnings and do not rigidly block publishing.
- Added a review packet to new-entry and revision flows showing room/subgroup destination, format, intended action, word count, and estimated reading time.
- Changed submit/publish actions to a two-step “Review & …” flow. Authors can proceed with warnings through an explicitly labeled action; true blockers disable the final action.
- Kept Save draft immediate and outside preflight gating.
- Added the same packet to pending entries so reviewers can see structural warnings beside the proposed content.
- Allowed authorized authors to save SOP and Topic revisions as drafts, matching the existing new-entry behavior and Release 10 intent.
- Preserved all server-derived authorization, approval, and publication decisions.

## Validation Run

- Focused Playbook pass: 3 suites, 13 tests.
- Full repository pass: 538 suites, 6,319 tests.
- `npm run typecheck`: passed.
- Targeted ESLint: passed with zero warnings.
- `git diff --check`: passed.
- React best-practices review: completed; removed unnecessary memoization and kept the assessment deterministic during render.

## Remaining Notes

- No schema or migration changes were required.
- Checks are intentionally heuristic and disclose that they do not certify policy or legal correctness.
- No entry was created, published, committed, pushed, or deployed during this release.
- The repository remains a shared dirty worktree containing prior Playbook releases and unrelated work that this release did not alter or revert.
