# Claude Handoff Report Template

Return this report inside one fenced Markdown block. Do not place commentary before or after the fence.

```markdown
# Funūn Phase <phase> Post-Execution Review — Claude Handoff

Claude: use this as the authoritative review handoff for Phase <phase>. Do not implement, apply migrations, deploy, or change external state beyond the authority Peter grants after reviewing this report.

## Review Target

- Phase: <identifier and title>
- Repository: `/Users/peterzora/Desktop/funun`
- Branch: <branch>
- Reviewed commit/range: <commit or range>
- Worktree state: <clean or describe unrelated changes>
- Review scope: <plans and implementation surfaces reviewed>

## Confirmed Findings

### Critical

<Findings or "None confirmed.">

### High

<Findings or "None confirmed.">

### Medium

<Findings or "None confirmed.">

### Low

<Findings or "None confirmed.">

For each finding use:

#### [<severity>] <short title>

- Confidence: <high/medium/low>
- Evidence: `<path>:<line>`
- Violates: <plan, requirement, doctrine, or invariant>
- Scenario: <concrete exploit or failure sequence>
- Impact: <user, data, security, or operational impact>
- Fix: <concise remediation>
- Regression test: <specific test>
- Release implication: <merge/migration/deploy impact>

## Coverage Matrix

| Plan / requirement / decision | Status | Evidence | Gap or note |
| --- | --- | --- | --- |
| <item> | <classification> | `<path>:<line>` | <note> |

Allowed status values: `Implemented and verified`, `Implemented but unverified`, `Partially implemented`, `Missing`, `Intentionally deferred`, `Not applicable`.

## Needs Verification

- <Unconfirmed risk and the exact probe needed, or "None.">

## Deferred Human UAT

- <Human test, expected result, and why automation is insufficient, or "None.">

## Accepted Risks And Owner Decisions

- <Decision and source, or "None identified.">

## Verification Evidence

| Command or evidence source | Result | Notes |
| --- | --- | --- |
| `<exact command>` | <pass/fail/skipped/unavailable> | <exact relevant result> |

## Release Gates

| Gate | Decision | Blocking condition or required evidence |
| --- | --- | --- |
| Code merge | <GO / CONDITIONAL GO / NO-GO> | <reason> |
| Migration apply | <GO / CONDITIONAL GO / NO-GO / NOT APPLICABLE> | <reason> |
| Production deploy | <GO / CONDITIONAL GO / NO-GO> | <reason> |
| Phase closeout | <GO / CONDITIONAL GO / NO-GO> | <reason> |

## Exact Next Actions For Claude

1. <Highest-priority action with file/test scope.>
2. <Next action.>
3. <Verification or owner checkpoint.>

## Authority Boundary

This handoff is a review report, not authorization to mutate production, apply migrations, deploy, commit, push, or expand phase scope. Wait for Peter's explicit instruction before taking any of those actions.
```

When no confirmed defects exist, keep every severity heading and write `None confirmed.` Do not omit coverage gaps or unverified conditions merely because the code looks correct.
