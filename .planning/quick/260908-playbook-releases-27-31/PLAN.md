# Playbook Releases 27–31 — Operational v1

## Objective

Complete the Playbook operational-v1 horizon with controlled activation, one actionable SLA inbox, doctrine dependency impact analysis, governed simulations/certification, and links between Playbook workflows and real Funūn operational records. Add Releases 32–39 to the roadmap as optional enterprise-maturity work.

## Release scope

1. **R27 — Controlled Activation & Beta Cohorts:** server-authoritative feature flags for Releases 28–31, explicit beta cohort membership, percentage-free rollout, emergency disable, activation audit events, and a leadership console. Earlier capabilities retain their existing activation boundaries.
2. **R28 — Playbook Inbox & SLA Center:** permission-filtered work aggregation across reading, learning, feedback, workflows, exceptions, incidents, and simulations; explicit SLA rules, due-state calculation, and direct action links.
3. **R29 — Doctrine Dependency Map:** typed, revision-aware links between entries, learning paths, workflows, simulations, and external operational surfaces; publish-impact warnings and a room-authorized graph view.
4. **R30 — Training Simulations & Certification:** room-lead scenario authoring, role assignment, attempts, human review, time-bounded certification, remediation state, and immutable assessment events.
5. **R31 — CRM & Workspace Integration:** verified links from workflow runs to supported Funūn records, source/target authorization, reusable launch UI, and reciprocal operational visibility without copying private content.

## Architecture

- Candidate migration 207 remains outside `supabase/migrations`, depends on candidates 201/202/204/205/206, and is never applied by the agent.
- All new tables deny browser CRUD; server routes authenticate before using the service client and re-check Playbook room authority.
- Feature activation is server authoritative and defaults off when configuration is absent.
- SLA Inbox rows are derived from authoritative source records; the inbox does not become a second mutable task database.
- Dependencies and certifications pin doctrine revisions.
- Integration links store opaque record identifiers and approved display labels, not copied Member, rights, contract, or workspace content.

## Expected files

- `.planning/quick/260908-playbook-releases-27-31/207_playbook_operational_v1.sql`
- `lib/playbook/operational-v1.ts` and tests
- New `/admin/playbook/activation`, `/inbox`, `/dependencies`, `/simulations`, and `/integrations` pages
- Corresponding `/api/admin/playbook/*` routes and client components
- Playbook navigation and publication-impact integration
- `.planning/ROADMAP.md` and a Releases 32–39 deliberation brief

## Validation

- Pure-function tests for feature evaluation, SLA state, dependency impact, simulation state, certification validity, and supported integration targets.
- Migration contract tests for deny-by-default activation, RLS/browser revocation, revision pins, append-only events, and dependency ordering.
- Targeted ESLint, strict TypeScript, full Jest, optimized Next.js production build, and `git diff --check`.

## Coordination and safety

- Preserve all existing uncommitted Playbook and Phase 38 work.
- Do not edit Phase 38 migration artifacts or assume production schema beyond migration 199.
- Do not commit, push, deploy, apply migrations, or change environment variables.
- Releases 32–39 are roadmap proposals, not authorization to implement them in this phase.
