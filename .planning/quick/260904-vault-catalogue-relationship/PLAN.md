# Vault catalogue relationship regression

## Objective

Restore Writer's Room cards in the Sound Vault after the `works.working_version_id`
foreign key made the existing `works -> work_versions` embed ambiguous.

## Reproduction and root cause

- Production still contains the two affected `works` rows under the correct user.
- The exact Vault embed returns PostgREST `PGRST201` because both
  `work_versions_work_id_fkey` and `works_working_version_id_fkey` connect the
  same tables.
- `app/(artist)/vault/page.tsx` discards `ownedWorksRes.error`, turning the
  failed query into an empty catalogue.

## Scope

- Qualify the collection relationship in the Vault's `WORKS_EMBED` query.
- Preserve the `work_versions` response property expected by the card mapper.
- Surface failures from owned-work, work-membership, and member-work queries.
- Add a focused regression test for the relationship and error handling.
- No database mutation or migration.

## Files expected to change

- `app/(artist)/vault/page.tsx`
- `__tests__/vault-catalogue-query.test.ts`
- `.planning/quick/260904-vault-catalogue-relationship/SUMMARY.md`

## Validation plan

- Run the focused Jest regression test.
- Run TypeScript and lint checks.
- Execute the corrected embed as a read-only query against production.
- Run the production build if focused checks pass.

## Risks and coordination notes

- The selected relationship must remain the one-to-many collection through
  `work_versions.work_id`, not the single working-take pointer.
- No user data will be changed during validation.
- The repository started clean on `main`; preserve unrelated files.
