---
name: funun-phase-review
description: Perform an evidence-based, read-only post-execution review of any Funūn GSD phase and return one copy/paste-ready report for Claude with defects, coverage, and explicit merge, migration, deployment, and closeout decisions. Use after Claude or another agent finishes a phase, before applying its migrations or releasing it, or when asked to verify that a completed phase matches its plans, context, requirements, security boundaries, accessibility expectations, and test evidence.
---

# Funūn Phase Review

Review one completed Funūn phase as an adversarial release gate. Audit first; do not silently turn review findings into implementation.

## Review Contract

- Remain read-only by default. Do not edit, commit, push, migrate, deploy, start production services, or change external state.
- Never expose credentials or secret values.
- Preserve user-owned worktree changes and avoid destructive Git operations.
- Treat production behavior and human UAT as unverified unless directly observed through separately authorized checks.
- Return the entire final report inside one fenced Markdown block with no prose outside it. Write it so the user can paste it directly to Claude.

## Resolve The Phase

1. Read the repository `AGENTS.md` and obey its safety and workflow rules.
2. Extract the requested phase identifier, including decimal phases such as `38.0.3`.
3. Locate the single matching directory under `.planning/phases/`.
4. If no phase is named, infer it only when the current branch or exactly one active phase makes the target unambiguous. Otherwise ask for the phase number.
5. If more than one directory matches, stop and identify the candidates rather than choosing silently.

## Establish The Evidence Baseline

Record:

- current branch and commit
- `git status --short --branch`
- review range and base commit, when discoverable
- relevant commits and changed files
- existing unrelated worktree changes
- phase plans, context, research, validation, summaries, requirements, roadmap entry, and state references

Read every phase file that can define scope or acceptance criteria, including all `*-PLAN.md`, `*-CONTEXT.md`, `*-RESEARCH.md`, `*-VALIDATION.md`, `*-VERIFICATION.md`, and `*-SUMMARY.md` files. Check `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, and `.planning/STATE.md` for phase-linked requirements and decisions.

Do not assume a summary proves implementation. Trace each claim into code, SQL, tests, or observed command output.

## Build A Coverage Matrix

For every plan task, requirement, locked decision, must-have, and validation item, classify it as:

- `Implemented and verified`
- `Implemented but unverified`
- `Partially implemented`
- `Missing`
- `Intentionally deferred`
- `Not applicable`

Attach concrete evidence: file and tight line reference, test name and result, or a clearly identified missing artifact.

## Review The Implementation

Inspect the full changed surface and its trust boundaries, not only files named in summaries.

### Product And Logic

- Verify behavior matches the phase's locked decisions and user journeys.
- Look for incomplete states, misleading UI, dead controls, unsafe defaults, data loss, stale state, and cross-account or cross-workspace confusion.
- Check failure, retry, idempotency, partial-success, and concurrency paths.
- Identify feature exposure that bypasses activation, cohort, entitlement, or internal-only controls.

### Security And Data Integrity

- Trace authentication, authorization, BOLA/IDOR, tenant and workspace scoping, service-role boundaries, input validation, rate limits, logging, and returned errors.
- For Supabase changes, inspect RLS, grants, policies, triggers, constraints, indexes, RPC callers, and later migrations.
- Require `SECURITY DEFINER` functions to use an exact empty `search_path`, schema-qualified relations, and least-privilege execution grants.
- For concurrency claims, describe the concrete A/B interleaving and the database-level serialization, uniqueness, lease, or compare-and-swap boundary.
- Distinguish accepted doctrine decisions from actual defects.

### Migration And Rollout Safety

- Confirm migration numbers against `supabase/migrations/`, untracked candidates, `.planning/quick/**`, and the authoritative ledger before calling a number free.
- Check ordering, prerequisites, idempotency, partial-apply behavior, fail-closed controls, backfills, locks, rollback or recovery evidence, and verification harnesses.
- Never infer that a migration is applied from its presence in the repository.
- Do not query or mutate production unless the user separately authorizes that exact action.

### Accessibility And UX

- Check keyboard access, focus handling, semantics, labels, contrast-sensitive states, screen-reader announcements, responsive layouts, reduced motion, empty/error/loading states, and touch behavior when relevant to the phase.
- Treat screenshots and automated checks as evidence for what they actually show, not as complete human UAT.

### Verification

- Run proportionate local read-only checks documented by the phase or affected package when safe.
- Record exact commands and exact outcomes. Never convert skipped, unavailable, interrupted, or failing checks into passes.
- Separate automated verification from deferred human tests.

For broad adversarial criteria, also read the sibling `../funun-repo-audit/SKILL.md` and its checklist. Apply only the portions relevant to the phase delta.

## Assign Findings

Order confirmed findings by `Critical`, `High`, `Medium`, then `Low`.

For every finding include:

- severity and confidence
- file path and tight line reference
- violated plan, requirement, doctrine, or invariant
- concrete exploit or operational failure scenario
- impact
- concise remediation
- required regression test
- migration or deployment implications

Keep `Needs verification`, `Needs owner clarification`, accepted risks, and deferred human UAT separate from confirmed defects.

## Decide The Gates

Give a separate decision for each gate:

- Code merge: `GO`, `CONDITIONAL GO`, or `NO-GO`
- Migration apply: `GO`, `CONDITIONAL GO`, `NO-GO`, or `NOT APPLICABLE`
- Production deploy: `GO`, `CONDITIONAL GO`, or `NO-GO`
- Phase closeout: `GO`, `CONDITIONAL GO`, or `NO-GO`

Any unresolved `Critical` or `High` finding is a `NO-GO` for every affected gate. Missing evidence must not be labeled `GO`; use `CONDITIONAL GO` and name the exact condition.

## Produce The Claude Handoff

Read [references/report-template.md](references/report-template.md) completely and follow it.

The final response must:

1. Contain exactly one fenced Markdown block and nothing outside it.
2. Start with a direct instruction to Claude identifying the reviewed phase and commit or range.
3. Lead with confirmed findings; do not bury blockers in a summary.
4. Include the coverage matrix, gate decisions, verification evidence, and exact next actions.
5. Be self-contained: Claude must not need this conversation to understand the review.
6. State explicitly that Claude must not implement, migrate, or deploy beyond the authority granted in the handoff.

## Example Invocations

- `$funun-phase-review Review Phase 39 after Claude finishes it.`
- `$funun-phase-review Review Phase 38.2 against every plan and give me the Claude handoff box.`
- `$funun-phase-review Re-review Phase 39 after remediation and decide whether migration and deployment are safe.`
