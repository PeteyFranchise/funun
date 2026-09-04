# One Identity, Many Roles — Account Foundation

## Objective

Implement the owner-approved account and workspace doctrine as a backward-compatible foundation:

1. Member Accounts cover artists, writers, producers, managers, publishers, attorneys, label executives, engineers, and collaborators without treating those professional roles as account types or permissions.
2. Client Partner organization access may coexist with a Member workspace on the same authenticated identity.
3. Funūn Team Member authority remains structurally separate and staff-only.
4. Contract Locker becomes a universal Member room and the single navigation home for Split Sheets.
5. Publish `One Identity, Many Roles — The Funūn Account, Workspace & Access Model` in the company-wide Playbook.

## Scope

- Add a canonical, pure account-context model for Member, Client Partner, and Funūn Team Member relationships.
- Stop using artist/industry capability grants to hide core Member navigation; professional roles remain descriptive while action-specific gates remain server-side.
- Allow an authorized Client Partner invitation to attach an existing Member identity to an organization without deleting or replacing its Member profile.
- Resolve The Crate access from `buyer_members` membership rather than the legacy exclusive `app_metadata.role = 'buyer'` marker.
- Add clear Member ↔ Client Partner workspace links when both contexts exist.
- Remove the standalone Split Sheets sidebar item, preserve all detail/deep-link routes, redirect only the list route, and render the stronger split-sheet list as a Contract Locker tab.
- Rename the Settings role language from `Industry Roles` to `Professional Roles` while preserving the existing storage shape for compatibility.
- Replace the stale canonical account-type document and Claude handoff summary with the approved doctrine and transition rules.
- Add human-gated migrations for the service-only existing-account lookup and the published Playbook entry.

## Explicit Boundaries

- Do not infer access, authorship, ownership, signature authority, or payment rights from a professional role.
- Do not merge Member Contract Locker records into Client Partner licensing records.
- Do not give Client Partners The Crate access merely because their profile says Music Supervisor.
- Do not change Funūn staff provisioning or weaken staff authorization.
- Do not fabricate corporate-to-personal account recovery. A verified secondary login identity/passkey flow requires a dedicated authentication phase and provider-level validation.
- Keep existing `member_type`, `capability_grants`, buyer metadata, and URLs as compatibility data until all dependent routes are migrated and production-audited.
- Preserve current single-Client-Partner-organization behavior in transactional routes; multi-org active-context selection is a named follow-up because existing buyer pages assume one membership.

## Files Expected to Change

- `lib/accounts/account-context.ts` and tests
- `lib/buyers/addClientPartnerMember.ts` and tests
- `lib/buyers/createBuyerAccount.ts` comments/compatibility contract
- Client Partner member invitation routes and tests
- `app/(artist)/layout.tsx`, `components/nav/ArtistNav.tsx`
- `app/sync/layout.tsx`, `components/buyer/BuyerTopNav.tsx`
- `app/(artist)/contracts/page.tsx`, `app/(artist)/split-sheets/page.tsx`
- Contract Locker / Split Sheet list navigation tests
- `components/profile/PublicProfileSections.tsx`
- `docs/architecture/ACCOUNT-TYPES.md`, `.claude/CLAUDE.md`
- `supabase/migrations/177_member_client_partner_coexistence.sql`
- `supabase/migrations/178_playbook_one_identity_many_roles.sql`
- Migration structural tests

## Validation Plan

- Unit-test the account-class/context rules, especially dual Member + Client Partner identity and staff isolation.
- Unit-test existing-account Client Partner attachment, duplicate refusal, and preservation of Member profile/subscription data.
- Structurally test migrations 177 and 178 for service-only lookup, least privilege, company-wide placement, and published status.
- Update navigation/page structural tests for one Contract Locker item, embedded Split Sheets tab, preserved detail routes, and membership-derived Crate access.
- Run targeted Jest suites, strict TypeScript, ESLint, the full Jest suite, `git diff --check`, and a production build if no development server is active.

## Risks / Coordination Notes

- Migrations 177 and 178 are human-gated. The agent will author and test them but will not push them to Supabase.
- The working tree already contains the approved Writer's Room hybrid-layout build and migration 176; preserve those changes and do not conflate their behavior with this task.
- Existing buyer-only accounts continue to work through legacy metadata. Existing Member identities gain Client Partner access only through explicit organization membership.
- The current database permits `(org_id, user_id)` membership uniqueness but much of the application still assumes one buyer organization per person. This pass will not silently create a second org membership.
- Publishing the Playbook entry means migration 178 inserts it with `status = 'published'`; it becomes live when the owner applies the migration.
