# Playbook Rich Documents — Release 1 Summary

**Status:** Complete locally; uncommitted by owner request
**Migration:** Drafted and text-tested; not copied into `supabase/migrations`, numbered, or applied
**Deployment:** Not attempted

## Delivered

- Added the `document` entry type alongside existing executable `sop` and CRM `topic` entries.
- Added strict, bounded Zod schemas for all three content shapes.
- Added stable slugs and a room-scoped rich-document reader route.
- Rendered Markdown without raw HTML, arbitrary remote images, or unsafe URL protocols.
- Added typed Note, Tip, Caution and Warning callouts.
- Added deterministic duplicate-safe heading anchors, an article table of contents, and responsive tables.
- Added subgroup filing with matching server-side and drafted database constraints.
- Added document formatting helpers, live preview, word/character counts, and page-exit draft warnings.
- Added explicit Save Draft and Publish controls for approvers.
- Preserved the current published article while a revision awaits approval.
- Restricted pending draft text to its author and room approvers even though reads use the service role.
- Added separate optimistic locks for published revisions and pending-draft versions.
- Made stale edit/approval/rejection attempts return HTTP 409 instead of overwriting newer work.
- Prevented approval of a missing draft from publishing an empty placeholder.
- Archived rejected never-published drafts without unpublishing an existing live article.
- Preserved the existing rule that only published Topic entries populate CRM Gameplans.

## Draft schema artifact

`.planning/quick/260907-playbook-rich-documents/DRAFT-MIGRATION.sql`

The draft adds document/lifecycle constraints, slugs, ordering, publication metadata, source-adoption metadata, draft authorship/version fields, immutable published revisions, same-room subgroup integrity, indexes and fail-closed revision-table permissions. It also repairs the legacy state where a pending edit could temporarily hide already-published content.

Claude reserved migration numbers 201–202 in `.planning/ROADMAP.md`. The draft intentionally remains outside the live migration chain until concurrent Phase 38 changes are reconciled and the owner authorizes migration adoption.

## Verification

- `npm run typecheck`
- Focused Jest suites for content validation, lifecycle transitions, draft privacy, safe callouts/headings, create-route authorization, edit-route authorization/concurrency, CRM Topic compatibility and the draft SQL contract
- ESLint on all changed application and test files with zero warnings
- `git diff --check`
- `npm run build` — production build passed; the new `/admin/playbook/[room]/[slug]` route compiled successfully

## Deliberately deferred

- Mermaid diagrams and sanitised diagram rendering
- Repository Markdown adoption/source-change notices
- Published-versus-draft visual diff
- Review dates and reminders
- Full-text search and filtering
- Publication of the organizational doctrine package into the production Playbook
- Any commit, push, migration application or deployment

## Reconciliation checklist

1. Confirm Claude's Phase 38 work is complete and inspect overlapping files.
2. Rebase or merge without discarding either working set.
3. Assign the reserved migration number only after checking the live migration ledger again.
4. Review the draft SQL as a human-gated production migration.
5. Re-run the focused suites, full typecheck, lint and production build.
6. Commit application code and the adopted migration in reviewable units.
7. Have the owner apply the migration, then deploy and verify the reader/editor workflow with a Team Member account and an approver account.
