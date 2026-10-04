# Optional Independent-Counsel Warning

## Objective

Record that a user's lack of independent counsel does not block generation, review, sending, or signing, provided the user sees and acknowledges a short, direct risk warning.

## Scope

- Update only the standalone contract–music ecosystem decision record created by Codex.
- Add exact recommended UI copy, actions, acknowledgment behavior, and the distinction between optional user counsel and mandatory rights/authority/product gates.
- Do not modify shared files while Claude is working.

## Files expected to change

- `.planning/deliberations/contract-song-passport-sound-vault-crate-map.md`
- This quick task's `SUMMARY.md` after validation

## Validation

- Confirm lawyer review is recommended but not required.
- Confirm the warning is short, direct, and not a hard stop.
- Confirm acknowledgment is auditable without implying legal advice or representation.
- Confirm missing rights, signatures, authority, payment, or published-template approval may still block the relevant action.
- Run `git diff --check` on only the task paths.

## Coordination note

Claude is concurrently working. This task modifies only Codex's standalone decision record and creates uniquely named quick-task files.

