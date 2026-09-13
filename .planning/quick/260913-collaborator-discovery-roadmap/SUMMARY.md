# Collaborator discovery and mobile contacts roadmap — summary

## What changed

- Added Phase 41 to the roadmap milestone index and detailed phase register.
- Recorded the approved Collaborators order: Find on Funūn, Invite by email, Enter manually.
- Defined `Add to roster` as a private roster action rather than a social connection, project-access grant, credit, split, ownership declaration, or rights authorization.
- Bound member lookup to the existing People Search visibility, blocking, public-field, rate-limit, and anti-enumeration posture.
- Recorded existing-member email reconciliation and the requirement to send an existing-member collaboration notification instead of a signup/claim email.
- Added the future native-mobile `Find from contacts` concept with optional permission, member discoverability settings, no automatic invitations/actions, address-book data minimization, deletion/revocation controls, and mandatory privacy/legal/security/platform review.
- Explicitly rejected unsalted phone/email hashing as a complete privacy solution and required a threat-modeled private-contact-discovery design before implementation.

## Validation

- Confirmed no existing Phase 41 entry was present before assignment.
- Confirmed no migration number was assigned or reserved.
- Confirmed the milestone index and detailed phase entry carry the same owner-approved scope and status.
- `git diff --check` passed for the roadmap and quick-plan artifacts.

## Status

- Roadmapped only; no application, database, mobile permission, contact collection, or external-service change was made.
- Web implementation planning has not started.
- Mobile contact discovery remains future and research-gated.
