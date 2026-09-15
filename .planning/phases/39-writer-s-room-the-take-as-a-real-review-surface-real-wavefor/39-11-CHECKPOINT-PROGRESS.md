# 39-11 — checkpoint progress

Phase 39 is complete through plan 39-10 (10/11). Plan 39-11 is the human-gated close-out.
**Task 1 is done. Tasks 2 and 3 are outstanding.**

## SHIPPED 2026-09-15

- Migration **224 applied to production**. `migration list` reports 221 rows, **0 mismatches**,
  local = remote = 224.
- Code merged via **PR #72** as merge commit **`04b32caf`**; Vercel production deploy succeeded;
  `www.funun.studio` serving. Local `main` synced to `origin/main`, zero divergence.
- CI `validate` green: `security:migrations:verify`, `typecheck:strict`, `lint`,
  611 suites / 7,382 tests, both `npm audit` levels.

## Task 1 — COMPLETE, all five steps

| Step | Result |
|---|---|
| 1 · Sequencing gate | Parity through 223 (incl. 219–223); 224 the only mismatch, local-only |
| 2 · Reservation | No collision — only one 224 existed across all worktrees; remote had none |
| 3 · Push | `npx supabase@latest db push` — "Finished supabase db push" |
| 4 · Parity | **0 mismatches**, 224 local = remote |
| 5 · Schema cache | Writer's Room take loaded its comments cleanly — no missing-column or ambiguous-function error, against the then-deployed OLD code, which also proves 224's backward compatibility |

## Verified beyond the plan's checklist

**The peaks backfill round-trip works in production.** 39-06 explicitly deferred this as
unreachable by any test in this repo. Before the owner opened a take: **0 of 6** versions had
peaks. After: **2 of 6**. The full path ran — client decode, compute, PATCH, persist.

Stored values inspected directly:

| | version `8dfa2706…` | version `6a276fef…` (101s) |
|---|---|---|
| Cardinality | 200 (constraint requires exactly 200) | 200 |
| Range | 8..100 (constraint requires 0..100) | 8..100 |
| Distinct values | 48 | 70 |

Real dynamics, not a flat placeholder. This also **validates the 0–100 range constraint added to
224 on 2026-09-14** — a badly chosen bound would have rejected the PATCH and rendered nothing.

Owner confirmed the waveform "shows a real shape now", so the decorative `WAVE_BARS` strip is
genuinely retired on screen, not just deleted from source.

**Do not mistake this for D-01.** D-01's manual check is specifically *peaks appear instantly
after **recording** a new take, with no placeholder frame* — the creation-time path in 39-03.
What is proven here is the **backfill** path for pre-existing takes (39-06). Different code,
still outstanding.

## Task 2 — pins privacy: NOT STARTED

Subject chosen: work `0d0402cf…` (3 people, 2 takes, the 101-second one). Owner is writer A.
Setup confirmed — work opens, waveform renders.

Next instruction is **Step 1**: drop three pins at clearly different positions; confirm three
dots on the waveform baseline, plain lavender, no pill, no count badge.

Steps 1, 2, 7, 8, 9 are solo-runnable. **Steps 3–6 require writer B** — a second account that is
a current member of the same work — and are DEFERRED. Per the owner's standing decision
(2026-08-25) these verify organically as beta testers arrive rather than via fabricated accounts;
the protocol is `docs/verification/BETA-RLS-SMOKE-SESSION.md`, facilitator-led, every refusal
paired with a positive control.

**D-11 is therefore NOT verified.** Task 2 steps 3–6 are the only meaningful proof that a private
pin is private — Jest cannot impersonate two authenticated Postgres roles. Pins shipped on
2026-09-15 without that proof. This is a deliberate owner decision, not an oversight, and must not
be recorded as passed. Running Task 2 on a live shared work is non-invasive by design: a pin is
wordless, notifies nobody, and rides no realtime channel.

## Task 3 — felt qualities: NOT STARTED

All three are solo-runnable:
- **0.5× pitch preservation (D-18)** — needs a **sung** take. Unknown whether either candidate
  work has vocals; if not, this defers too.
- **Peaks instantly after recording (D-01)** — record over a beat, finish, confirm no placeholder
  frame.
- **Keyboard safety (D-16)** — comment composer, LyricsPad and take-rename mounted together; a
  space in each must not toggle playback; then `[` / `]` outside any field must step comments.

## Resume

`/gsd-execute-phase 39` — resumes at Task 2 Step 1. Task 1 needs no repeat; the migration is
applied and verified.

Scorecard so far: **1 of 15 checks** effectively closed (schema/backfill evidence above),
4 deferred pending writer B, 10 outstanding.

## Housekeeping

- `main` is protected — direct pushes are rejected. Commits made from here need a PR.
- Supabase token expires **~14 Oct 2026**; check expiry first if 401s return.
- Old revoked token still listed in the dashboard — safe to delete.
- `brew cleanup` clears an abandoned `llvm@21` source build.

## Not done, deliberately

Phase verification has NOT run and Phase 39 is NOT marked complete — 39-11 is outstanding.
