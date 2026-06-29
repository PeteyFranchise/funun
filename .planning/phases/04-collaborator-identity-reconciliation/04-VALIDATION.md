---
phase: 4
slug: collaborator-identity-reconciliation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-29
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None — no test runner installed (consistent with Phases 1–3) |
| **Config file** | None |
| **Quick run command** | N/A — manual smoke test against local Supabase dev instance |
| **Full suite command** | N/A |
| **Estimated runtime** | ~5–10 min per manual wave check |

---

## Sampling Rate

- **After every task commit:** Manual smoke test of the specific behavior changed
- **After every plan wave:** End-to-end smoke: signup with email matching an existing collaborator → verify `claimed_by` is set → verify back-fill propagates → verify UI reflects claim status
- **Before `/gsd-verify-work`:** All 5 ROADMAP.md success criteria verified manually against local Supabase

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 04-DB-01 | DB migration | 1 | COLLAB-05 | T-mass-assign | `claimed_by` only written by SECURITY DEFINER function, never by user session | manual | — | ❌ Wave 0 | ⬜ pending |
| 04-DB-02 | DB migration | 1 | COLLAB-05 | T-claim-spoof | `claim_collaborators()` RPC only writeable via service role; user session cannot call directly | manual | — | ❌ Wave 0 | ⬜ pending |
| 04-MW-01 | Middleware | 1 | COLLAB-05 | T-elev-priv | Middleware reads `claimed_at` from artist_profiles; null triggers service-role RPC, never trusts client header | manual | — | ❌ Wave 0 | ⬜ pending |
| 04-API-01 | user_profiles API | 2 | COLLAB-05 | T-mass-assign | PATCH /api/user-profiles only updates `USER_PROFILES_EDITABLE_FIELDS`; `id`, `claimed_by`, timestamps are silently dropped | manual | — | ❌ Wave 0 | ⬜ pending |
| 04-API-02 | collaborators API | 2 | COLLAB-05 | T-delete-claim | DELETE on collaborator row where `claimed_by IS NOT NULL` returns 403; only archive is allowed | manual | — | ❌ Wave 0 | ⬜ pending |
| 04-API-03 | back-fill API | 2 | COLLAB-05 | T-backfill | Back-fill on settings save never overwrites existing non-NULL `pro`, `ipi`, `publisher`, `phone`, `address` on collaborator rows | manual | — | ❌ Wave 0 | ⬜ pending |
| 04-UI-01 | /collaborators page | 3 | COLLAB-05 | — | N/A | manual UI | — | ❌ Wave 0 | ⬜ pending |
| 04-UI-02 | Dashboard credits | 3 | COLLAB-05 | — | N/A | manual UI | — | ❌ Wave 0 | ⬜ pending |
| 04-UI-03 | MetadataStudio picker | 3 | COLLAB-05 | — | N/A | manual UI | — | ❌ Wave 0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- No test framework installed — all verification is manual smoke testing against local Supabase dev instance.
- This is consistent with Phases 1–3 (same finding across the Wave 2 build).

*If a test framework is added in a future phase, Wave 0 for that phase should stub COLLAB-05 behaviors.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Email-based claim links collaborator rows to new user on signup | COLLAB-05 | No test runner; DB trigger must be verified against live Supabase | 1. Add collaborator with email X to a test artist roster. 2. Sign up a new account with email X. 3. Query `collaborators WHERE email = X` — verify `claimed_by` = new user's UUID and `claimed_at` is set on `artist_profiles`. |
| Back-fill on settings save propagates rights fields to claimed rows | COLLAB-05 | No test runner; requires a live user_profiles row + claimed collaborator row | 1. After claim, update user_profiles with `pro = 'ASCAP'`, `ipi = '12345'`. 2. Save settings. 3. Query collaborator row — verify `pro` and `ipi` are now set; existing non-NULL fields are unchanged. |
| Archive replaces delete for claimed collaborators | COLLAB-05 | No test runner; UI flow + API guard | 1. Claim a collaborator row. 2. On /collaborators My Roster, confirm delete button is replaced by Archive. 3. Confirm DELETE /api/collaborators/:id returns 403. 4. Archive the collaborator — confirm it disappears from active view, appears in Archived filter. |
| Credits view shows all projects the logged-in user is credited on | COLLAB-05 | No test runner; cross-user query | 1. As artist A, add collaborator with email Y to split sheet on Project P. 2. Sign up as user Y. 3. Navigate to /collaborators → My Credits — confirm Project P appears with correct role and split-sheet link. |
| Favorites star toggle persists | COLLAB-05 | No test runner; UI state + DB | 1. Star a collaborator on /collaborators. 2. Hard refresh. 3. Confirm star is still filled. 4. Open MetadataStudio picker — confirm starred collaborator appears in Favorites group at top. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies documented
- [ ] Manual smoke tests cover all 5 ROADMAP.md success criteria
- [ ] Security threat mitigations verified for T-mass-assign, T-claim-spoof, T-elev-priv, T-delete-claim, T-backfill
- [ ] No watch-mode flags
- [ ] `nyquist_compliant: true` set in frontmatter when all manual verifications pass

**Approval:** pending
