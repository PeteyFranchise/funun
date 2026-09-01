# Writer's Room existing-collaborator linking repair

## Objective

When an artist adds someone to a Writer's Room, existing people from My
Roster must be selectable and claimed Funūn members must receive direct room
access without another signup invitation.

## Confirmed production evidence

- `@justifiednoise` and `@shanemaux` each have a confirmed collaborator row
  owned by `@peterzora` and linked through `claimed_by` to their Funūn user.
- The “Justified Noise” work instead points to two newly-created, unclaimed
  duplicate collaborator rows, leaving both work memberships pending.
- Production does not currently expose `collaborators.archived_at`, although
  migration 026 and several application queries expect it.
- The Writer's Room manual-email lookup filters on that missing column and
  ignores the resulting query error. It therefore creates a duplicate and
  sends a new invite.
- The membership endpoint sends an invite unconditionally even when a
  selected/reused collaborator already has a verified `claimed_by` user.
- The UI only displays first-name/email inputs even though the endpoint
  already accepts `collaborator_id`.

## Scope

1. Add a My Roster picker to the Writer's Room membership form.
2. Send `collaborator_id` when a roster person is selected and clearly
   distinguish direct access from an external invitation.
3. Skip signup email delivery for a claimed collaborator and write their
   verified user ID directly into `work_members`.
4. Treat roster lookup errors as errors rather than “not found.”
5. Add a forward migration that restores `archived_at`, links duplicate
   pending memberships to the canonical claimed collaborator/user, expires
   obsolete signup invitations, and archives the duplicate roster rows.
6. Add focused regression tests for UI, invite decisions, and migration
   invariants.

## Files expected to change

- `components/catalogue/WorkRoster.tsx`
- `components/catalogue/WorkRoster.test.tsx`
- `components/collaborators/CollaboratorPicker.tsx`
- `app/(artist)/vault/works/[workId]/page.tsx`
- `app/api/works/[workId]/members/route.ts`
- a small pure membership/invite decision module and tests
- `supabase/migrations/148_writer_room_existing_collaborator_repair.sql`
- `__tests__/migration-148.test.ts`

## Safety and coordination notes

- Membership remains separate from split ownership. Selecting a collaborator
  never adds them to the split sheet automatically.
- `claimed_by` remains the only trusted account-link signal; typed email never
  becomes room authorization by itself.
- Duplicate repair only merges rows with the same roster owner and normalized
  email when a claimed canonical row exists.
- Obsolete duplicates are archived, not deleted, preserving provenance and
  foreign-key history.
- Existing unrelated working-tree changes remain untouched and unstaged.

## Validation

- Focused Jest tests for roster UI and direct-vs-invite behavior.
- Migration text/invariant tests.
- ESLint on changed TypeScript/TSX files.
- TypeScript typecheck and `git diff --check`.
