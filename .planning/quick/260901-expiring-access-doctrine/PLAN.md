# Expiring Access Doctrine - Plan

## Objective

Record the owner's approval of expiring links, renewable Crate preview sessions and
signing-link lifecycle as the fifth permanent Sound Vault custody doctrine, then create
a staged implementation TODO.

## Scope

- Lock Item 5 without changing D-01 through D-04.
- Separate long-lived catalogue/document records from short-lived access credentials.
- Preserve The Crate's continuously browsable experience through renewable protected
  sessions.
- Define contract-link expiration without deleting or invalidating the legal record.
- Add security controls, default durations, lifecycle states and implementation stages.
- Update the roadmap while leaving Item 6 and later topics open.

## Files Expected to Change

- `.planning/ROADMAP.md`
- `.planning/deliberations/sound-vault-master-custody.md`
- `.planning/todos/pending/2026-09-01-expiring-access-link-lifecycle.md`
- `.planning/quick/260901-expiring-access-doctrine/PLAN.md`
- `.planning/quick/260901-expiring-access-doctrine/SUMMARY.md`

## Validation Plan

- Confirm D-05 is owner-approved and Item 6 remains open.
- Confirm The Crate stays continuously browsable while audio credentials remain short-lived.
- Confirm previews never expose stable storage paths or clean masters.
- Confirm signing invitations may expire while executed records remain in Contract Locker.
- Confirm revocation cannot be represented as retrieval of a completed download.
- Run `git diff --check` on all changed planning files.

## Risks / Coordination Notes

- Current Selects bearer-token behavior and future named-recipient delivery need separate
  threat models rather than one universal link type.
- Signing providers may impose their own link lifecycle; the adapter must normalize
  status without weakening provider security.
- Existing unrelated worktree changes belong to the user and will not be modified.
