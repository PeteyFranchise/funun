# Song Passport Doctrine Consolidation and Internal Handoff - Plan

## Objective

Complete the owner-approved Song Passport consolidation program: produce one authoritative
doctrine, convert it into seven implementation-ready mini-phases, document the current
architecture and safety strategy, and publish a truthful internal reference in The Playbook.

## Scope

- Consolidate every approved Song Passport decision into a versioned doctrine record.
- Audit current works, collaborators, split sheets, contracts, metadata, audio, delivery
  exports and Release Report foundations before proposing new storage.
- Define the target database model, source-authority rules and permission matrix.
- Define seven bounded Phase 37.3 implementation slices with dependencies and acceptance gates.
- Define additive migration/backfill, red-test and rollback strategies.
- Preserve DDEX standards work in Phase 37.4 and partner-validated delivery in Phase 37.5.
- Seed one published Song Passport doctrine entry in The Playbook's Company-wide
  Standards & Doctrine group through a new human-gated migration.
- Add text-lock tests proving the Playbook seed is complete, idempotent and non-destructive.

## Out of Scope

- Claiming the seven product slices are already built or production-ready.
- Implementing Phase 37.3 application schema, API or artist-facing UI in this task.
- Applying any Supabase migration to production.
- Building or claiming certified DDEX delivery, recipient acceptance or distributor APIs.

## Deliverables

- `.planning/deliberations/song-passport-doctrine.md`
- `.planning/phases/37.3-song-passport/37.3-CONTEXT.md`
- `.planning/phases/37.3-song-passport/37.3-ARCHITECTURE.md`
- `.planning/phases/37.3-song-passport/37.3-IMPLEMENTATION-PLAN.md`
- Updated Song Passport TODO, Playbook TODO and roadmap
- `supabase/migrations/150_playbook_song_passport_doctrine.sql`
- `__tests__/migration-150.test.ts`
- `.planning/quick/260901-song-passport-doctrine-consolidation/SUMMARY.md`

## Verification

- Check doctrine coverage against every approved decision category.
- Check current/planned/partner-dependent labels and claims boundaries.
- Check the seven slices have explicit inputs, outputs, red tests and rollback gates.
- Run migration 150's text-lock test and the existing Playbook migration/room tests.
- Run TypeScript checking if code outside SQL/planning is affected.
- Run `git diff --check` on every changed file.

## Safety and Coordination

- Migration 150 is human-gated and must not be pushed by the agent.
- The migration inserts a versioned v1.0 entry only when the exact title is absent; it
  does not update or delete existing Playbook entries.
- Unrelated distributor-option and DDEX worktree changes remain untouched.
