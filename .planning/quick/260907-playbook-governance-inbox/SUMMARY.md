# Playbook Governance Inbox — Release 4 Summary

**Status:** Complete locally
**Date:** 2026-09-07
**Repository action:** No commit, push, migration, or deployment performed

## Delivered

- Added `/admin/playbook/governance` as a read-only cross-room operating queue.
- Leadership receives all Playbook rooms; non-leadership users receive only rooms they both lead and are authorized to access.
- Added independent page authorization before any service-role entry read.
- Restricted the dashboard query and client payload to governance metadata. Published `content` and pending `draft_content` are explicitly excluded by a tested field allowlist.
- Added classifications for pending approval, source updates, overdue or unscheduled reviews, missing owners, missing Gameplan links, and retired entries.
- Added high-level counts, search, room filtering, issue filtering, priority sorting, entry metadata, and links into the existing independently guarded room/article workflows.
- Added a Rail 2 link only when the viewer has governance scope.
- Kept all approval, rejection, lifecycle, and metadata mutations in their existing server-guarded routes.

## Verification

- `git diff --check` — passed.
- Governance unit tests — 7 passed.
- Complete Jest suite — 516 suites and 5,886 tests passed.
- TypeScript — passed.
- Targeted ESLint — passed with zero warnings.
- Next.js production build — passed; `/admin/playbook/governance` emitted as a dynamic server route.

The first production-build attempt caught a client/server boundary import from the pure governance helper into `next/headers`. The helper was isolated from the server-only room module, then TypeScript and the production build passed.

## Coordination note

Claude advanced `main` from `56103068` to `af173bc2` while this work was in progress. The final typecheck and production build ran against the newer shared-tree state. No Phase 38 workspace authorization file or migration was edited by this build.

## Release gate

This interface depends on the still-local rich-document schema draft in `.planning/quick/260907-playbook-rich-documents/DRAFT-MIGRATION.sql`. It should not be committed or deployed until the schema migration is reviewed, assigned a safe migration number after concurrent work settles, and applied through the owner-controlled migration workflow.
