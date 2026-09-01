# Repository Audit Report Template

Return the report in this order. If a severity has no confirmed findings, write that explicitly.

## Repository Audit Report

### Audit Scope

- Branch and commit:
- Branches or refs inspected:
- Areas inspected:
- Commands run:
- Existing changes preserved:
- Limitations and coverage gaps:

### Critical

#### `[ID] Short title`

- Severity:
- Confidence:
- Category:
- Branches affected:
- File and lines:
- Problem:
- Evidence:
- Confirmed attack or failure scenario:
- Impact:
- Brief fix:
- Tests or verification required:
- Migration or deployment concern:

### Medium

Use the same finding fields.

### Low

Use the same finding fields.

### Accepted Risks And Explicit Trust Decisions

List reviewed product decisions that should not be repeatedly reported as vulnerabilities. Include the TMS team-management authority when its implementation stays within the documented scope.

### Needs Owner Clarification

List only unresolved decisions that materially affect risk, authority, availability, billing, privacy, or deployment.

### Needs Verification

List plausible concerns that lack sufficient evidence for a confirmed finding and state what would confirm or dismiss each one.

### Coverage Gaps

List branches, production state, provider behavior, dependencies, or runtime checks that could not be inspected.

### Recommended Remediation Order

Order confirmed findings by exploitability, impact, dependencies, and deployment safety.

### Final Verification Summary

List every command with its exact pass, fail, or skipped result.

## Severity Guide

### Critical

Use for unauthenticated or cross-tenant privileged access, admin takeover outside accepted trust, material secret exposure, arbitrary code execution, material financial theft or duplicate charging, irrecoverable rights/document corruption, or broad sensitive-data extraction/destruction.

### Medium

Use for scoped authorization failures, meaningful XSS, concurrency/data-integrity faults, denial of service, unbounded growth, lost updates, retry/idempotency failures, missing validation with real impact, or significant performance problems.

### Low

Use for defense-in-depth gaps, limited information disclosure, misleading/dead code, minor validation weaknesses, or maintainability problems with plausible future risk.

Lower confidence or move the item to `Needs Verification` when exploitability, reachability, or impact is uncertain. Do not inflate severity.
