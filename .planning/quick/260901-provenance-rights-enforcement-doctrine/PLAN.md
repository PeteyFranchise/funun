# Provenance and Rights Enforcement Doctrine - Plan

## Objective

Record the owner's approval of file integrity, derivation provenance, recipient-specific
delivery attribution and licensed-use enforcement as permanent doctrine, with a staged
implementation plan.

## Scope

- Lock Item 3 of the Sound Vault custody discussion.
- Distinguish cryptographic hashes, recipient-specific forensic watermarks and acoustic
  fingerprint matching.
- Define the licensed-use verification and human-reviewed enforcement workflow.
- Allocate Funūn-owned responsibilities versus specialist partner responsibilities.
- Add a near-term implementation TODO and roadmap entry without claiming these
  capabilities already ship.

## Files Expected to Change

- `.planning/ROADMAP.md`
- `.planning/deliberations/sound-vault-master-custody.md`
- `.planning/todos/pending/2026-09-01-provenance-delivery-attribution-rights-enforcement.md`
- `.planning/quick/260901-provenance-rights-enforcement-doctrine/PLAN.md`
- `.planning/quick/260901-provenance-rights-enforcement-doctrine/SUMMARY.md`

## Validation Plan

- Confirm D-03 is owner-approved and Item 4 remains open.
- Confirm hashes are not represented as proof of copyright ownership or recipient
  attribution after transcoding.
- Confirm recipient attribution requires recipient-specific forensic copies.
- Confirm enforcement requires artist authorization, rights eligibility, licence-ledger
  checking and human review.
- Confirm Content ID, watermarking and platform enforcement are partner capabilities,
  not current Funūn claims.
- Run `git diff --check` on all changed planning files.

## Risks / Coordination Notes

- Content ID eligibility, platform policies and legal enforcement obligations can change
  and require current partner/counsel review before implementation.
- False claims can harm artists, licensees and Funūn; enforcement cannot be an
  unreviewed automation.
- Existing unrelated worktree changes belong to the user and will not be modified.
