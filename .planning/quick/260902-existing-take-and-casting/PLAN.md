# Existing Take Evidence and Direction-to-Performer Casting

## Objective

Close the Writer's Room's remaining vocal/evidence gaps: make “Attach an existing take” select a real, playable earlier recording, and give a saved vocal direction an explicit path to a named performer while preserving both facts.

## Scope

- Add a reusable existing-take picker with signed playback, version labels, and one explicit selection.
- Offer only non-AI-tagged takes that precede the AI-assisted target version; exclude the target itself.
- Use the selected take as `humanSourceVersionId` in both first-AI-entry and “Not sure” flows.
- Harden the AI-entry route so a human source must belong to the work, must not already be AI-tagged, and—when a target version exists—must predate it.
- Add an explicit “Assign performer” action when a lyric section has vocal direction but no named performer.
- Preserve `vocal_direction` when performers are added, and preserve performers when direction is edited.
- Add no schema changes and no new services.

## Files Expected to Change

- `lib/catalogue/human-source-takes.ts`
- `lib/catalogue/human-source-takes.test.ts`
- `components/catalogue/ExistingTakePicker.tsx`
- `components/catalogue/ExistingTakePicker.test.tsx`
- `components/catalogue/HumFirstMoment.tsx`
- `components/catalogue/HumFirstMoment.test.tsx`
- `components/catalogue/AiEntryFlow.tsx`
- `components/catalogue/AiEntryFlow.test.tsx`
- `components/catalogue/LyricBlockCard.tsx`
- `components/catalogue/LyricBlockCard.test.tsx`
- `components/catalogue/WorkPage.tsx`
- `components/catalogue/WorkPage.test.tsx`
- `app/(artist)/vault/works/[workId]/page.tsx`
- `app/api/works/[workId]/ai-entries/route.ts`
- `app/api/works/[workId]/ai-entries/route.test.ts`
- `.planning/quick/260902-existing-take-and-casting/SUMMARY.md`

## Validation Plan

- Pure tests cover chronological filtering, target exclusion, and AI-tag exclusion.
- Render tests cover playable take selection, empty state, explicit direction-to-performer CTA, and preservation copy.
- API tests prove same-work, non-AI, and earlier-than-target enforcement.
- Run focused Jest and ESLint, TypeScript, full lint, full Jest, and `git diff --check`.

## Risks / Coordination Notes

- A timestamp proves sequence, not human authorship by itself; the UI calls these earlier takes and the existing receipt remains the artist's attestation.
- Signed playback URLs stay server-generated and short-lived; the picker receives them as serialized props and constructs no storage path.
- No migration is required, so the verified build can be committed and pushed immediately.
- The owner may have a live dev server; do not run `npm run build` against the shared `.next` directory.
