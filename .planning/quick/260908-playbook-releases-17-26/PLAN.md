# Playbook Releases 17–26 — Integrated Enablement Phase

## Objective

Build the next ten internal Team Member Playbook releases as a coherent, permission-aware operating system: secure training media, unified discovery, learning paths, reader feedback, readiness analytics, grounded AI assistance, workflow execution, governed exceptions, live incident response, and global/accessibility support.

## Release Scope

1. **R17 — Secure Video & Training Media:** allowlisted responsive embeds, accessible titles/captions/transcripts, no autoplay, and a private-media contract that never accepts raw iframe HTML.
2. **R18 — Unified Search & Knowledge Finder:** cross-room, section-level search constrained to rooms the Team Member can access.
3. **R19 — Role-Based Learning Paths:** ordered doctrine/media steps, role/person assignments, progress, knowledge checks, and completion milestones.
4. **R20 — Reader Feedback & Content Improvement Queue:** questions, outdated-content reports, missing-doctrine requests, suggestions, ownership, and resolution history.
5. **R21 — Learning & Readiness Analytics:** assignment, learning-path, feedback, and content-health rollups for authorized leaders.
6. **R22 — Ask The Playbook:** grounded, citation-required, room-permission-aware AI answers with an explicit no-answer state and usage ledger.
7. **R23 — Playbook-to-Workflow Automation:** revision-pinned workflow templates and runnable task instances linked to operational records.
8. **R24 — Exceptions & Decision Registry:** time-bounded exception requests, decisions, scope, expiry, and immutable audit events.
9. **R25 — Live Incident & Response Mode:** severity-based incidents, activated runbooks, owners, tasks, timeline, resolution, and post-incident review.
10. **R26 — Global Enablement & Accessibility:** controlled translations, glossary terms, regional variants, locale/timezone preferences, transcript requirements, keyboard access, and accessible rendering.

## Architecture

- All pages and APIs live below `/admin/playbook` or `/api/admin/playbook` and carry server-side Team Member gates.
- Sensitive room access is enforced before content enters search, AI context, analytics, learning paths, workflows, exceptions, or incidents.
- Published doctrine revision numbers are pinned wherever operational activity depends on content.
- AI answers are retrieval-grounded, cite entry/section sources, and are never a source of authorization or policy.
- New state is defined in a single human-gated candidate migration following candidate 205; it remains outside `supabase/migrations`.
- Existing reading assignments, notifications, staff audit logs, and room-lead authority remain the shared primitives.

## Expected Files

- `.planning/quick/260908-playbook-releases-17-26/206_playbook_enablement_platform.sql`
- `lib/playbook/media.ts`, `search.ts`, `learning-paths.ts`, `feedback.ts`, `analytics.ts`, `assistant.ts`, `workflows.ts`, `exceptions.ts`, `incidents.ts`, `global-enablement.ts`
- Corresponding `components/playbook/*` surfaces
- Corresponding `/admin/playbook/*` pages and `/api/admin/playbook/*` routes
- `components/playbook/Rail2.tsx`, `MarkdownDoc.tsx`, and related renderer files
- Focused unit, API, migration-contract, and authorization tests

## Validation

- Unit tests for every pure authorization, state-transition, parsing, filtering, and rollup helper.
- Migration contract tests for RLS, browser-role revocation, service-only functions, immutable history, revision pins, and dependency order.
- Strict TypeScript and targeted ESLint.
- Full Jest suite and optimized Next.js production build.

## Coordination and Safety

- The worktree already contains uncommitted Playbook releases and Phase 38 planning artifacts. This phase will make additive changes and avoid Phase 38 files.
- Migration 200 is applied for Antenna hardening; 203 is permanently retired; 208–209 belong to Phase 38.0.3; 210 is reserved for Phase 38.0.3 Tier 3; and Phase 38.2 moves to 211–212. Playbook candidates 201, 202, 204, 205, and 206 remain unapplied and must not be moved or applied until the owner explicitly sequences them.
- No commit, push, deployment, environment mutation, or database application is included.
