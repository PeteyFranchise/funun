# Release 8 — Guided Doctrine Adoption

## Objective

Turn the Doctrine Readiness queue into a safe, review-first bridge from the approved repository doctrine package into database-backed Playbook drafts. Markdown remains an optional import source; future Playbook entries may continue to originate directly in the Playbook editor.

## Scope

- Load doctrine content only from allowlisted publication-manifest entries.
- Extract the exact referenced Markdown heading section, or the document body for whole-file sources.
- Show source and rendered previews together with destination, source hash, reviewers, Gameplans, collisions, and supersession notices.
- Check the extracted source against existing adoption metadata before enabling an action.
- Create at most one unpublished review draft after explicit confirmation, using the existing adoption API.
- Never publish, overwrite a live entry, bulk-adopt, or alter migration state.

## Files Expected To Change

- `lib/playbook/publication-source.ts` and tests
- `app/api/admin/playbook/publication/source/route.ts` and tests
- `components/playbook/GuidedDoctrineAdoption.tsx`
- `components/playbook/PublicationReadinessQueue.tsx`
- `next.config.mjs`
- This quick-plan summary

## Validation Plan

- Unit-test heading slugging and exact section/document extraction.
- Route-test manifest allowlisting, room mismatch rejection, authorization ordering, and successful source response.
- Run targeted Playbook tests, TypeScript, targeted ESLint, production build, and `git diff --check`.

## Risks And Coordination Notes

- Claude is concurrently working on Phase 38; do not touch Phase 38 files or active migrations.
- Candidate Playbook migrations 201–202 remain outside the active migration chain until Phase 38.2 owns 199–200.
- Runtime file tracing must include only the four canonical doctrine source files used by the manifest.
- Source preview authorization must require Leadership or the target room lead before any file content is returned.
