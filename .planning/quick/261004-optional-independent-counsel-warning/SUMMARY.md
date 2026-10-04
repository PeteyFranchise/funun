# Optional Independent-Counsel Warning — Summary

## What changed

- Recorded that absence of a user's independent lawyer is not a hard stop for generating, reviewing, sending or signing an agreement.
- Added short proposed copy: “Lawyer review is recommended, not required. Continuing without it may leave important risks or terms unaddressed.”
- Added `Invite a lawyer` and `Continue without a lawyer` actions.
- Required a versioned, timestamped acknowledgment when the user continues without counsel.
- Clarified that missing rights, authority, approvals, signatures, template eligibility, payment or delivery evidence may still block their respective actions.

## Validation run

- Confirmed the warning is direct and non-blocking.
- Confirmed optional independent counsel remains distinct from Funūn's mandatory template-review/publication gate.
- Confirmed material changes trigger a new warning while unchanged revisions do not repeatedly interrupt the user.
- `git diff --check` passed for the task paths.

## Coordination note

Claude was concurrently working. This task modified only Codex's standalone decision record and added uniquely named quick-task files.

## Workflow note

Native `/gsd-quick` invocation was unavailable in this Codex session, so the AGENTS.md manual quick-task fallback was used.

