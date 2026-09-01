---
name: funun-repo-audit
description: Perform a strict, evidence-based, read-only security, architecture, performance, concurrency, generated-code, and edge-case audit of the Funūn repository. Use when asked to audit or security-review Funūn, review the whole codebase or all branches, inspect authentication, authorization, RLS, migrations, webhooks, jobs, AI code, performance, or produce a prioritized Claude-ready or Markdown audit report.
---

# Funūn Repository Audit

Audit the repository without silently expanding the task into remediation.

## Required Workflow

1. Read the repository `AGENTS.md` and obey its workflow and safety rules.
2. Record the current branch, commit, worktree status, and available local and remote refs.
3. Preserve all user-owned changes. Do not switch branches destructively.
4. Read [references/audit-checklist.md](references/audit-checklist.md) completely.
5. Build a coverage inventory before drawing conclusions.
6. Trace suspected findings through routes, shared helpers, database policies, migrations, tests, and callers.
7. Run proportionate read-only verification where available.
8. Read [references/report-template.md](references/report-template.md) completely and use it for the final report.

## Scope Rules

- Default to read-only analysis. Do not edit code, tests, migrations, dependencies, configuration, or documentation unless the user separately requests remediation.
- Do not commit, push, deploy, run `supabase db push`, start a server, or run a production build during an audit.
- Do not fetch remote refs unless the user authorizes network access or explicitly asks for the latest remote state.
- When asked to inspect all branches, audit the current/default branch fully and inspect branch deltas separately with non-destructive Git commands. Avoid repeating inherited findings once per branch.
- State which refs and subsystems were inspected and which could not be inspected.
- Never print secret values. Report only the affected file, variable category, and remediation.

## Evidence Standard

Report a confirmed finding only after checking:

1. Reachability and the complete request path.
2. Middleware, shared authentication, and authorization helpers.
3. Supabase RLS, grants, constraints, triggers, and RPCs.
4. Whether a service-role client changes the trust boundary.
5. Tests and later migrations that may already mitigate the behavior.
6. Product documentation and explicit trust decisions.
7. Relevant branch deltas.

If evidence is incomplete, use `Needs owner clarification` or `Needs verification`; do not present speculation as a vulnerability.

For concurrency findings, describe the concrete A/B interleaving and identify the database transaction or compare-and-swap boundary. Never recommend an in-process mutex as sufficient for serverless execution.

## Funūn Trust Decision

TMS users are intentionally allowed to assign leadership, create leaders, and remove leaders for team setup and offboarding. Do not report that permission merely because it exists. Report it only if implementation exceeds that scope, crosses tenants, bypasses identity or membership checks, lacks required accountability, or enables unrelated privileged actions.

## Verification

Use relevant checks when they are safe and available:

- `npm run typecheck`
- `npm run typecheck:strict`
- `npm run lint`
- `npx jest --runInBand`

Record exact outcomes. Never claim a skipped or failed command passed.

## Output Requirements

- Lead with findings, ordered `Critical`, `Medium`, then `Low`.
- Include file paths and tight line references.
- Include severity, confidence, category, evidence, concrete scenario, impact, brief fix, tests, and deployment or migration concerns.
- Separate accepted risks, owner decisions, coverage gaps, and remediation order from confirmed findings.
- If the user asks for Claude-ready or copy/paste output, place the entire report in one fenced Markdown block.
