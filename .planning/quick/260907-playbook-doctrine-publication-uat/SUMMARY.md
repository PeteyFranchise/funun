# Playbook Doctrine Publication & UAT — Release 7 Summary

## Completed locally

- Reconciled the live roadmap migration ledger through authored migration 198.
- Prepared candidate migration 201 for rich documents, approved rooms/subgroups, governance, immutable revisions, connected Gameplans and review reminders.
- Prepared candidate migration 202 for assignments, acknowledgements and idempotent reading reminders.
- Kept both candidates outside `supabase/migrations` because Phase 38.2 owns the still-missing migrations 199–200.
- Added a typed publication manifest for all 15 functional doctrines, Funūn Deal Flow, workforce scale and the six-month launch plan.
- Added source-heading validation, room/subgroup mapping, reviewer intent, connected-Gameplan expectations and complete A&R/BDT legacy supersession inventories.
- Added a metadata-only Doctrine Readiness queue for Leadership and authorized room leads.
- Added ready, draft, published, source-changed and blocked states with filters and preflight reasons.
- Added a session UAT checklist covering ordinary-reader denial, room leads, Leadership, private drafts, mobile tables, callouts, Mermaid safety, immutable revisions, source updates and supersession.
- Added Doctrine Readiness to the Playbook secondary navigation for users with governance scope.

## Security and publication boundaries

- The cross-room queue selects metadata only; neither published nor pending document bodies are serialized.
- Non-Leadership room leads see only manifest rows for rooms they govern.
- No bulk-publish endpoint or automatic source overwrite was added.
- New sensitive rooms are conservatively granted: Rights/Legal to Legal, Finance to Accounting, and Trust & Safety to Leadership only until a dedicated role is deliberately created.
- Non-sensitive doctrine rooms follow the existing internal transparency model; protected case, deal, personnel and financial records remain outside doctrine content.
- A&R and BDT consolidation cannot be considered complete until every listed legacy card receives an explicit supersession decision.

## Verification

- Targeted manifest and migration-contract tests passed.
- TypeScript and targeted ESLint passed.
- Full Jest suite passed: 531 suites / 6,282 tests.
- Next.js production build passed and includes `/admin/playbook/publication`.
- Post-move candidate migration/manifest tests passed: 2 suites / 12 tests.
- Post-move TypeScript and `git diff --check` passed.

## Human-gated next actions

1. Finish and review Phase 38.2 migrations 199–200.
2. Recheck the live migration ledger and candidate 201 dependencies.
3. Promote candidate 201 and 202 into `supabase/migrations` only after 199–200 exist.
4. Owner reviews and applies migrations in order.
5. Run the in-product UAT checklist with ordinary Team Member, room-lead and Leadership accounts.
6. Adopt each doctrine as a draft, assign reviewers, connect available Gameplans and publish individually.
7. Explicitly supersede the earlier A&R and BDT cards after their consolidated replacements are approved.

## Repository state

- No migration was applied.
- No doctrine was adopted or published.
- No commit, push or deployment was performed.
