# Playbook Releases 27–31 — Implementation Summary

## Outcome

Releases 27–31 are implemented locally as a coordinated, default-off operational layer. Releases 32–39 are documented as gated enterprise-maturity proposals. Nothing was committed, pushed, deployed, or applied to a database.

## Completed releases

- **R27 — Controlled Activation & Beta Cohorts:** leadership activation console, explicit cohorts and capability grants, revocation, emergency stop, server-authoritative evaluation, and append-only control events.
- **R28 — Playbook Inbox & SLA Center:** permission-filtered reading, learning, feedback, workflow, exception, incident, and simulation work; configurable SLAs; source-derived due dates; urgency filtering and sorting.
- **R29 — Doctrine Dependency Map:** revision-pinned dependency records, room-lead authoring, visible stale links, and a publish-impact confirmation that prevents silent downstream breakage.
- **R30 — Training Simulations & Certification:** published-doctrine scenarios, role assignments, complete-prompt validation, human review, remediation and retries, expiring certificates, and atomic review/certification/audit recording.
- **R31 — CRM & Workspace Integration:** workflow links to Member onboarding, Client Partners, deals, buyer briefs, call logs, owned releases, and active workspace memberships. Labels and internal destinations are server-derived; source permissions are checked at link time and every render; linking and its audit event are atomic.

## Safety architecture

- Candidate migration `207_playbook_operational_v1.sql` remains under `.planning/quick/` and depends on candidates 201, 202, 204, 205, and 206.
- Every new capability defaults disabled and emergency-stopped. A user needs both an enabled control and an active cohort grant.
- New operational tables have RLS enabled and browser CRUD revoked.
- Server routes authenticate before using the service-role client and re-check room or source-record authority.
- Certifications and operational links use service-only transactional database functions so the state and immutable event cannot diverge.
- Candidate functions use the hardened empty `search_path`; simulation review takes a `FOR NO KEY UPDATE` lock so child event inserts do not unnecessarily conflict with the locked parent attempt.
- The inbox derives its work from authoritative source tables instead of copying tasks into a shadow database.

## Roadmap

Added `.planning/deliberations/playbook-releases-32-39-roadmap.md` covering:

1. R32 Integration Hub
2. R33 AI Doctrine Studio
3. R34 Coverage & Continuity
4. R35 Audit & Evidence Packages
5. R36 Mobile & Offline Field Guide
6. R37 Knowledge Health Intelligence
7. R38 Partner Enablement Portals
8. R39 Business Continuity & Recovery

The existing post-39 exploration brief remains separate and unscheduled.

## Verification

- `npm run lint` — passed
- `npm test -- --runInBand` — passed, 555 suites / 6,664 tests
- `npm run typecheck` — passed
- `npm run build` — passed, including all five new pages and their API routes
- `git diff --check` — passed

## Human-gated next steps

1. Reconcile candidate migrations 201/202/204/205/206/207 against the production migration ledger.
2. Have security and product owners review the activation, certification, and cross-record authorization model.
3. Apply the candidate chain only through the existing human migration gate.
4. Create a small named beta cohort, enable one capability at a time, and keep the emergency stop available.
5. Verify production behavior with separate leadership, room-lead, ordinary Team Member, reassigned-record, and revoked-cohort accounts before expanding access.
