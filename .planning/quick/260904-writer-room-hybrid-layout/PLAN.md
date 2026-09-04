# Writer's Room Hybrid Layout

## Objective

Implement the approved hybrid Writer's Room layout: lyric blocks, the audio/version section, and the Diary panel can be arranged in one responsive personal workspace, including full-width and side-by-side placement, without changing authoritative song or evidence data.

## Scope

- Add a per-user, per-work layout record protected by work-access RLS.
- Render lyric blocks plus the Versions and Diary modules in one sortable two-column desktop grid that stacks on phones.
- Preserve the existing canonical lyric reorder behavior when lyric-to-lyric order changes.
- Add `Snap lyrics together` to restore canonical lyric order and full-width lyric blocks while leaving non-lyric modules available below.
- Allow each item to toggle between full and half width; collapse Versions and Diary without mutating their contents.
- Replace the large roster surface with compact, mutually exclusive expandable controls for room membership, split-sheet status, and collaborator invitations.
- Keep personal layout changes out of the Diary; Diary event chronology and version numbering remain immutable presentation facts.

## Files Expected to Change

- `components/catalogue/WorkPage.tsx`
- `components/catalogue/LyricsPad.tsx`
- `components/catalogue/LyricBlockCard.tsx`
- `components/catalogue/WorkRoster.tsx`
- `app/(artist)/vault/works/[workId]/page.tsx`
- `app/api/works/[workId]/layout/route.ts` (new)
- `lib/catalogue/writer-room-layout.ts` (new)
- `supabase/migrations/176_writer_room_personal_layouts.sql` (new)
- Targeted component, route, domain, and migration tests

## Validation Plan

- Unit-test layout parsing, reconciliation, width changes, and snap behavior.
- Structurally test migration 176 for RLS, ownership, work access, uniqueness, and least-privilege grants.
- Test the layout route's authentication, access refusal, validation, and authenticated upsert.
- Update component structural tests for compact roster controls and the responsive hybrid grid.
- Run targeted Jest suites, TypeScript typecheck, ESLint, and a production build.

## Risks / Coordination Notes

- Migration 176 is human-gated and must not be applied automatically.
- Layout is private to the signed-in user; one collaborator cannot rearrange another collaborator's room.
- Saved layout keys are allowlisted and reconciled against current lyric blocks so deleted or forged item keys cannot produce live content.
- Rapid layout writes will be serialized client-side so an older response cannot overwrite the latest arrangement.
- The build must not rewrite lyric text, version rows, Diary rows, split percentages, or membership authority.
