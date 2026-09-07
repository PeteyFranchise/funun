# Phase 38 — Adversarial Audit Baseline

**Status:** Authoritative shared baseline. Agreed by the project owner, Claude and Codex, 2026-09-06.
**Supersedes:** nothing. **Superseded by:** nothing yet.

Codex performed an external adversarial security and logic audit of Phase 38 (Member Organization
& Team Workspaces) at commit `74cbb42d` and returned 22 findings with a **DO NOT BROADEN THE
WORKSPACE BETA** release decision. This document is the agreed record of that audit and everything
decided since. Both parties confirmed alignment; Codex will treat this as the baseline for future
Phase 38 work.

## Shared release position

> Do not broaden the Member Organization and Team Workspaces beta until Phase 38.0.1 is implemented
> and its required live-database verification has passed. Keep D-56 disabled while the grantless and
> deferred authorization paths remain unresolved.

## Two corrections to the original audit, accepted by Codex

1. **F3 predates Phase 38.** Migration 078 already contained the vulnerable editor-side ownership
   reassignment pattern. Phase 38 expanded its reach but did not originate the flaw. It therefore
   gets its own migration and its own review, and the fix must cover owner, co-owner/editor AND
   workspace callers.
2. **F22 is load-bearing, not Low.** A nullable `relationship_id` behaves as a wildcard under
   migration 186's helper, undermining F4's custody binding — the binding would attach to whichever
   relationship happened to join. Promoted into Phase 38.0.1.

Both corrections make the remediation broader, not narrower. Neither changes the release decision.

## Shipped 2026-09-06 (migration 187, live in production)

| Finding | Severity | Resolution |
|---|---|---|
| **F1** unilateral custody takeover | CRITICAL | Closed at **both** layers. The workspace owner/admin branch was DELETED from `assertMayOffer` (not narrowed); `assertMayRespond` refuses self-resolution; migration 187's trigger independently refuses a non-custodian offerer. The accept path gained the stale-custodian guard, closing F9's dangerous half. |
| **F7** kill switch did not cover service routes | HIGH | Closed, and wider than the audit specified. Two of the five proposed exemptions were rejected — "no `workspaceId` at creation" and "not yet a member" justify skipping a *membership* check, not a *global* one. Workspace creation and invitation acceptance are gated; `roster/relationships` is gated on **`accept` only**, because D-18 makes a Member's revocation unconditional and disabling their escape hatch during an incident would trap them in the relationship the control exists to contain. |
| **F10** inverted invitation rate limit | MEDIUM | Corrected and verified isolated — every other call site in the codebase, including Phase 38's own roster route, uses the correct polarity. Behavioral test drives the real counting semantics. |

## Phase 38.0.1 — planned, checker-passed, NOT executed

Covers **WSR-01–06, 14, 15, 17, 20, 22, 24, 25, 27** → audit findings **F2, F3, F4, F6, F8, F12,
F18, F19, F22**. 14 plans, 6 waves.

Implementation direction, agreed by both parties:

- Remove the workspace RLS branch from `tracks`, `vault_assets`, `vault_documents`, `tool_outputs`.
- Move authorized reads to `SECURITY DEFINER` RPCs with explicit column allowlists.
- Retain only a narrowed workspace branch on `vault_projects`.
- Establish grant authority at the **Member consent origin**; no unaudited service-role seed.
- Immutable `parent_grant_id` lineage, revalidated at use time.
- Block `user_id` reassignment with a **`BEFORE UPDATE` trigger**, because a Postgres RLS
  `WITH CHECK` sees only the NEW row and cannot compare against OLD.
- Address F18 via the set-based paginated RPC rather than a separate fixed-limit patch.
- Resolve nullable relationship binding **before** relying on custody-bound authorization.

## Phase 38.0.2 — deferred

**F5, F8, residual F9, F11, F13–F17, F20, F21, F23-equivalent, S1.**

> **These deferrals are acceptable ONLY while D-56 remains disabled. That condition is part of the
> security boundary, not an optional rollout preference.** — Codex, concurring.

F5 and F8 need no grants to exploit, so the switch is their sole containment. F9 has now been
deferred twice; its dangerous half is mitigated, the split-brain window is not.

## Verification still required

Both parties agree migration text-lock tests prove only that the SQL matches what was authored —
**they do not prove runtime authorization semantics.** Phase 38 shipped with 4,788 green tests and
a live critical custody-takeover path.

Outstanding:

- [ ] Execute the 57-step `38-RLS-SMOKE-CHECKLIST.md`
- [ ] Run the named adversarial scenarios against live PostgreSQL
- [ ] Verify RLS recursion behaviour in the real database (audit item **S2**)
- [ ] Complete the `EXPLAIN ANALYZE` performance gate
- [ ] Perform and document the D-56 disable drill
- [ ] Preserve owner-run live verification wherever Jest cannot provide meaningful evidence

Migrations 182–187 being active without a total outage is useful operational evidence against an
immediately catastrophic recursion fault — **but it is not a substitute for the explicit checks.**

## ⚠ One item where the baseline and reality may differ

Codex's acknowledgement lists the D-56 kill switch as disabled under *Confirmed production state*.
**As of this writing that is UNVERIFIED.** It was recommended and agreed but no confirmation exists,
and the agent cannot read the config row: `supabase db query` targets the LOCAL database and local
Postgres is not running in this environment. Only `supabase migration list` works remotely, via the
management API.

**To verify or set it**, use the Supabase dashboard SQL editor, `psql` against the production
connection string, or — cleanest, since it is purpose-built and logs via `logStaffAction` — the
leadership-only route:

- `GET /api/admin/workspaces/access` — read current state
- `POST /api/admin/workspaces/access` with `{ "enabled": false, "reason": "..." }` — disable

Phase 38.0.1's plan 01 reads the config row as a pre-flight probe and will surface the true state
before any migration is authored.

## Provenance

- Audit performed by Codex, 2026-09-06, at commit `74cbb42d`, read-only.
- Findings F1/F3/F6/F10 independently re-verified by direct source inspection before any action.
- P0 remediation: `.planning/quick/260906-phase38-p0-security-hotfix/`
- Phase 38.0.1: `.planning/phases/38.0.1-workspace-authorization-remediation/`
- Locked doctrine unchanged throughout: `38-CONTEXT.md` D-01..D-56.
