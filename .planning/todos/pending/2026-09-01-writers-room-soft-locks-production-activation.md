# Activate and UAT Writer's Room section soft locks

**Owner:** Peter + implementation team
**Status:** Automated production UAT passed; pending signed-in three-session visual acceptance
**Build report:** `.planning/quick/260901-writers-room-soft-locks-build/SUMMARY.md`

## Required actions

- [x] Apply Supabase migration 144.
- [x] Verify production lease acquisition, separate-section work, collision, takeover, stale-save refusal, exact-tab release and 30-second expiry recovery.
- [x] Verify production authorization, private broadcast delivery, outsider denial, canonical lyrics and correct diary attribution.
- [x] Remove the temporary work and users; verify zero synthetic records remain.
- [ ] Confirm the deployment containing commit `985d589` is live.
- [ ] Test one owner and two invited contributors through the deployed Writer's Room UI.
- [ ] Visually verify reserving, “You're editing,” “Maya is editing,” wait and warned-takeover states.
- [ ] Verify a saved lyric appears in the other signed-in sessions without refresh.
- [ ] Verify no live UI path changes splits, contracts, identities, rights, approved metadata, identifiers or audio.
- [ ] Close this todo only after the signed-in visual checks pass.

## Roll-forward rule

If migration 144 is absent, the UI must fail closed: lyric text cannot be saved without a valid section lease. Apply the migration; do not restore unguarded text saves as a workaround.
