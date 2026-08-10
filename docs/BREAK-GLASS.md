# Break-glass: self-lockout escape hatch (Phase 27 artist-invite gate)

**Threat:** D-18 / INVITE-11 / T-27-17 (owner self-lockout on gate flip).

Migrations 098/099 added an invite check to `handle_new_user()`'s DEFAULT
(artist) branch. **Migration 104 is the corrected, authoritative gate body**
— 098/099 were rolled back at the 27-11 cutover (see below) and 104 replaces
them. Migration 104's body is what runs once it is live. A brand-new
**artist** signup is then rejected unless the email is a `collaborators` row
or a `pending`, unexpired `artist_invites` row. Non-artist accounts (buyer,
staff, industry, curator) and **every existing account** are unaffected.

**How non-artist accounts stay exempt — and why 098/099 were rolled back:**
this Supabase instance applies `app_metadata` *after* the `auth.users`
INSERT, so `handle_new_user()`'s `role`/`staff_role` branches cannot fire at
INSERT time — every admin-created account actually falls through to the
artist branch. 098/099 relied on those branches to exempt the non-artist
lanes, so the moment the gate went live it rejected buyer/staff/industry/
curator creation (live smoke lane (d) = FAIL). Migration 104 fixes this: it
exempts an account only when it sees BOTH (1) a row in the service-role-only
`account_provision_intents` table (written by each `create*Account` helper
immediately before `createUser()`) AND (2) `email_confirmed_at` set at INSERT
(`email_confirm:true`). A self-serve signup can forge neither, and any
missing signal fails **closed** (the invite gate still runs). The
`role`/`staff_role` branches are kept as harmless defense-in-depth (correct
automatically if a future GoTrue ever populates `app_metadata` at INSERT).

This doc is the "what do I do if I'm locked out" runbook. It has three
independent layers, from lightest-touch to most drastic. Each layer has
**both** a script command (run from a working checkout of this repo) and a
raw-SQL equivalent you can paste directly into the **Supabase Dashboard SQL
editor** — for when the repo itself, your terminal, or `npm` are the thing
that's unreachable.

**Owner/service-role only.** Every path below requires the Supabase
project's service-role key — the same key already in `.env.local` /
deployment env as `SUPABASE_SERVICE_ROLE_KEY`, or available from the
Supabase Dashboard under Project Settings → API. `artist_invites` is a
zero-RLS, `REVOKE ALL`-from-`PUBLIC/anon/authenticated` table (migration
097) — it is reachable only via the service role or the Dashboard's SQL
editor (which runs as the Postgres superuser, bypassing RLS entirely). Do
not share the service-role key or paste it into anything client-facing.

---

## When to use which layer

| Situation | Use |
|---|---|
| One specific person (you, a founding artist) needs to get in as an **artist** | **Layer 1** — grant an invite |
| You need an **admin/Team Member** account — e.g. to use the Team Console to issue invites for everyone else | **Layer 2** — create a staff account |
| The gate itself is broken, misbehaving, or you need signup wide open again immediately | **Layer 3** — revert the gate |

Layers 1 and 2 are scoped and reversible (they don't touch the gate
itself). Layer 3 is the nuclear option — it reopens *all* artist signup,
with no invite required, until the gate (migration 104) is reapplied.
Prefer Layer 1 or 2 whenever possible.

---

## Layer 1 — grant an artist invite (allowlist an email)

Inserts (or reactivates) a `pending`, `owner_seed`-sourced row in
`artist_invites` for one email address. That email can then complete
normal self-serve signup at `/signup` with no other change.

### Script

```bash
npm run break-glass -- grant-artist-invite you@example.com
```

Idempotent — safe to run more than once for the same email. If a pending
invite already exists, it's left untouched; if an invite exists in another
state (`accepted`, `expired`), it's reactivated to `pending` rather than
duplicated.

### Raw SQL (Supabase Dashboard → SQL Editor)

```sql
-- Reactivate any existing artist_invites row for this email, else insert
-- a fresh pending owner_seed row. Idempotent — safe to re-run.
DO $$
DECLARE
  target_email text := lower('you@example.com'); -- <-- change this
  updated_count int;
BEGIN
  UPDATE public.artist_invites
     SET status = 'pending',
         source = 'owner_seed',
         invite_token = NULL,
         token_expires_at = NULL,
         accepted_user_id = NULL,
         accepted_at = NULL,
         updated_at = now()
   WHERE lower(email) = target_email;
  GET DIAGNOSTICS updated_count = ROW_COUNT;

  IF updated_count = 0 THEN
    INSERT INTO public.artist_invites (email, status, source)
    VALUES (target_email, 'pending', 'owner_seed');
  END IF;
END $$;
```

After either path: go to `/signup`, enter the same email, and complete
the normal artist signup form.

---

## Layer 2 — create an ungated admin (Team Member) account

Under migration 104, a staff account is exempt from the artist gate because
`createStaffAccount()` writes a service-role-only `account_provision_intents`
row immediately before `auth.admin.createUser()` and creates the account
email-confirmed (`email_confirm:true`) — the two signals the gate requires to
exempt it. (The `app_metadata.staff_role` branch is *not* what exempts it on
this Supabase — `app_metadata` isn't visible to the trigger at INSERT; see
the top of this doc.) The **script path below writes that intent for you and
always works.** The raw-SQL/Dashboard path does *not* — it has no way to
write the intent before the Dashboard's INSERT fires the trigger — so read
its caveat before relying on it.

### Script (works cleanly, gate live or not)

```bash
npm run break-glass -- create-staff you@example.com leadership
```

- `role` is optional and defaults to `leadership`. Valid roles:
  `leadership`, `ae`, `bd` (see `lib/admin/staff-role.ts`).
- Reuses `lib/staff/createStaffAccount.ts` — the same helper the Team
  Console's "invite staff" flow uses, including its rollback-on-partial-
  failure discipline. It writes the `account_provision_intents` row and
  creates the account email-confirmed, so migration 104's gate exempts it.
  The trigger still runs its default branch, and the helper cleans up the
  phantom `user_profiles`/`subscriptions` rows it leaves behind, as it always
  has.
- Prints a one-time magic sign-in link directly to the terminal (in
  addition to attempting to email it) — use this if email delivery is
  part of why you're locked out.
- If the email already has an account, the command reports that and exits
  cleanly (no duplicate, no error) — that person should sign in normally
  at `/signin`.

Once signed in, a `leadership` account can use the Team Console
(`/admin/artist-invites`) to issue invites for everyone else — you
generally only need Layer 2 once.

### Raw SQL (Supabase Dashboard → SQL Editor)

**Caveat — the Dashboard path cannot satisfy the exemption, so grant an
invite (Layer 1) first.** `auth.admin.createUser()` (the GoTrue admin API)
isn't expressible as plain SQL, and migration 104's admin-provision exemption
is keyed to a SINGLE-USE intent id that the `create*Account` helper generates
and passes through `user_metadata.provision_intent` at createUser() time. The
Dashboard's **Authentication → Users → Add user** UI can set neither a
matching `account_provision_intents` row nor that `user_metadata`, so a
Dashboard-created user can never hit the exemption. While the gate is live,
"Add user" therefore lands on the artist branch and — unless the email already
satisfies the gate — `RAISE EXCEPTION 'not_invited'` rolls back the whole
transaction and "Add user" visibly fails.

So for the raw path, run **Layer 1's raw SQL for the SAME email FIRST** (grant
it a pending `artist_invites` row). "Add user" then succeeds via the artist
branch, and the `staff_role` + `funun_staff` steps below upgrade that
artist-shaped account to staff. (Gate not yet live: no prep needed — the
artist branch has no check to fail. Do NOT try to pre-write an intent row by
hand: without the matching `user_metadata.provision_intent` the trigger can't
consume it, so it would only expire unused.)

```sql
-- After running Layer 1's raw SQL for this email, create the auth user via
-- Dashboard -> Authentication -> Users -> Add user (with "Auto Confirm User"
-- checked). Then run this with that new user's id (copy it from the Users
-- table) to upgrade the artist-shaped account to staff:

UPDATE auth.users
   SET raw_app_meta_data = raw_app_meta_data || jsonb_build_object('staff_role', 'leadership')
 WHERE id = '00000000-0000-0000-0000-000000000000'; -- <-- the new user's id

INSERT INTO public.funun_staff (user_id, staff_role, display_name)
VALUES ('00000000-0000-0000-0000-000000000000', 'leadership', 'you@example.com') -- <-- same id
ON CONFLICT DO NOTHING;
```

Either way, `handle_new_user()`'s default (artist) branch created a
`user_profiles` + `subscriptions` row for this new user at INSERT (it's
admitted as an artist, then upgraded to staff above), so clean up those
phantom rows:

```sql
DELETE FROM public.subscriptions WHERE user_id = '00000000-0000-0000-0000-000000000000';
DELETE FROM public.user_profiles WHERE id = '00000000-0000-0000-0000-000000000000';
```

Sign in at `/signin` with the password set in the Dashboard's "Add user"
form (or use "Send magic link" from the Users table).

---

## Layer 3 — revert the gate (reopen artist signup entirely)

This is the last resort: it removes the invite requirement from artist
signup completely by restoring `handle_new_user()` to its pre-gate body
(migration 086's — curator → buyer → industry → default/artist, no gate,
no staff branch). Every new artist signup is admitted again, exactly as it
was before the gate shipped, until migration 104 is reapplied. This also
removes migration 104's admin-provision exemption — but that only matters
while the gate is on; with the gate off (this state) the default/artist
branch admits everyone, so buyer/staff/industry/curator creation works too
(the `create*Account` helpers' phantom-row cleanup runs as usual, and their
now-inert `account_provision_intents` writes are still cleared in the
helpers' `finally`). This is exactly the state the 27-11 rollback left prod
in.

**This has no script equivalent on purpose** — reverting a live trigger
function is a schema change, and this project's standing convention
(matches phases 16/21/25/27/28) is that schema pushes are human-run, never
scripted or automated from an agent. Run the SQL directly.

### Raw SQL (Supabase Dashboard → SQL Editor)

```sql
-- Restores handle_new_user() to migration 086's pre-gate body verbatim.
-- Copy-paste this whole block and run it.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.raw_app_meta_data->>'role') = 'curator' THEN
    RETURN NEW;
  END IF;

  IF (NEW.raw_app_meta_data->>'role') = 'buyer' THEN
    RETURN NEW;
  END IF;

  IF (NEW.raw_app_meta_data->>'role') = 'industry' THEN
    INSERT INTO public.user_profiles (id, member_type, artist_name, industry_roles, roles)
    VALUES (
      NEW.id,
      'industry',
      NEW.raw_user_meta_data->>'display_name',
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(NEW.raw_user_meta_data->'role_badges', '[]'::jsonb))),
      COALESCE(NEW.raw_user_meta_data->'profile_roles', '[]'::jsonb)
    );

    BEGIN
      INSERT INTO public.subscriptions (user_id, tier, status)
      VALUES (NEW.id, 'free', 'active');
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    BEGIN
      INSERT INTO public.capability_grants (profile_id, capability, status, role_slugs, source, decided_at)
      VALUES (
        NEW.id,
        'industry',
        'approved',
        ARRAY(SELECT jsonb_array_elements_text(COALESCE(NEW.raw_user_meta_data->'role_badges', '[]'::jsonb))),
        'signup',
        now()
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    RETURN NEW;
  END IF;

  INSERT INTO public.user_profiles (id) VALUES (NEW.id);
  INSERT INTO public.subscriptions (user_id, tier, status)
  VALUES (NEW.id, 'free', 'active');

  BEGIN
    PERFORM public.claim_collaborators(NEW.id, NEW.email);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

After running this, artist signup at `/signup` is open to anyone again —
no invite check. This is a deliberate, temporary state.

**To restore the gate afterward, do NOT `db push` or re-run 098/099/104.**
Once migration 104 has been applied, all three are already recorded in
migration history, so `supabase db push` will not re-run any of them — and
reapplying 098/099 by hand would reintroduce the exact non-artist provisioning
outage 104 fixes (they exempt via the app_metadata branches this Supabase
can't populate at INSERT — see the top of this doc). Restore the gate one of
two ways instead:

- **Preferred:** add a NEW forward-numbered migration (e.g. `105_...`) whose
  body is migration 104's corrected `CREATE OR REPLACE FUNCTION
  public.handle_new_user()` (copy it verbatim, including the
  account_provision_intents table if it was never created), and push that.
- **In a pinch (raw):** paste migration 104's `CREATE OR REPLACE FUNCTION
  public.handle_new_user()` body directly into the Dashboard SQL editor, then
  reconcile it into a forward migration once you're back in the repo.

Either way the corrected mechanism (account_provision_intents + the
email-confirmed exemption) comes back with it — never the 098/099 bodies.

To confirm the revert took effect, check the function body in the
Dashboard's SQL editor:

```sql
SELECT prosrc FROM pg_proc WHERE proname = 'handle_new_user';
```

It should show the body above (no `v_is_invited` / `RAISE EXCEPTION
'not_invited'` logic).

---

## Security notes

- All three layers require the **service-role key** or Supabase Dashboard
  access — both are owner-only credentials, never exposed to the client or
  to staff accounts.
- `scripts/break-glass.ts` never logs `SUPABASE_SERVICE_ROLE_KEY` (or the
  Supabase URL's key portion) to stdout/stderr under any code path,
  including error messages.
- `artist_invites` and `artist_waitlist` are zero-RLS, `REVOKE ALL`-from-
  `PUBLIC/anon/authenticated` tables (migration 097) — nothing here is
  reachable by a signed-in artist, buyer, or industry account; only the
  service role and the Dashboard's superuser SQL connection can touch them.
- `scripts/break-glass.ts` is an operator tool, run directly via `npm run
  break-glass -- <command> ...`. Nothing under `app/`, `components/`, or
  `lib/` imports it, and nothing should — it has no place in a
  request-serving code path.
