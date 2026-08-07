---
phase: 21
slug: cross-account-collaboration-sheet-sync
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-01
---

# Phase 21 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Transcribed from the `<automated>` verify blocks already carried by every task in
> 21-01 through 21-05, conforming to 21-RESEARCH.md § "Validation Architecture".

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest ^30.4.2 (ts-jest ^29.4.11, `transform: ts-jest`, `testEnvironment: node`) |
| **Config file** | `jest.config.js` |
| **Quick run command** | `npx jest <touched-file>.test.ts` (e.g. `npx jest lib/vault/membership.test.ts`) |
| **Full suite command** | `npm test` (runs `jest`) |
| **TypeScript gate** | `npx tsc --noEmit` (paired with jest for the UI/route/build tasks that carry no dedicated unit file) |
| **Estimated runtime** | Quick single-file ~10–15s (ts-jest cold start); full suite (~89 suites) ~2–3 min |

**No live-RLS harness exists in this repo.** Migrations are verified two ways, mirroring
`__tests__/migration-064.test.ts`: (1) an automated **string-assertion test** that reads the
migration file and asserts its structure (SECURITY DEFINER + `search_path=''`, EXECUTE
revoke/grant, policy split, child-table project-scoping, backfill, `NOTIFY pgrst`), and
(2) a **manual live smoke matrix** run at the human-gated push. The live access-control
assertions (owner sees own / viewer sees shared / non-member blocked / viewer cannot mutate /
only owner deletes) are therefore human-gated by necessity — every prior human-gated migration
(058, 062, 064, 066, 076) relied on exactly this manual checklist at push time. This is reflected
honestly in the Manual-Only Verifications section below.

---

## Sampling Rate

- **After every task commit:** Run `npx jest <touched-file>.test.ts` (targeted); pair with
  `npx tsc --noEmit` for the route/UI/build tasks.
- **After every plan wave:** Run `npm test` (full suite — this repo's per-wave convention).
- **Before `/gsd-verify-work`:** Full suite green, **plus** the human-gated live RLS access-matrix
  smoke (21-01-03) and the auto-membership smoke (21-02-03) approved.
- **Max feedback latency:** ~15 seconds (single-file quick run); ~3 minutes at the full-suite wave gate.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 21-01-01 | 01 | 1 | ②-membership | T-21-02 | Role capability matrix (source of truth the SQL mirrors): `canView` all four roles; `canEdit` owner/co-owner/editor NOT viewer; `canManageGuests` owner/co-owner; `canDelete` owner-only; unknown role → false everywhere | unit (pure) | `npx jest lib/vault/membership.test.ts` | in-task RED-first | ⬜ pending |
| 21-01-02 | 01 | 1 | ①-access-model, ②-membership | T-21-01 / T-21-03 / T-21-04 / T-21-05 / T-21-06 / T-21-14 | RLS structure (string-assertion): SELECT owner-OR-member; UPDATE owner-OR-co-owner/editor; DELETE owner-only; INSERT owner-only; child tables project-scoped via helpers (never own user_id, except nullable fallback on vault_documents/tool_outputs); DEFINER helper pair breaks 42P17; guest-list INSERT/UPDATE/DELETE revoked; member-SELECT scoped | unit (string-assertion) | `npx jest __tests__/migration-078.test.ts` | in-task (also authors 21-RLS-SMOKE-CHECKLIST.md) | ⬜ pending |
| 21-01-03 | 01 | 1 | ①-access-model, ②-membership | T-21-01 / T-21-02 / T-21-03 / T-21-04 / T-21-05 / T-21-06 | **Live RLS access matrix (human-gated 078 push):** owner sees own project + 4 child rows; viewer sees shared project + child rows; co-owner/editor CAN UPDATE project + child; viewer CANNOT UPDATE/DELETE project or any child; non-member blocked; only owner DELETEs; owner-membership backfilled for every project | manual smoke (no live-RLS harness) | Manual — `supabase migration list` LOCAL=REMOTE through 078 + 21-RLS-SMOKE-CHECKLIST.md matrix | checklist authored in 21-01-02 | ⬜ pending |
| 21-02-01 | 02 | 2 | ②-membership | — (test authoring) | Binding contract for 079 (RED): asserts trigger is plpgsql SECURITY DEFINER `search_path=''`; resolves party → `collaborators.claimed_by`; inserts `project_members` role `'viewer'` ON CONFLICT DO NOTHING; linked + non-draft gate; attached to 3 fire sites | unit (RED, expected fail) | `npx jest __tests__/migration-079.test.ts 2>&1 \| grep -qE "Cannot find module\|no such file\|078_project\|079_project_membership_auto" && echo "RED as expected"; true` | in-task RED-first | ⬜ pending |
| 21-02-02 | 02 | 2 | ②-membership, identity-dedupe-claim | T-21-07 / T-21-08 / T-21-09 / T-21-15 | Auto-membership keyed STRICTLY off verified `collaborators.claimed_by` (never the dead `split_sheet_parties.user_id`, never typed email); draft-gate (`status != 'draft'` AND `vault_project_id` set); viewer-only role; idempotent ON CONFLICT DO NOTHING across all 3 orderings | unit (string-assertion) | `npx jest __tests__/migration-079.test.ts` | ✅ from 21-02-01 | ⬜ pending |
| 21-02-03 | 02 | 2 | ②-membership, identity-dedupe-claim | T-21-07 / T-21-08 / T-21-09 / T-21-15 | **Auto-membership live smoke (human-gated 079 push):** claim-then-party grants viewer row; party-then-claim grants on claim; still-DRAFT linked sheet grants NOTHING (no leak); re-fire creates no duplicate | manual smoke (no live-RLS harness) | Manual — `supabase migration list` LOCAL=REMOTE through 079 + 3-ordering / draft-gate / idempotency smoke | — (live accounts) | ⬜ pending |
| 21-03-01 | 03 | 2 | ③-mine-vs-shared | T-21-13 | Shared badge shows the viewer's OWN role only (via PROJECT_ROLE_LABELS), degrades on null owner; VaultCard shared fields optional so owned callers compile unchanged | unit + type | `npx jest components/vault/SharedProjectBadge.test.tsx && npx tsc --noEmit` | in-task RED-first | ⬜ pending |
| 21-03-02 | 03 | 2 | ③-mine-vs-shared | T-21-16 / T-21-12 | Owned query stays `.eq('user_id', me)` (scoreboard exclusion by construction); shared lane reads only RLS-visible rows; owner-role/own-project rows filtered out; no owner-only edit CTA on shared cards | type + build | `npx tsc --noEmit && npm run build 2>&1 \| tail -5` | n/a (tsc + build) | ⬜ pending |
| 21-04-01 | 04 | 2 | sheet-project-sync | T-21-17 / T-21-18 | `isSyncActive` sourced from lifecycle `SYNC_FROZEN_STATUSES` (freeze boundary, not a fresh literal); `mergeComposers` preserves project-only credits ("writers ⊆ credits"); round-trip idempotent | unit (pure) | `npx jest lib/split-sheets/project-sync.test.ts lib/split-sheets/lifecycle.test.ts` | in-task RED-first + ✅ lifecycle.test.ts existing | ⬜ pending |
| 21-04-02 | 04 | 2 | sheet-project-sync, ①-access-model | T-21-11 / T-21-10 | Forward sync gated on linked + `isSyncActive`; composer write via session client → 21-01 membership-aware RLS (never service-role escalation); no cross-account split path; sync failure never rolls back sheet save | type + full suite | `npx tsc --noEmit && npm test 2>&1 \| tail -5` | n/a (tsc + suite) | ⬜ pending |
| 21-04-03 | 04 | 2 | sheet-project-sync, ①-access-model | T-21-10 / T-21-17 | Reverse sync fires ONLY when editor == sheet initiator (single-account guard — no silent cross-account split edit); never touches a frozen sheet; owner-scoped route check unchanged | type + full suite | `npx tsc --noEmit && npm test 2>&1 \| tail -5` | n/a (tsc + suite) | ⬜ pending |
| 21-05-01 | 05 | 3 | ④-dashboard | T-21-20 | Money/signature kinds always land in `pinned` above softer items (contract never buried); non-initiator drafts produce no row (P18-11); unknown status degrades; status bucket sourced from lifecycle vocabulary | unit (pure) | `npx jest lib/dashboard/next-moves.test.ts` | in-task RED-first | ⬜ pending |
| 21-05-02 | 05 | 3 | ④-dashboard, ③-mine-vs-shared | T-21-12 | Avg-readiness removed; "Closest to ready" computed from the owner-scoped `.eq('user_id', me)` query ONLY (shared projects never enter scoreboard math) | type + build | `npx tsc --noEmit && npm run build 2>&1 \| tail -5` | n/a (tsc + build) | ⬜ pending |
| 21-05-03 | 05 | 3 | ④-dashboard, ③-mine-vs-shared | T-21-19 / T-21-20 | "Your next moves" feed input is a SEPARATE shared-reachable query (never folded into scoreboard); reads only RLS-visible sheets/documents; money/signatures pinned; pure derivation (no notifications-table read) | type + full suite | `npx tsc --noEmit && npm test 2>&1 \| tail -5` | n/a (tsc + suite) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

**No separate Wave 0 scaffolding wave.** Every new test file is authored RED-first inside its own
task (embedded TDD), so there is no missing-test blocker gating execution:

- `lib/vault/membership.test.ts` — authored RED-first in 21-01-01
- `__tests__/migration-078.test.ts` — authored in 21-01-02
- `__tests__/migration-079.test.ts` — authored RED-first in 21-02-01, made green in 21-02-02
- `components/vault/SharedProjectBadge.test.tsx` — authored RED-first in 21-03-01
- `lib/split-sheets/project-sync.test.ts` — authored RED-first in 21-04-01
- `lib/dashboard/next-moves.test.ts` — authored RED-first in 21-05-01
- `.planning/phases/21-cross-account-collaboration-sheet-sync/21-RLS-SMOKE-CHECKLIST.md` — the manual
  access-matrix checklist for the human-gated push, authored in 21-01-02

Existing infrastructure covered / extended: `lib/split-sheets/lifecycle.test.ts` (already exists;
extended in 21-04-01), and the Jest ^30.4.2 framework itself (already installed, `jest.config.js`
present — no framework install needed).

---

## Manual-Only Verifications

The two migration pushes are human-gated (repo policy — no executor `supabase db push`) and this repo
has **no automated live-RLS harness**, so the live access-control assertions are necessarily manual.
The migration *structure* is automated (string-assertion tests above); only the *live-DB behavior* is manual.

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live RLS access matrix — owner sees own + child rows; viewer sees shared + child; co-owner/editor CAN UPDATE; viewer CANNOT UPDATE/DELETE; non-member blocked; only owner DELETEs; owner-backfill present; no 42P17 | ①-access-model, ②-membership | No live-RLS test harness in repo; human-gated 078 push (mirrors migrations 058/062/064) | 21-01-03: after Phase 20's 076/077 are live, push 078 via Codex; confirm `supabase migration list` LOCAL=REMOTE through 078; reload schema cache (`NOTIFY pgrst`); run every cell of 21-RLS-SMOKE-CHECKLIST.md against real accounts |
| Auto-membership live smoke — claim-then-party & party-then-claim grant a viewer row; still-DRAFT linked sheet grants nothing; re-fire is idempotent | ②-membership, identity-dedupe-claim | Trigger behavior against real claimed accounts; human-gated 079 push (sequenced after 078) | 21-02-03: confirm 078 live; push 079 via Codex; confirm LOCAL=REMOTE through 079; smoke the three orderings + draft-gate + idempotency against real accounts |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or a documented manual verification (the 2 human-gated migration pushes)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (the 2 manual checkpoints are in different plans, separated by automated tasks)
- [x] Wave 0 covers all MISSING references (no separate Wave 0 — every new test authored RED-first in-task)
- [x] No watch-mode flags (all commands are single-run `npx jest` / `npx tsc --noEmit` / `npm test`)
- [x] Feedback latency < 15s (single-file quick run)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-08-01
