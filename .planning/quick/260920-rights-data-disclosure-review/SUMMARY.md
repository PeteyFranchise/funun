# Rights Data Disclosure Review Summary

## What Changed

- Added `.planning/reviews/CODEX-RESPONSE-260920-rights-data-disclosure.md` with the requested evidence-based review.
- Verified and corrected the current profile-table history, roster ownership behavior, split-sheet disclosure paths, PDF field set, membership boundaries, and workspace grant semantics.
- Recommended Phase 41 link members without copying or revealing rights data, with a separate purpose-bound disclosure phase.
- Added the owner's approved long-term recordkeeping direction: immutable executed split sheet, versioned Rights Schedule, purpose-specific rights packets, append-only administrative history, and separate DocuSeal amendments for substantive rights changes.
- Recorded scoped access defaults for contributors, project owners, managers, label administrators, distributor operators, A&R, and ordinary team members.
- Made no application-code or migration changes and applied no SQL.

## Validation Run

- `npx jest --runInBand lib/vault/pdf/split-sheet.test.ts lib/split-sheets/live-identity.test.ts lib/workspaces/catalogue.test.ts __tests__/migration-193.test.ts` — PASS: 4 suites, 133 tests.
- `git diff --check -- .planning/reviews/CODEX-RESPONSE-260920-rights-data-disclosure.md .planning/quick/260920-rights-data-disclosure-review/PLAN.md` — PASS.
- Required top-level headings are present in the requested order.
- The approved architecture, amendment boundary, archival bundle, access matrix, and “sign the rights; maintain the identifiers; export the information appropriate to the job” principle are present in the review.
- The shared worktree moved from `main` commit `2245acf23a6f428b03a6b5950b175710a796f5eb` to `phase-41-discuss` commit `afd7f664ab11959c277cefbb04e65572ee9faad2` during the review; the intervening diff contains planning/prompt files only and was preserved.

## Remaining Risks Or Follow-Ups

- Production data conflicts between claimed `collaborators.ipi`, canonical `user_profiles.ipi`, and unconfirmed `claim_prefill` entries were not queried.
- The proposed assertion-history migration and rights-disclosure resolver require a dedicated human-reviewed phase; no migration number is reserved by this review.
- The current split-sheet draft editor still exposes other claimed parties' live profile rights fields to the initiator; the report recommends containing that path before or with Phase 41 rollout.
