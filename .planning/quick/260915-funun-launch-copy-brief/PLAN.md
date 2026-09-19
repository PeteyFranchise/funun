# Funūn Launch Copy Brief

## Objective

Store the supplied launch-copy prompt and its first generated campaign draft as reusable Markdown artifacts that future marketing work can build from.

## Scope

- Preserve the supplied role, product context, campaign structure, audience split, and writing constraints.
- Add only a descriptive document title and source note needed to make the artifact understandable in the repository.
- Store the generated B2B and indie campaign copy separately from the source brief so either artifact can be revised without overwriting the other.

## Files Expected to Change

- `docs/marketing/funun-launch-copy-brief.md`
- `docs/marketing/funun-launch-campaign-copy-draft.md`
- `.planning/quick/260915-funun-launch-copy-brief/PLAN.md`
- `.planning/quick/260915-funun-launch-copy-brief/SUMMARY.md`

## Validation Plan

- Read the stored Markdown back and compare its sections with the supplied attachment.
- Confirm the file contains both campaigns, both frameworks, and all four requested assets.
- Confirm the generated draft contains the landing-page, email, social-caption, and short-form-video deliverables.
- Run `git diff --check` and inspect `git status --short`.

## Risks and Coordination Notes

- This is a source brief, not approved public-facing copy.
- The generated campaign copy is a working first draft, not approved public-facing copy.
- No active phase files or application code will be changed.
- Preserve the supplied claims as briefing context; factual product claims should be revalidated when final campaign copy is produced.
