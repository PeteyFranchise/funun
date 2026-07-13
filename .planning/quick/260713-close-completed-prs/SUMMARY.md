# Quick Summary: Close Completed PRs

## Completed

- Added `.github/workflows/close-completed-prs.yml`.
- The workflow runs on `pull_request_target` label events.
- It only closes an open PR when the exact `completed` label is applied.
- It leaves an audit comment before closing the PR.

## Notes

- Merged PRs already close automatically in GitHub; this hook is for PRs intentionally marked complete without merge.
- Existing unrelated local worktree changes were left untouched.

