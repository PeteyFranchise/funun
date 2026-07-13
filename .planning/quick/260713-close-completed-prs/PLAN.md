# Quick Plan: Close Completed PRs

## Goal

Add a lightweight GitHub workflow that closes open pull requests only when they are explicitly marked completed.

## Steps

1. Add a `.github/workflows/close-completed-prs.yml` workflow.
2. Trigger on PR label events and require the exact `completed` label.
3. Leave a clear audit comment before closing the PR.
4. Validate the workflow syntax by inspection.

