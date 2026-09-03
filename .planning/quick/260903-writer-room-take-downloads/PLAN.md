# Writer's Room Take Downloads — Plan

## Objective

Let every current Writer's Room member download active or archived audio takes with clear, safe filenames while preserving the room's existing private-access boundary.

## Scope

- Derive a safe filename from the song title, immutable version number, optional take name, and stored audio extension.
- Reuse the page's existing two-hour signed audio URLs, adding download disposition server-side after room access has been resolved.
- Add a Download action to playable active take cards.
- Add a Download action to archived takes whether or not the viewer may restore them.
- Keep downloads out of the diary and unrelated to working-take, master, rights, splits, registration, review, or archive state.

## Files expected to change

- `lib/catalogue/take-workflow.ts` and tests
- `app/(artist)/vault/works/[workId]/page.tsx`
- `components/catalogue/WorkPage.tsx` and tests
- `components/catalogue/TimedTrackPlayer.tsx` and tests
- This quick task's `SUMMARY.md`

## Validation

- Focused filename and static-render tests.
- TypeScript, ESLint, complete Jest suite, production Next.js build, and `git diff --check`.

## Risks and coordination

- Never expose a raw storage path or mint URLs before work membership is authorized.
- Preserve the original stored extension instead of labelling compressed uploads as WAV.
- Filenames are presentation only; downloading must perform no database mutation.
- Manual GSD quick fallback is used because Codex cannot invoke Claude's native `/gsd-quick` command in this environment.
