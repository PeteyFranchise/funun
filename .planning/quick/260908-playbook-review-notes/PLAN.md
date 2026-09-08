# Release 14 — Playbook Review Notes & Requested Changes

## Scope

- Add review discussions tied to the exact Playbook entry draft version or published revision reviewed.
- Support overall notes and anchored feedback on headings or checklist/list items.
- Distinguish optional suggestions from requested changes without making suggestions block approval.
- Support Team Member mentions, replies, immutable discussion history, and reviewer-controlled resolve/reopen actions.
- Surface open requested changes to authors in My Playbook.
- Preserve existing Playbook room authorization and derive all authority server-side.

## Database boundary

- Author migration candidate `204_playbook_review_threads.sql` outside `supabase/migrations/`.
- Do not apply or move the migration during this build.
- Fail closed when the pending Playbook schema or candidate review schema is unavailable.
- Preserve the reconciled migration ledger: 200 is applied for Antenna hardening, 203 is permanently retired, 208–209 belong to Phase 38.0.3, 210 is reserved for Phase 38.0.3 Tier 3, Playbook candidates occupy 201–202 and 204–207, and Phase 38.2 moves to 211–212.

## Assumptions

- Leadership and room leads may initiate review threads and resolve or reopen them.
- Authors, reviewers, and valid mentioned room members may participate in a thread.
- A requested-change thread persists against the reviewed version even if a newer draft is saved.
- Approval remains an explicit reviewer decision; optional suggestions never block it.
- Returning work for changes preserves the draft rather than rejecting or deleting it.

## Verification

- Add migration contract tests and unit tests for review authorization, anchors, and schema-unavailable handling.
- Run focused tests during implementation.
- Run the full test suite, TypeScript checking, targeted ESLint, and whitespace/diff checks before handoff.
