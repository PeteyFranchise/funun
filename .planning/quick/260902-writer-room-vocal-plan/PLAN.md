# Writer's Room Vocal Plan

## Objective

Replace the guest-name-only “Who sings this?” flow with an accurate vocal-plan picker that can name a real performer or describe an uncast voice without turning either choice into writing credit, room access, ownership, a split-sheet party, or an invitation.

## Scope

- Add a separate nullable `lyric_blocks.vocal_direction` field for creative direction such as “gospel choir” or “female vocalist.”
- Keep named people in the existing `performers` references so formal identity never mixes with uncast creative direction.
- Offer the signed-in artist, current Writer's Room members, the artist's global My Roster, and a name-only guest option.
- Permit multiple named performers for duets/groups and allow editing or removing an existing choice.
- Show vocal direction directly on the lyric section while keeping it editable.
- Reuse the existing block PATCH route and its work-membership authorization.
- Do not send invitations, mutate membership, touch splits, or create collaborator profiles.

## Files Expected to Change

- `supabase/migrations/159_lyric_block_vocal_direction.sql`
- `types/catalogue.ts`
- `lib/catalogue/singer-options.ts`
- `lib/catalogue/singer-options.test.ts`
- `components/catalogue/SingerPicker.tsx`
- `components/catalogue/SingerPicker.test.tsx`
- `components/catalogue/LyricBlockCard.tsx`
- `components/catalogue/LyricBlockCard.test.tsx`
- `components/catalogue/LyricsPad.tsx`
- `components/catalogue/WorkPage.tsx`
- `components/catalogue/WorkPage.test.tsx`
- `app/(artist)/vault/works/[workId]/page.tsx`
- `app/api/works/[workId]/blocks/[blockId]/route.ts`
- `__tests__/migration-159.test.ts`
- `.planning/quick/260902-writer-room-vocal-plan/SUMMARY.md`

## Validation Plan

- Pure tests prove candidate de-duplication across self, room membership, and My Roster.
- Render tests prove both “Name a performer” and “Describe the voice” paths and the explicit no-credit/no-splits copy.
- Route contract tests prove `vocal_direction` is allowlisted, bounded, and cannot accompany a locked lyric-text save.
- Migration tests prove the field is nullable, bounded, and additive.
- Run focused Jest and ESLint, TypeScript, full lint, full Jest, and `git diff --check`.

## Risks / Coordination Notes

- Migration 159 is human-gated and must be applied before this code is pushed/deployed.
- `performers` remains the named-person plan and eventual credit seam; `vocal_direction` is never exported as a person.
- The current production build may share `.next`; do not run `npm run build`.
