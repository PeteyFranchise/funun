# Activate and UAT Writer's Room section soft locks

**Owner:** Peter + implementation team
**Status:** Pending migration 144 and production deployment
**Build report:** `.planning/quick/260901-writers-room-soft-locks-build/SUMMARY.md`

## Required actions

- Apply Supabase migration 144 and verify the remote migration list is current through 144.
- Confirm the deployment containing the soft-lock build is live.
- Test one owner, two invited contributors and a second tab for the same user.
- Verify separate-section editing, same-section collision, warned takeover, live remote lyric refresh, lease renewal, 30-second disconnected expiry and exact-tab release.
- Verify a contributor outside the work cannot list, claim, release or read a lock or lyric block.
- Verify no live path changes splits, contracts, identities, rights, approved metadata, identifiers or audio.
- Record results in the GSD summary and close this todo only after all production checks pass.

## Roll-forward rule

If migration 144 is absent, the UI must fail closed: lyric text cannot be saved without a valid section lease. Apply the migration; do not restore unguarded text saves as a workaround.
