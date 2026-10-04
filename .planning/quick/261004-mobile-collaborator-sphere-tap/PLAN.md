# Mobile Collaborator Sphere Tap Fix

## Objective

Make the marketing-page collaborator sphere reveal a person's details with one deliberate tap on touch devices without triggering text/image selection or the native copy/find/lookup callout.

## Scope

- Preserve drag-to-spin and desktop hover behavior.
- Distinguish a tap from a drag before opening details.
- Keep tap-selected details visible until another avatar or the sphere background is tapped.
- Suppress selection, image dragging, and the native touch callout within the sphere.
- Update the visible and accessible instructions to say `tap or hover`.
- Add focused regression assertions to the existing generated-artifact test.

## Files expected to change

- `assets/marketing/landing.html`
- `scripts/marketing-artifact.test.ts`
- This quick task's `SUMMARY.md` after validation

## Validation plan

- Run the focused marketing artifact test suite.
- Run the marketing artifact verification command if its frozen-source prerequisite remains available.
- Run a JavaScript syntax check against the artifact's inline script.
- Run `git diff --check` on the task paths.

## Risks and coordination

- Claude has unrelated in-progress edits in the marketing files. Changes must be minimal and confined to the collaborator-sphere CSS, copy, behavior, and focused test assertions.
- Pointer capture can make `pointerup` target the sphere instead of the avatar; retain the avatar selected at `pointerdown` and cancel the tap when movement exceeds the threshold.

## Workflow note

Native `/gsd-quick` invocation is unavailable in this Codex session, so the AGENTS.md manual quick-task fallback is being used.
