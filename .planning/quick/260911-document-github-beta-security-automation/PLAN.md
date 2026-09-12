# Document GitHub Beta Security Automation — Plan

## Objective

Record a deferred, owner-friendly plan for enabling GitHub secret protection,
Dependabot, CodeQL, and enforcement around Funūn's existing quality workflow.
This task documents the work only; it does not change GitHub settings or add
automation workflows.

## Scope

- Capture the current repository baseline.
- Create one pending todo with prerequisites, ordered setup steps, validation,
  operating rules, cost/licensing decisions, and completion criteria.
- Keep repository-setting changes, purchases, commits, and enforcement actions
  as explicit future owner decisions.

## Files expected to change

- `.planning/todos/pending/2026-09-11-github-beta-security-automation.md`
- This quick-plan directory only.

## Validation plan

- Confirm the todo reflects the checked-in GitHub workflows.
- Confirm every future mutation is clearly marked and reversible where possible.
- Run `git diff --check`.

## Risks and coordination notes

- Funūn currently relies on direct pushes to `main` in some owner workflows;
  requiring pull requests immediately could interrupt releases.
- Secret Protection and Code Security availability depends on repository
  visibility, ownership, and the GitHub plan in force when the work is done.
- Detected credentials must be revoked and rotated, not merely removed from the
  latest commit or marked resolved.
- Dependabot security pull requests must not be auto-merged without Funūn's
  complete quality checks and human review.
