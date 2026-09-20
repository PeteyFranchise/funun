# Rights Data Disclosure Review Plan

## Objective

Produce an evidence-based answer to when one Funūn member may receive another member's rights identifiers, and define the narrow Phase 41 scope that follows from that answer.

Preserve the owner's approved follow-up product direction for long-term rights recordkeeping: an immutable executed agreement, a versioned Rights Schedule, purpose-specific delivery packets, and DocuSeal amendments only for substantive rights changes.

## Scope

- Verify the current profile, collaborator, discovery, claim, membership, song-passport, split-sheet, document-access, and migration behavior.
- Assess document-need, explicit-grant, and project-membership disclosure triggers and their revocation limits.
- Recommend treatment of `collaborators.ipi`, including existing claimed rows.
- Record the approved boundary between contractual terms, maintainable rights metadata, administrative history, and signed amendments.
- Define role- and purpose-scoped access for managers, A&R, label administrators, distributor operators, and ordinary team members.
- Write the complete review to `.planning/reviews/CODEX-RESPONSE-260920-rights-data-disclosure.md` without changing application code or migrations.

## Files Expected To Change

- `.planning/quick/260920-rights-data-disclosure-review/PLAN.md`
- `.planning/quick/260920-rights-data-disclosure-review/SUMMARY.md`
- `.planning/reviews/CODEX-RESPONSE-260920-rights-data-disclosure.md`

## Validation Plan

- Re-open the generated report and verify all required headings are present in order.
- Verify the owner-approved document/record architecture and amendment rules are stated unambiguously.
- Check cited line references against the current commit.
- Confirm no application code or migration was modified.
- Record final `git status --short --branch`.

## Risks And Coordination Notes

- Production is reported at migration 227; no migration will be applied or represented as applied.
- `main` is protected; no branch, commit, push, or deployment action is in scope.
- The untracked `.planning/phases/41-collaborator-discovery-mobile-contact-matching/` directory is user-owned and will not be edited.
- Privacy and rights-accountability conclusions that are product-policy recommendations will be labeled as inference rather than code-verified fact.
