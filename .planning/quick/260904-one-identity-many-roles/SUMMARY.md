# One Identity, Many Roles — Build Summary

## Outcome

Implemented the owner-approved three-class account foundation and made Contract Locker the
single Member home for Split Sheets. The code supports one person acting in both a personal
Member workspace and one verified Client Partner organization without overwriting personal
identity or catalogue data. Funūn Team Member identities remain privileged, separate, and
fail closed.

## Completed

- Added a pure account-context resolver for Member, Client Partner, and Funūn Team Member
  relationships, including explicit Member + Client Partner overlap and staff exclusivity.
- Removed artist/industry capability filtering from core Member navigation.
- Made Contract Locker universal to Members, removed the separate Split Sheets nav item, and
  added Overview, Split Sheets, and Documents tabs.
- Reused the existing stronger Split Sheet list/card design inside Contract Locker.
- Preserved `/split-sheets/new` and `/split-sheets/[id]`; redirected only `/split-sheets` to
  `/contracts?view=split-sheets` for compatibility.
- Added authorized existing-identity Client Partner attachment. It preserves Member profile,
  subscription, Sound Vault, projects, and login; refuses staff identities and a second buyer
  organization until active-org switching exists.
- Changed The Crate shell admission from legacy buyer metadata to `buyer_members` relationship
  data and added Member ↔ Client Partner workspace links.
- Renamed Settings copy from Industry Roles to Professional Roles and stated that roles never
  grant access, authorship, ownership, or signing authority.
- Replaced the stale account-type architecture document and Claude handoff doctrine.
- Updated the roadmap/state and added a dedicated future-security todo for corporate-to-personal
  verified credentials and multi-organization switching.
- Authored migration 177 for a least-privilege, service-only existing-email identity lookup.
- Authored migration 178 to publish `One Identity, Many Roles — The Funūn Account, Workspace &
  Access Model v1.0` in Company-wide → Standards & Doctrine.

## Security boundaries preserved

- Public buyer registration cannot attach an arbitrary existing email; reconciliation is used
  only after an authorized staff/org-admin invitation.
- Profile roles remain descriptive and confer no access or rights.
- Staff identities cannot be attached to Client Partner organizations and are redirected away
  from Member routes even if legacy profile rows overlap.
- Buyer licensing context and Member Contract Locker data remain separate.
- Multi-org membership stays blocked until every buyer route supports an explicit active org.

## Verification

- `npm run typecheck:strict` — passed
- `npm run lint` — passed with zero warnings
- `npm test -- --runInBand` — passed
- Targeted account, buyer invitation, migration, navigation, and staff-route suites — 45 tests
  passed
- `git diff --check` — passed
- `npm run build` — passed; 122 static pages generated and production route build completed

## Activation

The owner applied migrations 177 and 178 on September 4, 2026. A remote migration-list check
confirmed `local = remote` through 178. The One Identity, Many Roles entry is therefore inserted
in the live Playbook with `status = 'published'`. The application code becomes live after the
normal repository commit and production deployment.

## Deferred follow-up

See `.planning/todos/pending/2026-09-04-member-client-partner-identity-continuity.md` for the
verified secondary login/passkey and multi-Client-Partner active-context builds. These were
explicitly excluded from this foundation because both require dedicated authentication and
cross-organization authorization design.
