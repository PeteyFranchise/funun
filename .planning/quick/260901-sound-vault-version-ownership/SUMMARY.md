# Sound Vault Version and Ownership Doctrine - Summary

## What Changed

- Locked version and ownership records as Item 2 of the permanent Sound Vault custody
  doctrine.
- Required every recording to have a distinct, non-destructive version identity and
  traceable relationship to the song and any parent version.
- Separated composition interests from sound-recording/master ownership and control.
- Defined unconfirmed, claimed, contributor-confirmed, document-supported, disputed
  and use-specific clearance states, subject to counsel review before implementation.
- Required immutable transaction snapshots and prevented disputed versions from being
  represented as delivery-ready.
- Updated the roadmap while leaving Item 3 and all later custody questions open.

## Validation Run

- Confirmed D-01 remains unchanged and D-02 is marked locked on 2026-09-01.
- Confirmed replacement audio creates a new version rather than overwriting history.
- Confirmed Funūn records declarations and evidence but does not adjudicate ownership.
- Confirmed composition and master ownership remain separate.
- Ran `git diff --check` on all changed planning files with no whitespace errors.

## Remaining Risks / Follow-ups

- Counsel must approve the final ownership/control labels and disclosures.
- Implementation planning must define contributor acknowledgment and dispute workflows.
- Continue the item-by-item discussion with Item 3: file hashes and provenance.
