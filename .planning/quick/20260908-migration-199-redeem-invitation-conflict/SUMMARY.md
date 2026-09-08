---
quick_id: 260908-2dc
slug: migration-199-redeem-invitation-conflict
status: complete
date: 2026-09-08
phase_ref: 38.0.2
migration: 199
applied: false
---

# Summary — migration 199

## Delivered

- `supabase/migrations/199_redeem_invitation_variable_conflict.sql` (568 lines)
  — `CREATE OR REPLACE FUNCTION public.workspace_redeem_invitation` reproducing
  migration 198 lines 1804–2278 with `#variable_conflict use_column` inserted
  between `AS $$` and `DECLARE`, plus 198's REVOKE/GRANT posture re-issued.
  **Verified: `diff` against 198's block reports exactly `20a21` — one added
  line, nothing else.**
- `__tests__/migration-199.test.ts` — 9 assertions, all mutation-proved.
- `.planning/ROADMAP.md` LIVE MIGRATION LEDGER updated. Codex's 201–202
  reservation left intact and its prose corrected to match.

## The two assertions that carry weight

Both were mutation-tested rather than trusted green:

1. **Placement.** The directive must sit immediately after `AS $$`. Below
   `DECLARE` it degrades to an ordinary comment and the 42702 returns
   *silently*. Mutation: moved it below `DECLARE` → 1 failed. ✓
2. **Drift guard.** The safety case for `use_column` rests on the body being
   otherwise unchanged — the directive was proved safe by scanning *this* body
   for OUT-parameter reads. If someone edits the function without redoing that
   analysis, the argument quietly stops holding. Mutation: changed
   `status = 'active'` to `'pending'` in the DO UPDATE → 1 failed. ✓

## The comment 198 got wrong, corrected rather than copied

Migration 198 reasoned about this exact question, at this exact line, and
reached the **opposite** conclusion:

> "A bare column name in an ON CONFLICT inference list is carried as an
> IndexElem name and resolved directly against the target relation's
> attributes -- it is not transformed as an expression, so PL/pgSQL's variable
> substitution does not reach it."

It then flagged its own reasoning as unverified: *"if it is wrong the failure
is a loud plan-time error in plan 17's harness, never a silent misbehaviour."*
That prediction was exactly right, and it is why this cost one verification run
instead of a production incident.

Copying that paragraph forward verbatim would have left migration 199 asserting
the bug is impossible a few lines above the fix for it — which is how a future
reader talks themselves into deleting the directive. The block is rewritten to
preserve the mistake, name it as the mistake, and warn against removing the
repair. Three assertions lock it, including one anchoring against 198 itself so
the guard fails loudly if 198 is ever edited.

Because comments now differ, the drift guard compares **executable lines only**
— which is the right scope anyway: the safety argument for `use_column` is
about code, not prose.

## Not done, deliberately

- **Not applied.** Migrations are human-gated. No `supabase` command was run
  and no database connection was opened.
- The `COMMENT ON FUNCTION` from 198 was not re-issued — it survives
  `CREATE OR REPLACE` and remains accurate, including its description of the
  `ON CONFLICT` clause, which this migration does not change.

## Gate

`npx tsc --noEmit` clean. Full suite 6313/6313. Four mutations proved: directive moved below DECLARE, directive deleted, a code line altered, and the comment correction reverted — each fails.

**Phase 38.0.2 cannot be signed off, and D-56 must stay OFF, until the owner
applies 199 and re-runs Part B B18.** Expected on re-run:
`before_cohort=not_in_cohort after_cohort=ok seat=member`. Until the second
call succeeds, R-24 is unproven — B18 is built as two calls precisely because
the refusal alone cannot distinguish "the gate worked" from "something else
failed and produced the answer the harness wanted."
