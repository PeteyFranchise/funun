# External-Music Contract Copy Clarification

## Objective

Record precise wording and behavior for agreements concerning music that is not already uploaded or created anywhere in Funūn.

## Scope

- Update only Codex's standalone cross-system contract decision record.
- Replace ambiguous “standalone” language with explicit Sound Vault/Funūn linkage language.
- Add a non-blocking existing-music match check before creating an external reference.
- Do not modify shared files while Claude is working.

## Files expected to change

- `.planning/deliberations/contract-song-passport-sound-vault-crate-map.md`
- This quick task's `SUMMARY.md` after validation

## Validation

- Confirm the copy names Sound Vault and the rest of Funūn.
- Confirm an external reference does not create Passport, Vault, or Crate status.
- Confirm possible matches are offered for linking but title similarity is not an automatic merge.
- Run `git diff --check` on task paths.

## Coordination note

Claude is concurrently working. This task changes only Codex's standalone decision record and uniquely named quick-task files.

