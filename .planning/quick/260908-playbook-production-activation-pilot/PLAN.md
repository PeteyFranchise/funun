# Release 9 — Playbook Production Activation and Doctrine Pilot

## Objective

Prepare the Playbook for a controlled production activation without bypassing migration ownership or publication review. The release must fail gracefully before migrations 201–202 are installed, require a completed UAT pass before the first A&R draft is created, and keep the remaining doctrine package held until the pilot is fully published and its legacy entries are resolved.

## Scope

- Add a clear activation-blocked state when rich-document or reading-operation schema is unavailable.
- Add an A&R-first pilot progression to Doctrine Readiness.
- Require all session UAT checks before the guided A&R pilot can create a draft.
- Hold non-pilot guided draft creation until the A&R replacement is published and its existing legacy entries are superseded.
- Let the governor download a timestamped UAT evidence report.
- Add a read-only local migration-ledger preflight that refuses promotion while 199–200 are absent or 201–202 collide.
- Add an owner-facing production activation runbook covering migration, deployment, UAT, pilot, and forward-fix boundaries.
- Preserve preview access, direct Playbook authoring, room workflow, and all existing server-side authorization.

## Files Expected To Change

- `lib/playbook/activation.ts` and tests
- `app/(admin)/admin/playbook/publication/page.tsx`
- `components/playbook/PublicationActivationGate.tsx`
- `components/playbook/PublicationReadinessQueue.tsx`
- `components/playbook/GuidedDoctrineAdoption.tsx`
- `lib/playbook/activation-preflight.ts` and tests
- `scripts/check-playbook-activation.ts`
- `docs/playbook/PRODUCTION-ACTIVATION-RUNBOOK.md`
- `package.json`
- This release summary

## Validation Plan

- Unit-test pilot state and package-unlock decisions.
- Run focused Playbook tests, TypeScript, targeted ESLint, and `git diff --check`.
- Do not run `next build` while the owner’s development server may be active; the prior production build already verified the Release 8 route surface.

## Risks And Coordination Notes

- Phase 38.2 migrations 199–200 are reserved and absent. Do not author, renumber, promote, or apply migrations in this release.
- Candidate migrations 201–202 stay outside `supabase/migrations`.
- UAT evidence downloaded from the browser is an operator handoff artifact, not a database record.
- No doctrine is imported, published, or superseded by implementation or tests.
