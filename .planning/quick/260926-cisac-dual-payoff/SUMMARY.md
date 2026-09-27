# Summary — Publisher/society onboarding dual payoff

**Completed:** 2026-09-26

## What changed

- Added Claude's strategic insight to the Path B todo: the entity/publisher/society workstream can
  advance both registration sender access and publisher-facing IPI identity-reference access.
- Made the initial entity/capacity decision an explicit high-leverage counsel decision in the plan.
- Added the same dual-payoff rationale to the direct-rights doctrine, roadmap, CWR plan and PRO
  identity cross-reference todo.
- Preserved the qualification that there is no demonstrated single universal “CISAC-affiliated
  publisher” account: MusicMark onboarding, registration sender approval, IPI Pocket Edition and
  ISWC IPI Context Search access must each be evidenced under their actual eligibility,
  agreements, credentials and technical paths.
- Clarified sequencing: business/recipient onboarding waits on the entity/capacity decision, while
  canonical data modeling and draft validation can continue in parallel.

## Evidence checked

- MusicMark's official site states that publishers can submit one CWR/EBR registration file to
  ASCAP, BMI and SOCAN.
- CISAC's official IPI page states that publishers receive the IPI Pocket Edition on request.
- CISAC's official ISWC IPI Context Search announcement describes an API for publishers to identify
  creator IPIs using a creator name and known work titles.

The relevant official URLs are now stored with the plan and doctrine for re-verification at
implementation time.

## Validation

- `git diff --check` passed.
- Targeted scans confirmed that all five planning documents contain the dual-payoff rationale and
  the no-automatic-entitlement qualification.
- Trailing-whitespace scan passed.
- No application code, schema, migration, production data or external service changed.
- No application tests were run because this was a documentation-only amendment.

## Workflow note

Used the manual `/gsd-quick` fallback because this Codex surface does not expose a native GSD quick
command.
