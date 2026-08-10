# 27-13 — INSERT-time diagnostic + migration 105 (id-only exemption)

**Status:** built, unit-tested (171 suites / 2048 tests), typechecked (0 errors).
NOT yet pushed. App is deployed. Awaiting review → push migration 105 → live smoke.

## Why 104 failed twice (27-11 and 27-12 cutovers)

Migration 104 exempted admin-provisioned accounts (buyer/staff/industry/curator)
only when it saw BOTH signals at INSERT: a matching `account_provision_intents`
row AND `NEW.email_confirmed_at IS NOT NULL`. Both live cutovers rejected all
four non-artist lanes ("Database error creating new user"); Codex rolled back via
break-glass Layer 3 each time. Prod is safe on migration 086.

## The diagnostic (27-13) — ground truth

Rather than guess a third time, a temporary AFTER INSERT capture trigger on
`auth.users` (separate from `handle_new_user`, fully reverted after) recorded
what `NEW` actually contains at INSERT for a real `admin.createUser` call:

| field                | at INSERT | 
|----------------------|-----------|
| `raw_user_meta_data` | **VISIBLE** — carried `provision_intent` + `display_name` |
| `email_confirmed_at` | **NULL** — `email_confirm:true` is applied AFTER the INSERT |
| `raw_app_meta_data`  | only `{provider,providers}` — custom role applied AFTER |

So migration 104's `email_confirmed_at IS NOT NULL` guard could **never** pass
inside the trigger — that is exactly why it rejected every admin lane. And
critically: the token (`provision_intent` in `user_metadata`) **is** visible.

## Migration 105 — the fix (single, unforgeable signal)

`supabase/migrations/105_artist_gate_intent_id_exemption.sql` redefines
`handle_new_user()`. The ONLY change from 104 is that the exemption no longer
requires `email_confirmed_at` — it consumes the intent by its id alone:

```
DELETE FROM public.account_provision_intents
  WHERE id::text = NEW.raw_user_meta_data->>'provision_intent'
    AND LOWER(email) = LOWER(NEW.email)
    AND expires_at > NOW();
v_admin_provisioned := FOUND;
```

The id is a 122-bit random UUID that only the `create*Account` helper and the
service-role-only table (zero RLS policies + REVOKE ALL) ever hold. A self-serve
signup controls its own `user_metadata` but cannot READ (table unreadable) or
GUESS (122 bits) a valid unexpired id, so it can neither forge the exemption nor
consume an admin's intent — closing both forgery and the racing-consume window
**without** the confirmation factor. `id::text = <text>` (never casting user
input to uuid) means an absent/garbage `provision_intent` simply fails to match.
Everything else (branch order, artist gate + M3, the HIGH-2 claim guard, the
15-min TTL, single-use consume) is unchanged from 104. The table is re-ensured
(IF NOT EXISTS) so 105 is self-contained for the break-glass restore path.

Security note: the intent id was already the load-bearing, unforgeable signal in
104 (Codex CONFIRMED it "attempt-bound, random, single-use, un-forgeable").
`email_confirmed_at` was only redundancy, and on this instance it was redundancy
that could never evaluate true. Dropping it removes nothing security relevant.

## Files

- `supabase/migrations/105_artist_gate_intent_id_exemption.sql` — new gate body
  (supersedes 104's trigger; 104 stays in history, its trigger having been
  reverted at cutover — so the fix ships forward as 105, never a retry of 104).
- `__tests__/migration-105-gate.test.ts` — new authoritative structural +
  behavioral test; asserts NO `NEW.email_confirmed_at` read anywhere.
- `lib/accounts/provisionIntent.ts`, `lib/buyers/createBuyerAccount.ts`,
  `lib/staff/createStaffAccount.ts`, `lib/industry/createIndustryMember.ts` —
  comments corrected (email_confirm is passed for the account's own
  confirmation, no longer credited as a gate signal). No code change: the
  helpers already write the intent + pass its id via user_metadata.
- `docs/BREAK-GLASS.md` — updated to the single-signal (id-only) mechanism and
  to point recovery at migration 105.

`__tests__/migration-104-gate.test.ts` is left intact (it accurately describes
104's frozen text, including the now-superseded email_confirmed_at guard).

## Re-cutover plan

The app is ALREADY deployed (invite UI live, check-invite 200). So:
1. (optional) A focused Codex confirm that dropping `email_confirmed_at` — given
   the diagnostic — preserves security and 105 is otherwise sound.
2. Push migration 105 (human-run).
3. **Live smoke** — exercise the REAL create*Account helpers (which write the
   intent), never a raw admin.createUser: buyer/staff/industry/curator each
   SUCCEED; artist lanes (uninvited rejected / invited admitted / existing
   signs in). Break-glass Layer 3 is the backstop.

The 27-13 diagnostic removes the mechanism uncertainty that broke 104: we now
have direct proof user_metadata is visible at INSERT on this instance.
