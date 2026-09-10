---
created: 2026-09-09T22:15:00.000Z
title: Write beta-user instructions that cover the 38 RLS smoke checklist organically
area: verification
blocked_on: beta users existing with set-up accounts
files:
  - .planning/phases/38-member-organization-team-workspaces/38-RLS-SMOKE-CHECKLIST.md (57 boxes, 0 ticked — the source)
---

## Owner decision, 2026-09-09

**The 38 RLS smoke checklist will be verified ORGANICALLY as the first beta
testers arrive**, not by the owner grinding 57 boxes with six synthetic
accounts. Same precedent as the 31.1/31.2 UAT decision of 2026-08-25 — no fake
data, verify at first real occurrence.

Follow-on work the owner asked for: **write instructions for beta users** that
get these checks covered after they set up their accounts.

## THE DESIGN PROBLEM — read this before writing the instructions

**Most of this checklist consists of NEGATIVE assertions, and ordinary product
use will never surface one.** A beta user notices immediately when they cannot
reach something they should. They will never notice that they *can* reach
something they should not — that failure is silent and looks like the product
working.

The three sections where a silent failure is worst:

| § | asserts | why organic use will not catch it |
|---|---------|-----------------------------------|
| 5 | a grant never exposes the **clean master audio** | the collaborator gets a working file either way; nothing looks wrong |
| 6 | **payout / banking data** stays unreachable | nobody stumbles onto a payouts endpoint by accident |
| 7 | **removal actually revokes** access | the removed person has no reason to re-check, and nobody else is watching |

So instructions that just say "use the product and tell us if anything looks
broken" would produce a false all-clear on exactly the rows that matter most.

## What the instructions therefore need

1. **A few deliberate probes, not just usage.** Short, specific "try this and
   tell us exactly what you see" steps, written so a non-technical user can run
   them and report a result that actually discriminates. Phrase them so the
   EXPECTED answer is a refusal, and ask them to report the refusal text.
2. **Pairs, not singles.** Each probe needs a positive control alongside the
   negative one, or a refusal caused by something unrelated reads as a pass.
   This is the same design that surfaced the `42702` in migration 199.
3. **Role assignment.** The checklist needs six distinct roles (A artist, B
   workspace owner, C granted member, D ungranted member, E removed member, F
   unrelated control). Beta users arrive as individuals, so map which real
   person plays which role as they onboard, and record it — otherwise a "pass"
   cannot be attributed to a role.
4. **Section 11's control (account F)** costs nothing and can be any beta user
   not in the workspace. Cheap coverage; include it.
5. **Sections 8a/8b test D-56 itself** — turning workspace access off, back on,
   and confirming it fails closed. Those are owner actions, not beta-user
   actions. Do NOT push them into user instructions.
6. **Section 10 is a performance measurement**, not a yes/no — it needs the
   owner or an instrumented read, not a user report.

## Suggested split

- **Beta users can cover:** §1-3 (proposal inert, accept/attach/grant works,
  per-project narrowing), §4 (authority gate), §7's positive half (the removed
  person confirms they lost access), §11 (control).
- **Owner must cover:** §5, §6, §8a, §8b, §10 — plus §7's negative half.
- **Instrumentation could cover some of §5/§6** if a probe endpoint or a logged
  assertion is cheaper than a manual check. Worth considering before writing
  the manual version.

## Related

- Precedent and reasoning: [[project_uat_blocked_on_seed_data]]
- The plan this unblocks: `.planning/todos/pending/2026-09-09-close-plan-38-0-2-17-and-d56-checkpoint.md`
- Why text tests cannot substitute: [[project_migration_behavioural_verification]]
