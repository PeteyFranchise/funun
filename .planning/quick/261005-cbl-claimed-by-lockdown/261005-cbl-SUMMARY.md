---
phase: 261005-cbl
plan: 01
subsystem: database
tags: [postgres, supabase, rls, security-definer, trigger, migration]

requires:
  - phase: 261004-wlk
    provides: "migration 231's auth.role() trigger-guard idiom for a client-forgeable identity-linked column (tracks.work_id)"
provides:
  - "migration 233 (authored, never applied): BEFORE INSERT OR UPDATE guard trigger making collaborators.claimed_by client-immutable"
  - "GUC-gated writer pattern (funun.collaborators_claimed_by_write) extending migration 145's precedent to a second column"
  - "corrected COMMENT ON FUNCTION text on sync_project_membership_for_sheet() and sync_work_membership_on_claim(), replacing the false 'exclusively' claim"
affects: [261005-rwl, collaborator_invites-write-lockdown-followup]

tech-stack:
  added: []
  patterns:
    - "BEFORE INSERT OR UPDATE trigger + auth.role() NULL/service_role check + transaction-local GUC sentinel, for a column with more than one legitimate non-privileged writer"

key-files:
  created:
    - supabase/migrations/233_claimed_by_write_lockdown.sql
    - __tests__/migration-233-claimed-by-write-lockdown.test.ts
    - .planning/todos/pending/261005-cbl-push-and-verify-migration-233.md
  modified: []

key-decisions:
  - "Trigger, not a column REVOKE -- collaborators has never had a table-level REVOKE issued (full-corpus grep confirmed), the exact precondition that made migration 230's column REVOKE a proven silent no-op"
  - "GUC-gated bypass (migration 145's funun.lyric_text_write precedent), not auth.role() alone -- link_existing_member_collaborator() (179) is a legitimate writer that fires under an ordinary roster owner's own authenticated session, indistinguishable from the forgery by role alone"
  - "Guard closes both UPDATE and INSERT forgery paths -- migration 179's auto-link trigger only ever fills a NULL claimed_by, so a client-supplied non-null value at INSERT time was an open path the brief's literal framing did not name"
  - "Two false 'exclusively' comments (079, 136) corrected via refreshed COMMENT ON FUNCTION text, not by editing the landed migrations' -- prose, per this project's do-not-edit-landed-migrations convention"

patterns-established:
  - "For a client-writable column with exactly N legitimate writers, N of which run under a non-privileged role: gate with auth.role() for the privileged writers AND a transaction-local GUC sentinel set immediately before each non-privileged writer's one write statement"

requirements-completed: [QUICK-261005-CBL]

coverage:
  - id: D1
    description: "collaborators.claimed_by is client-immutable to every non-privileged role via direct PostgREST INSERT or UPDATE, enforced by migration 233's collaborators_guard_claimed_by_write trigger"
    requirement: "QUICK-261005-CBL"
    verification:
      - kind: unit
        ref: "__tests__/migration-233-claimed-by-write-lockdown.test.ts#collaborators_guard_claimed_by_write shape, gating, and trigger-attachment assertions"
        status: pass
      - kind: manual_procedural
        ref: ".planning/todos/pending/261005-cbl-push-and-verify-migration-233.md probes (a) and (b)"
        status: unknown
    human_judgment: true
    rationale: "No database (local or production) was reachable from this session -- the Jest test proves the SQL was written with the intended guard; only the owner-run BEGIN/SAVEPOINT/ROLLBACK probes after a real `supabase db push` can prove Postgres enforces it, mirroring migration 231's own limitation."
  - id: D2
    description: "Both legitimate writers (claim_collaborators() and link_existing_member_collaborator()) still succeed after the guard is live, via the funun.collaborators_claimed_by_write GUC"
    requirement: "QUICK-261005-CBL"
    verification:
      - kind: unit
        ref: "__tests__/migration-233-claimed-by-write-lockdown.test.ts#claim_collaborators and link_existing_member_collaborator GUC-ordering assertions"
        status: pass
      - kind: manual_procedural
        ref: ".planning/todos/pending/261005-cbl-push-and-verify-migration-233.md probes (c) and (d)"
        status: unknown
    human_judgment: true
    rationale: "Same database-unreachable constraint as D1 -- the owner-run probes are the only way to confirm the legitimate claim flow was not broken."
  - id: D3
    description: "Every other collaborators column (legal_name, pro, ipi, publisher, mlc_id, soundexchange_id, mailing_address, email, phone, administrator, status) stays roster-owner-writable, including on an already-claimed row -- unchanged, by design"
    verification:
      - kind: unit
        ref: "__tests__/migration-233-claimed-by-write-lockdown.test.ts#scope guard: no table-level GRANT/REVOKE on collaborators, no redefinition of any function outside Parts B/C"
        status: pass
    human_judgment: false

duration: ~55min
completed: 2026-10-05
status: complete
---

# Phase 261005-CBL Plan 01: Collaborators Claimed-By Write Lockdown Summary

**Migration 233 (authored, never applied) closes a direct PostgREST identity-forgery path on `collaborators.claimed_by` with a GUC-gated BEFORE INSERT/UPDATE trigger, not a column REVOKE.**

## Performance

- **Duration:** ~55 min
- **Started:** 2026-10-05 (session start)
- **Completed:** 2026-10-05
- **Tasks:** 2 of 2
- **Files created:** 3

## Accomplishments
- Authored `supabase/migrations/233_claimed_by_write_lockdown.sql`: a new `collaborators_guard_claimed_by_write()` trigger function + trigger rejecting any non-privileged, non-verified-claim write to `claimed_by` on both INSERT and UPDATE (`SQLSTATE 42501`)
- Amended `claim_collaborators()` (076) and `link_existing_member_collaborator()` (179) with exactly one added line each (`PERFORM set_config('funun.collaborators_claimed_by_write', 'verified_claim', TRUE);`), otherwise byte-for-byte identical to their live bodies — both legitimate claim paths keep working
- Corrected the two false "exclusively" comments on `sync_project_membership_for_sheet()` (079) and `sync_work_membership_on_claim()` (136) via refreshed `COMMENT ON FUNCTION` text (the historical `--` prose in those landed migrations cannot be edited under this project's convention)
- Wrote a Jest test (`__tests__/migration-233-claimed-by-write-lockdown.test.ts`, 16 assertions) proving the SQL text only — explicitly labelled as not proving database enforcement — plus a standing corpus invariant on the new trigger
- Filed the owner todo carrying the push step, all four `BEGIN`/`SAVEPOINT`/`ROLLBACK` behavioral probes, a read-only production audit query with its forgery-vs-drift caveat, and three separate, non-blocking findings
- Ran the full six-command Verification Gate — all green

## Task Commits

Each task was committed atomically:

1. **Task 1: Author the corrective migration** — `660500f4` (feat)
2. **Task 2: Test the migration's text, run the Verification Gate, file the owner follow-up** — `df869b38` (test)

**Plan metadata:** pending (this SUMMARY + STATE.md, committed separately by the orchestrator)

## Files Created/Modified
- `supabase/migrations/233_claimed_by_write_lockdown.sql` — the guard trigger, both writer-function amendments, corrected comments, four owner-run probes (human-gated, never applied)
- `__tests__/migration-233-claimed-by-write-lockdown.test.ts` — SQL-text proof only, 16 assertions + 1 standing corpus invariant
- `.planning/todos/pending/261005-cbl-push-and-verify-migration-233.md` — owner's push step, four behavioral probes, read-only audit query, three follow-up findings

## Decisions Made
- Trigger-only protection (zero GRANT/REVOKE against the `collaborators` table itself), because the table has never had a table-level REVOKE issued — the exact precondition that made migration 230's column REVOKE a proven silent no-op on a different table. A trigger's protection does not depend on grant state at all.
- GUC-gated bypass, not `auth.role()` alone, because `link_existing_member_collaborator()` (179) is a legitimate writer that fires under an ordinary roster owner's own `authenticated` session — structurally identical to the forgery this migration stops. Extended migration 145's `funun.lyric_text_write` precedent with a new GUC, `funun.collaborators_claimed_by_write`, sentinel `'verified_claim'`.
- Guard closes INSERT forgery too, not just UPDATE — migration 179's auto-link trigger only ever fills a NULL `claimed_by`, so a client-supplied non-null value at INSERT time was an open path the original brief's literal "set that column directly" framing did not name. Found during investigation (already documented in the plan's context, re-confirmed during execution).
- The two false "exclusively" comments live only in plain `--` file-header prose inside already-landed migrations 079/136 — never in a stored catalog `COMMENT ON FUNCTION`. Correction is a refreshed `COMMENT ON FUNCTION` reissue in migration 233, not an edit to 079/136 themselves (forbidden under this project's convention).

## Deviations from Plan

None in substance — Task 1 and Task 2 were executed exactly as the plan specified, including the pre-write re-verification of migration numbering (232 absent, 233 free — re-confirmed, matching the plan's own at-authoring-time check).

One test-authoring correction made during Task 2, before any commit (not a plan deviation — a self-caught bug in my own first draft of the test, not in the migration):

**1. [Rule 1 - Bug] Jest test's negative GRANT/REVOKE assertion for `link_existing_member_collaborator()` initially false-failed on its own file's corrected comment prose**
- **Found during:** Task 2, first `npx jest` run of the new test (before any commit)
- **Issue:** The test's scope-guard assertion `expect(code).not.toMatch(/(GRANT|REVOKE)[^;]*link_existing_member_collaborator/i)` matched the English word "revokes" inside the migration's own corrected `COMMENT ON FUNCTION public.sync_work_membership_on_claim()` string ("...because migration 136 revokes all client writes..."), because `[^;]*` is unbounded and spans the entire multi-line string literal up to the later mention of `link_existing_member_collaborator()` in the same sentence. The migration SQL itself was correct; only the test's regex was too broad.
- **Fix:** Tightened the regex to `\b(GRANT|REVOKE)\s+(ALL|EXECUTE)\b[^;]{0,120}link_existing_member_collaborator`, anchoring to the actual SQL statement shape (keyword immediately followed by `ALL`/`EXECUTE`) and bounding the lookahead distance, so it can no longer cross from unrelated prose into a function-name mention.
- **Files modified:** `__tests__/migration-233-claimed-by-write-lockdown.test.ts` (fixed before first commit — not part of any committed diff needing a separate commit)
- **Verification:** Re-ran `npx jest __tests__/migration-233-claimed-by-write-lockdown.test.ts` — 16/16 passed
- **Committed in:** `df869b38` (already contains the corrected version; no separate fix commit needed)

---

**Total deviations:** 0 plan deviations; 1 self-caught test-authoring bug, fixed before commit.
**Impact on plan:** None. The migration shipped exactly as planned; the test bug never reached a commit.

## Issues Encountered
None beyond the self-caught test regex issue above.

## Known Stubs
None — every file this plan produced is complete and intended to ship as-is pending the owner's push.

## Threat Flags

None. This migration closes threats T-cbl-01/02/03 already named in the plan's own `<threat_model>`; it introduces no new attack surface (no new network endpoint, no new auth path, no new file access pattern, no schema change — it is a trigger + two one-line function amendments + two comment updates on an existing table).

## User Setup Required

**A database migration requires manual review and push — never applied by this session.** See `.planning/todos/pending/261005-cbl-push-and-verify-migration-233.md` for:
- `supabase db push` after hand review
- All four `BEGIN`/`SAVEPOINT`/`ROLLBACK` behavioral probes (two MUST-FAIL-42501, two MUST-SUCCEED), embedded verbatim in migration 233's own trailing comment
- A read-only production audit query for already-forged rows (candidate-only, not confirmed — stated caveat included)
- Three separate, explicitly non-blocking follow-ups (every other `collaborators` column stays roster-owner-writable; `collaborator_invites` carries the same implicit-FOR-ALL shape; the three consumer chains' non-reversibility)

## Next Phase Readiness
- Migration 233 is ready for owner review and push; nothing in this session blocks it.
- `collaborator_invites`' own inviter-held implicit FOR ALL over `accepted_user_id`/`accepted_at` remains open — recommended as its own follow-up quick task, not started here.
- Coordinate with `261005-rwl` (migration 232, merged but unexecuted as of this writing) — this migration took 233 specifically to avoid colliding with it; no further action needed from this session.

---
*Phase: 261005-cbl*
*Completed: 2026-10-05*
