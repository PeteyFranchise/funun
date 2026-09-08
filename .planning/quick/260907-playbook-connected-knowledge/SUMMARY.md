# Playbook Connected Knowledge — Release 2 Summary

**Status:** Complete locally; uncommitted by owner request
**Migration:** Extended in the human-gated draft; not numbered, copied into `supabase/migrations`, or applied
**Deployment:** Not attempted

## Delivered

- Added leadership/room-lead-only adoption of approved repository Markdown as an unpublished Playbook draft.
- Normalized source paths to approved doctrine roots, calculated source hashes server-side, prevented duplicate ownership, and refused silent source overwrites.
- Added source-change checks, published-versus-proposed Markdown comparison, and an explicit review-draft path.
- Added immutable publication history with safe restoration of earlier versions as new revisions.
- Closed restoration edge cases that could overwrite a pending draft or publish a never-published rejected draft.
- Added archived and superseded lifecycle controls with optimistic concurrency and recovery.
- Added article owners, one-time or recurring review dates, last-reviewed records, and a review-due library filter.
- Added deferred full-text library search across titles, rich doctrine bodies, SOP items, Topic questions, sources and subgroups.
- Added typed document-to-Member-CRM-Gameplan links, including `reference` and `required_reading` relationships.
- Surfaced connected doctrine inside Member Onboarding CRM and connected Gameplans on published articles.
- Kept source repository paths restricted to Playbook approvers rather than exposing internal repository structure to every room reader.
- Added transactional metadata/link updates through a service-role-only database function and fail-closed browser-role permissions.

## Verification

- `npm run typecheck` passed.
- Targeted ESLint passed with zero warnings.
- 513 Jest suites and 5,790 tests passed.
- `npm run build` passed and compiled the new article and API routes.
- `git diff --check` passed.

## Deliberately deferred

- Restricted Mermaid rendering. This needs a separately reviewed renderer and SVG sanitization boundary; unsafe or hand-rolled SVG injection is not acceptable.
- Automated review-reminder notifications. Review dates and due-state visibility are present, but notification fan-out needs an idempotency record and scheduled-job design.
- Bulk publication of the organizational doctrine package. The adoption workflow is ready, but publication remains a human-reviewed operation after schema reconciliation and migration application.
- Any commit, push, migration application or deployment while Phase 38 work is still being merged.

## Reconciliation checklist

1. Confirm Phase 38.0.2 execution has finished and inspect the final migration ledger.
2. Assign the reserved Playbook migration number only after confirming 201–202 remain free.
3. Reconcile the draft SQL with the final `playbook_entries` and Member Gameplan schema.
4. Review the migration as a human-gated production change and rerun all checks.
5. Apply the migration only with owner approval, then publish the doctrine package through the ordinary review flow.
