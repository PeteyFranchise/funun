# Writer's Room Alternate Lyric Suggestions

## Objective

Let a current Writer's Room participant propose alternate words for an original lyric section without taking its edit lock or overwriting the canonical lyric, then let the work owner or an administering member explicitly accept or decline the proposal.

## Scope

- Add private, work- and block-scoped lyric suggestions with pending, accepted, and declined states.
- Allow current participants to create a pending suggestion from a section's current words and optional note.
- Show pending-count affordances on original lyric blocks and a side-by-side current/suggested comparison panel.
- Allow only the work owner, an administering member, or the suggestion author to withdraw/decline; reserve acceptance for the owner or an administering member.
- Accept atomically: verify the suggestion is still pending, snapshot the current lyric when it differs, update the canonical block text and author, mark the suggestion accepted, decline competing pending suggestions, and emit one meaningful diary event.
- Reject stale acceptance when the canonical lyric changed after the suggestion was created; keep the suggestion intact for review.
- Broadcast only bounded refetch hints over the existing private Writer's Room channel.
- Keep repeats pointed at their original section and keep rights, splits, legal identity, approved metadata, and audio bytes outside this workflow.

## Files expected to change

- `supabase/migrations/161_writer_room_lyric_suggestions.sql`
- `types/catalogue.ts`
- `lib/catalogue/lyric-suggestions.ts`
- `lib/catalogue/lyric-suggestions.test.ts`
- `app/api/works/[workId]/blocks/[blockId]/suggestions/route.ts`
- `app/api/works/[workId]/blocks/[blockId]/suggestions/[suggestionId]/route.ts`
- `__tests__/writer-room-lyric-suggestions-api.test.ts`
- `__tests__/migration-161.test.ts`
- `components/catalogue/LyricSuggestionPanel.tsx`
- `components/catalogue/LyricSuggestionPanel.test.tsx`
- `components/catalogue/LyricBlockCard.tsx`
- `components/catalogue/LyricBlockCard.test.tsx`
- `components/catalogue/LyricsPad.tsx`
- `components/catalogue/WorkPage.tsx`
- `components/catalogue/WriterRoomPresence.tsx`
- `app/(artist)/vault/works/[workId]/page.tsx`
- `lib/catalogue/room-collaboration.ts`
- `lib/catalogue/diary.ts`
- `.planning/quick/260903-lyric-alternate-suggestions/SUMMARY.md`

## Validation plan

- Unit-test presentation, permissions, stale comparison behavior, and input normalization.
- Route-test authentication, participant authorization, exact RPC inputs, bounded mention handling, and error mapping.
- Static-render test the section affordance and comparison panel states.
- Run focused Jest, full Jest, TypeScript, ESLint, SQL structural tests where available, and `git diff --check`.
- Do not run `next build` while the owner's development server may share `.next`.

## Risks and coordination notes

- Migration `161` is human-gated and must be applied before live use.
- Suggestions are proposals, not co-authorship determinations, split claims, rights approvals, or legal evidence of ownership.
- Acceptance must be a database transaction because snapshot, lyric replacement, suggestion status, competing-proposal closure, and diary evidence cannot safely be separate client writes.
- The existing snapshot schema and lyric-edit semantics are reused; no suggestion becomes canonical until an authorized explicit acceptance.
- This manual quick plan is used because Codex cannot invoke Claude's native `/gsd-quick` command in this session.
