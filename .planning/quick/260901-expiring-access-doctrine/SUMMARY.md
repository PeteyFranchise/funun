# Expiring Access Doctrine - Summary

## What Changed

- Locked expiring access and link lifecycle as D-05 of the permanent Sound Vault
  custody doctrine.
- Separated long-lived parent access grants from short-lived media/storage credentials.
- Approved default lifetimes for previews, shortlists, watermarked downloads, clean
  deliveries and signing invitations.
- Preserved The Crate as a continuously browsable catalogue through transparent,
  renewable protected-preview sessions.
- Locked the rule that continuous discoverability never creates permanent file access
  or clean-master availability.
- Locked the Contract Locker rule: the invitation expires; the legal record does not.
- Added bearer, named-recipient and team-access boundaries, neutral expired states,
  central revocation and audit requirements.
- Added an eight-stage implementation TODO and cross-surface acceptance pilot.

## Validation Run

- Confirmed D-01 through D-04 remain locked and D-05 is owner-approved.
- Confirmed Item 6 remains open.
- Confirmed Crate audio credentials are short-lived while catalogue admission can persist.
- Confirmed signing-link expiration does not delete or invalidate executed records.
- Confirmed clean-master and sensitive-document access require named recipients.
- Confirmed revocation is not described as retrieval of completed downloads.
- Ran `git diff --check` on all changed planning files with no whitespace errors.

## Remaining Risks / Follow-ups

- Current access routes need a full inventory and threat model before schema design.
- Signing-provider lifecycle behavior must be mapped into Funūn-owned states.
- The final default durations require security, product and operations validation.
- Continue the custody discussion with Item 6: download history.
