---
phase: 05
slug: launchpad-checklist
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-07-01
---

# Phase 05 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| artist browser → launchpad_progress | Artists must only read/write their own completion rows | completion state (item_key, completed, project_id) |
| admin write → launchpad_checklist_items | Item definitions are admin-managed; artist clients must not write | checklist item content, ordering |
| unauthenticated request → protected pages | Middleware must block /launchpad and /admin without a session | route access |
| non-admin user → /admin/* | The (admin) layout must redirect non-admins before any admin content renders | route access, admin UI |
| supply chain → npm install | Three new @dnd-kit packages introduced into the dependency tree | package code |
| artist client → checklist GET | Must not leak unapproved tips or other users' progress | tip_body, tip_draft, progress rows |
| artist client → progress PATCH | Must not let a user write another user's completion row | user_id, item_key, completed |
| any user → /api/admin/* | Only is_admin users may list, create, edit, delete, or approve | checklist items, tips |
| admin client → checklist PATCH | Only allowlisted fields may be written (no mass assignment) | item fields |
| request param → SQL | itemKey flows into a WHERE clause and must be constrained | itemKey string |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-05-01 | Elevation of Privilege | launchpad_progress rows / progress PATCH | high | mitigate | RLS policy `USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)` on `launchpad_progress` (migration 028); PATCH handler forces `user_id` to session `user.id`, never reads it from the body — verified in `app/api/launchpad/[projectId]/checklist/route.ts` | closed |
| T-05-02 | Elevation of Privilege | /admin/* routes + admin API handlers | critical | mitigate | `(admin)` layout redirects non-admins to `/`; every `/api/admin/*` handler independently calls `verifyAdmin()` (`lib/admin/gate.ts`) before any data access — defense in depth confirmed, not solely reliant on the layout gate | closed |
| T-05-03 | Tampering | orphaned progress rows after item delete | low | mitigate | FK `item_key REFERENCES launchpad_checklist_items(key) ON DELETE CASCADE` in migration 028 — verified | closed |
| T-05-04 | Information Disclosure | unauthenticated /launchpad access | medium | mitigate | `middleware.ts` `isProtected` matches `/launchpad` and `/admin`, redirecting sessionless requests to `/signin` — verified | closed |
| T-05-05 | Information Disclosure | checklist GET tip fields / server→client props | high | mitigate | API and server component both null `tip_body` unless `tip_approved`, and destructure out `tip_draft`/`tip_drafted_at`/`author` before responding or passing client props — verified in `app/api/launchpad/[projectId]/checklist/route.ts` | closed |
| T-05-06 | Information Disclosure | cross-project progress read | medium | mitigate | GET scopes project by `.eq('user_id', user.id)` (404 on non-owned) and progress query by `.eq('user_id', user.id)` | closed |
| T-05-07 | Tampering | checklist item PATCH body (mass assignment) | high | mitigate | `EDITABLE_FIELDS` allowlist enforced in `app/api/admin/checklist/[itemKey]/route.ts` — verified | closed |
| T-05-08 | Tampering | itemKey in WHERE/DELETE path | medium | mitigate | `itemKey` validated against `KEY_REGEX` (`/^[a-z0-9_]+$/`) before use in both checklist and tips admin routes — verified | closed |
| T-05-09 | Tampering | client-driven reorder/delete (admin UI) | high | mitigate | Reorder/edit/delete route through Plan 05 service-role endpoints, which re-validate the admin gate, field allowlist, and itemKey regex — client cannot bypass | closed |
| T-05-SC | Tampering | @dnd-kit npm installs | high | accept | All three packages audited OK in RESEARCH.md § Package Legitimacy Audit (18M+ weekly downloads, single upstream source, MIT license); no [ASSUMED]/[SUS]/[SLOP] flags | closed |

*Status: open · closed · open — below {block_on} threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|--------------|------|
| R-05-01 | T-05-SC | @dnd-kit (core, sortable, utilities) audited during Plan 02 — 18M+ weekly downloads, single verified upstream (github.com/clauderic/dnd-kit), MIT license, no typosquat/malware indicators | Plan 02 threat model | 2026-07-01 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-01 | 10 | 10 | 0 | /gsd-secure-phase (orchestrator, L1 grep-depth verification against plan-time register) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-01
