---
phase: 37-the-catalogue-unreleased-works-as-living-assets-versions-rig
plan: 01
subsystem: database
tags: [postgres, supabase, rls, security-definer, triggers, migrations, split-sheets, catalogue]

# Dependency graph
requires:
  - phase: 21-cross-account-collaboration
    provides: "migrations 078/079 — the project_members guest-list table, the SECURITY DEFINER helper-pair RLS shape, and the collaborators.claimed_by membership bridge this plan copies wholesale"
  - phase: 18-split-sheet-home
    provides: "migration 067 — the sheet→thing FK direction (vault_project_id, track_id) that 137's work_id follows"
  - phase: 17-split-sheet-esign
    provides: "migration 064 — the split_sheets ↔ split_sheet_parties recursion fix that 137 is written to leave strictly alone"
provides:
  - "public.works — the composition entity, separate from vault_projects, with the three-state vocal setting and the 37.2 graduation seam"
  - "public.work_versions — accumulating recordings (hum/upload) whose vN numeral is never stored"
  - "public.lyric_blocks — structure blocks with position-only ordering, self-FK repeats, and split writer/performer facts"
  - "public.ai_entries — zero-split DDEX-component AI disclosures with a citation and a when-in-doubt human-source pointer"
  - "public.work_members — membership that can precede signup, plus the claimed-collaborator backfill trigger"
  - "public.is_work_owner() / public.work_member_tier() — the single authorization primitive every wave-2 route calls through"
  - "public.work_diary_events — the append-only diary, readable by members and writable by nothing a client can reach"
  - "nine SECURITY DEFINER capture triggers — auto-capture at the database tier, not in route code"
  - "public.reorder_lyric_blocks(UUID, JSONB) — the atomic block reorder that emits exactly one diary event per drag"
  - "public.split_sheets.work_id — the sheet-side link to a work's living draft"
affects: [37-02, 37-03, 37-04, 37-05, 37-06, 37-07, 37-08, 37-09, 37-10, 37-11, 37-12, 37-13]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SECURITY DEFINER helper pair for owner-or-member RLS, wrapped as a scalar subselect at every call site (42P17 guard, from migrations 064/078)"
    - "Tables-with-RLS-enabled-no-policies in file N, helpers-and-all-policies in file N+1, pushed as one unit"
    - "Append-only evidence table: one SELECT policy, write REVOKE from authenticated and anon, writes only from SECURITY DEFINER triggers"
    - "Database-tier auto-capture: one trigger function per mutation source, each inserting exactly one diary row"
    - "Atomic whole-collection reorder RPC (migration 127's lock/contiguity/row-count shape) granted to service_role only"

key-files:
  created:
    - supabase/migrations/135_works_core.sql
    - supabase/migrations/136_work_members.sql
    - supabase/migrations/137_split_sheets_work_link.sql
    - supabase/migrations/138_work_diary_events.sql
    - __tests__/migration-135.test.ts
    - __tests__/migration-136.test.ts
    - __tests__/migration-137.test.ts
    - __tests__/migration-138.test.ts
  modified: []

key-decisions:
  - "Open Question 1 resolved sheet-side only: split_sheets.work_id exists, works.split_sheet_id does not, and both files document the decision from their own side"
  - "Open Question 2 resolved as DEFER: no labels column on works or work_versions in 37.1"
  - "135 ships tables with RLS enabled and zero policies because a policy body cannot call work_member_tier() before work_members exists; 135+136 are one push"
  - "Both tiers may write content in 37.1; administer gates membership (via the REVOKE + route check) and, in 37.2, the money and release doors"
  - "The claim bridge needs one fire site, not migration 079's three, because a work_members row always carries collaborator_id at creation time"
  - "No storage.objects policy is widened; version audio paths drop the owner-id prefix and access is gated at the API route"
  - "The reorder diary event is emitted inside reorder_lyric_blocks() rather than from a per-row trigger on position — one drag is one event"
  - "reorder_lyric_blocks() keeps the two-argument signature, so its diary event carries a NULL actor under the service role; accepted because a reorder moves no authorship"

patterns-established:
  - "Text-lock suites assert ABSENCES against a comment-stripped view of the SQL, so a header can name the anti-pattern it forbids without defeating the assertion"
  - "The 42P17 guard is proven structurally: every helper call site inside the policy region must be preceded by the eight characters '(SELECT '"

requirements-completed: [S-01, S-02, S-03, S-04]

coverage:
  - id: D1
    description: "Migration 135 — works, work_versions, lyric_blocks and ai_entries, RLS enabled and deliberately unpoliced"
    requirement: "S-03"
    verification:
      - kind: unit
        ref: "__tests__/migration-135.test.ts (47 assertions)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Migration 136 — work_members, the SECURITY DEFINER helper pair, every policy for all five tables, the claimed-collaborator bridge"
    requirement: "S-02"
    verification:
      - kind: unit
        ref: "__tests__/migration-136.test.ts (41 assertions, including the structural scalar-subselect proof)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Migration 137 — split_sheets.work_id, and provably nothing else"
    requirement: "S-03"
    verification:
      - kind: unit
        ref: "__tests__/migration-137.test.ts (20 assertions, mostly assertions of restraint)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Migration 138 — the append-only diary, nine capture triggers, the atomic reorder RPC"
    requirement: "S-01"
    verification:
      - kind: unit
        ref: "__tests__/migration-138.test.ts (63 assertions)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Migrations 135–138 applied to the production database in one `supabase db push`"
    verification: []
    human_judgment: true
    rationale: "An executor agent never runs `supabase db push` on this project. Nothing in this plan can be verified against a live database until the owner applies it, and this project's TypeScript types come from config rather than from the database, so every downstream check would be a green false positive without the push."

# Metrics
duration: 25min
completed: 2026-08-30
status: awaiting-human-checkpoint
---

# Phase 37 Plan 01: The Catalogue Schema Summary

**Six new tables, one SECURITY DEFINER authorization primitive, nine database-tier capture triggers and one atomic reorder RPC — authored, argued in-file, and locked by 171 assertions, waiting on the owner's single `supabase db push`.**

## What Shipped

Tasks 1–3 are complete and committed. Task 4 is a blocking human checkpoint and has
**not** been performed: nothing in this plan has touched the production database.

| Task | What | Commit |
|---|---|---|
| 1 | Migrations 135 (composition core) + 136 (membership, helpers, every policy, claim bridge) | `135fc0f` |
| 2 | Migrations 137 (sheet↔work link) + 138 (diary, capture triggers, reorder RPC) | `d844e1a` |
| 3 | Four text-lock suites, 171 assertions, no database connection | `adccd72` |
| 4 | **BLOCKING — owner applies 135–138 in one push** | not started |

### The shape, in one pass

`works` is a song and carries nothing about a release. `work_versions` accumulate and
no `vN` is ever stored — the numeral is derived from `created_at` ordering.
`lyric_blocks` store `position` and nothing else about order, so dragging a verse
renumbers instantly and authorship, which binds to the row id, cannot smudge; a
repeated chorus is a self-FK link rather than a duplicated row. `ai_entries` have no
percentage column and cannot be given one. `work_members` can name a person who has
not signed up yet, and a trigger on `collaborators.claimed_by` fills them in at
signup. `work_diary_events` is readable by a work's members and writable by nothing a
client can reach.

## Deviations from Plan

None that change a locked decision. Three judgement calls worth recording:

**1. Absence assertions run against a comment-stripped view of the SQL, not the raw
file.** The plan's Task 3 wording ("the string `uuid_generate_v4` appears nowhere",
"`works` carries no column whose name ends in `split_sheet_id`") reads naturally as
whole-file assertions, but each migration header deliberately NAMES the thing it
forbids in order to explain why it is forbidden — that is how the decision survives a
future reader. Asserting against the raw file would make documenting a decision
impossible. Every such assertion therefore runs against `sqlOnly` (comment lines
stripped) or, where a `COMMENT ON` body records the decision, against `sqlNoDocs`
(comment statements stripped too), with the reason written into the test. The one
place the strict whole-file reading holds is migration 138: the wall-feed table and
its emitter are named nowhere in that file, in any form, and the test asserts exactly
that against `migration138` itself.

**2. `reorder_lyric_blocks()` emits a diary event with a NULL actor under the service
role.** The plan locks the signature to `(p_work_id UUID, p_order JSONB)` and locks
the grant to `service_role` only. A service-role JWT has no subject, so `auth.uid()`
inside the function returns NULL and the reorder event records no actor. Widening the
signature to accept an actor would put a route-supplied identity claim onto an
append-only evidence table, which is a worse trade than a null actor on a formatting
event — a reorder moves no authorship and settles no money, and the blocks' own
`author_user_id` values, which the reorder never touches, remain the record of who
wrote what. The reasoning is written into 138's section (3) and asserted by the test.

**3. Actor resolution on the block-edit, remove, detach and rename events uses
`auth.uid()` inside a SECURITY DEFINER function.** Migration 078's header cautions
against helpers reaching into the `auth` schema, and no existing DEFINER function in
this codebase calls `auth.uid()`. Those four events have no "who touched it last"
column to read from — the plan's column spec for `lyric_blocks` is closed and carries
no `updated_by` — so the alternatives were an unattributed event or attributing a
collaborator's edit to the verse's original author, both worse. `auth.uid()` is
schema-qualified, so `SET search_path = ''` is fully respected, and every call falls
back to the row's author or owner when the write arrives through a service-role
client. Documented in 138's section (2) header.

## Threat Flags

None. No file in this plan introduces security surface outside the plan's own
`<threat_model>`. Every `mitigate` disposition in that register is implemented and
asserted:

| Threat | Where it landed | Asserted by |
|---|---|---|
| T-37-01 / T-37-02 | 136's helper pair; every policy wraps a call as a scalar subselect | `migration-136.test.ts` — structural walk of the policy region |
| T-37-03 | `REVOKE INSERT, UPDATE, DELETE ON public.work_members FROM authenticated, anon` | `migration-136.test.ts` |
| T-37-04 | One SELECT policy on the diary + the write REVOKE; no UPDATE/DELETE policy anywhere | `migration-138.test.ts` |
| T-37-05 | Nine capture triggers; `note` documented as the only app-authored kind | `migration-138.test.ts` |
| T-37-06 | `REVOKE ALL ... FROM PUBLIC, anon, authenticated` then `GRANT ... TO service_role` | `migration-138.test.ts` |
| T-37-07 | SHARE ROW EXCLUSIVE lock, contiguity + completeness checks, row-count serialization guard | `migration-138.test.ts` |
| T-37-08 | Bridge keys only off `collaborators.claimed_by`; no statement reads `split_sheet_parties` | `migration-136.test.ts` |
| T-37-09 (accept) | No `storage.objects` reference exists in 135 | `migration-135.test.ts` |
| T-37-10 | Sheet-party capture returns early unless the parent sheet carries a work link | `migration-138.test.ts` (ordering proof: early return precedes the insert) |
| T-37-SC (accept) | Zero new packages; no install ran | n/a |

## Known Stubs

None. Nothing in this plan renders UI or serves data, and no placeholder value is
written anywhere. `works.graduated_project_id` is an unwritten column rather than a
stub — it is the declared 37.2 seam and 135's header says so.

## Gate Results

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | 0 errors |
| `npm run lint` (`--max-warnings=0`) | clean |
| `npx jest` (full suite) | 300 suites / 3435 tests, all passing |
| `npx jest __tests__/migration-13*` | 171 assertions, all passing, no database connection |
| `npm run build` | **not run** — the owner's dev server holds `.next` |

One transient failure appeared in an earlier full run
(`lib/observability/vendor-health.test.ts` — "issues probes concurrently, not
serially", a wall-clock assertion of `< 180ms` that measured 238ms). It passes in
isolation and passed in the final full run; three sibling agents were running on the
same machine. It is a load-dependent timing flake in a pre-existing suite, unrelated
to this plan, which added only `.sql` and `.test.ts` files.

## What the Owner Must Do (Task 4, blocking)

Four migrations, one push, in numeric order. From the project root:

```bash
# 1. Confirm the text-locks are green — this is the evidence for everything else
npx jest __tests__/migration-135.test.ts __tests__/migration-136.test.ts \
         __tests__/migration-137.test.ts __tests__/migration-138.test.ts

# 2. Confirm the remote is currently at 134 and nothing else is pending
supabase migration list

# 3. Apply all four, in one push
supabase db push

# 4. Confirm LOCAL = REMOTE through 138
supabase migration list
```

**Two things deserve a real read before pushing.** In `136`, every helper call inside
a policy must be wrapped as `(SELECT public.helper(...))` — that is the 42P17
recursion guard — and the REVOKE on `work_members` must name INSERT, UPDATE and
DELETE for both `authenticated` and `anon`. In `138`, `work_diary_events` must have
exactly one policy and it must be SELECT-only.

**After the push, smoke the shape.** `works`, `work_versions`, `lyric_blocks`,
`work_members`, `ai_entries` and `work_diary_events` should all exist and be empty;
`split_sheets` should carry a new nullable `work_id`. Existing split sheets and vault
projects are untouched — nothing in this set alters an existing row, adds a
constraint to an existing column, or changes any existing policy.

**Resume signal:** "135-138 applied", or a description of any push error.

## Self-Check: PASSED

All eight created files exist on disk. All three commits (`135fc0f`, `d844e1a`,
`adccd72`) exist in `git log` on `feat/phase-37-songwriter`, and each contains only
this plan's own files.
