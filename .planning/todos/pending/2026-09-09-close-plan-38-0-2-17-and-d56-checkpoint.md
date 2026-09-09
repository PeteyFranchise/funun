---
created: 2026-09-09T21:30:00.000Z
title: Close plan 38.0.2-17 — the phase's owner checkpoint and the D-56 decision
area: verification
blocked_on: phase 38.0.3 closing (plan 06)
files:
  - .planning/phases/38.0.2-workspace-transactional-integrity-hygiene/38.0.2-17-PLAN.md (the plan; autonomous false)
  - .planning/phases/38.0.2-workspace-transactional-integrity-hygiene/38.0.2-VALIDATION.md (the requirement map that already exists)
  - .planning/ROADMAP.md (the row that reads 17/17)
---

## Problem

**Phase 38.0.2 is recorded as `17/17` in the ROADMAP, but plan 17 is the only
plan in the whole phase-38 family with no `-SUMMARY.md`.** It is
`autonomous: false` — it needs the owner.

Its objective: *"Build the phase's two verification artefacts, map every
requirement to the evidence that actually proves it, and hold the joint push."*

The substance largely happened out of band during the 2026-09-08/09 sessions:

- Part A structural verification ran — **70/70**
- Part B behavioural verification ran — **42/42** (after migration 199 fixed the
  `42702` in `workspace_redeem_invitation`)
- `38.0.2-VALIDATION.md` exists and maps 13 of 14 requirements to evidence,
  marking WSR-21 as application-layer and explicitly not claimed

So this is not re-doing work. What is genuinely open is the **checkpoint**, and
one decision inside it.

## The actual open item: D-56

Plan 17 is where the **D-56 kill switch decision** sits. D-56 is still **OFF** in
production and 38.0.1's binding condition says it must stay off until this phase
is signed off. That makes it a **beta blocker**, not bookkeeping.

Known preconditions for flipping it:

1. **Vercel vars must be baked in.** They were set 2026-09-08
   (`WORKSPACE_ACCESS_GENERAL_ENABLED=false`,
   `WORKSPACE_COHORT_PILOT_ENABLED=true`, all three environments) and they bake
   in at BUILD time. **This is now satisfied** — production deploy `80c8e1a7`
   ran 2026-09-09T20:53:05Z, after the vars were set.
2. **The 54-box RLS smoke checklist** carried over from 38.0.1 is at **0/54**.
   This is the substantive remaining gate.
3. WSR-07/08 (an admin promoting themselves to owner and removing the real
   owner) need no grants to exploit, so the switch is their only containment.
   That is why the flip is a deliberate act and not a formality.

## What to do

1. Read `38.0.2-17-PLAN.md` and check its checkpoint items against what already
   exists, rather than rebuilding artefacts that ran.
2. Write `38.0.2-17-SUMMARY.md` recording what was actually done, out of band,
   and by whom — including that Part A/B ran during the 38.0.3 sessions rather
   than inside this plan.
3. **Correct the ROADMAP row.** `17/17` currently implies a checkpoint that has
   not happened. Either move it to 16/17 until the checkpoint clears, or keep
   17/17 with the D-56 decision called out as explicitly outstanding. Do not
   leave a bare 17/17.
4. Work the 54-box smoke checklist, or make an explicit owner decision to
   accept it as organic-beta verification the way 31.1/31.2 UAT was handled
   (see [[project_uat_blocked_on_seed_data]] for that precedent).
5. Then, and only then, put the D-56 flip to the owner as its own decision.

## Why it is queued rather than done now

Owner asked on 2026-09-09 to queue it behind phase 38.0.3 closing. 38.0.3 is at
5/6 with plan 06 in flight, and it is the phase that blocks beta most directly.

## Do not

- Do not flip D-56 as a side effect of closing this plan. It is its own decision.
- Do not rerun Part A or Part B to "prove" the phase again — they are recorded.
  If a rerun is wanted, it should be for a stated reason.
