# D-01 Hidden-Member Disclosure Decision Support Plan

## Objective

Equip the Phase 41 owner to choose among hidden-member disclosure policies without selecting a policy on the owner's behalf.

## Scope

- Trace the current visibility, exact-email discovery, block, connection, invitation, and notification rules.
- Describe the concrete consequences and product costs of branches (a), (b), and (c).
- Identify measurable production exposure and provide read-only sizing queries.
- Evaluate additional coherent options and the code/documentation blast radius of amending the hidden-identity rule.
- Analyze future-only blocking versus severing an existing claimed roster relationship, including downstream references.

## Files Expected to Change

- `.planning/reviews/CODEX-RESPONSE-260922-d01-hidden-member-disclosure.md`
- `.planning/quick/260922-d01-hidden-member-disclosure/SUMMARY.md`

## Validation Plan

- Verify every requested top-level heading is present.
- Recheck cited line ranges against current branch code and planning artifacts.
- Run `git diff --check` and confirm no application code or migration changed.

## Risks and Coordination

- Production counts are not available locally; queries will be proposed but not run.
- Migrations are human-gated; no SQL will be applied.
- The report must remain decision-neutral and distinguish verified behavior from inferred abuse scenarios.
