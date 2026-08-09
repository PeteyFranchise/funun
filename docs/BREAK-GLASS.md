# Break-glass: self-lockout escape hatch (Phase 27 artist-invite gate)

**Threat:** D-18 / INVITE-11 / T-27-17 (owner self-lockout on gate flip).

Migration 098 adds an invite check to `handle_new_user()`'s DEFAULT (artist)
branch only. Once that migration is live, a brand-new artist signup is
rejected unless the email is a `collaborators` row or a `pending`,
unexpired `artist_invites` row. Curator, buyer, and industry signups —
and **every existing account** — are completely unaffected (the gate is
inside the artist branch only, and only runs for `auth.users` rows that
don't already exist).

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
with no invite required, until 098 (or a fixed version of it) is
reapplied. Prefer Layer 1 or 2 whenever possible.

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

Staff accounts are provisioned by a **completely separate**
`handle_new_user()` branch (the industry/curator/buyer/staff branches all
`RETURN NEW` before the artist branch — and thus before the gate — is ever
reached). A new staff account is never subject to the artist invite gate,
by construction, regardless of whether migration 098 is live.

### Script

```bash
npm run break-glass -- create-staff you@example.com leadership
```

- `role` is optional and defaults to `leadership`. Valid roles:
  `leadership`, `ae`, `bd` (see `lib/admin/staff-role.ts`).
- Reuses `lib/staff/createStaffAccount.ts` — the same helper the Team
  Console's "invite staff" flow uses, including its rollback-on-partial-
  failure discipline.
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

Staff account creation calls `auth.admin.createUser()` (the GoTrue admin
API), which isn't expressible as plain SQL — `auth.users` password
hashing and `email_confirm` are enforced by GoTrue, not by a direct table
insert. If the script itself is unreachable, use the Supabase Dashboard's
**Authentication → Users → Add user** UI instead (check "Auto Confirm
User"), then run this to grant `staff_role` and register the directory row
(zero-RLS, service-role-only per migration 089 — the SQL editor's
superuser connection can write it directly):

```sql
-- 1. First create the auth user via Dashboard -> Authentication -> Users
--    -> Add user (with "Auto Confirm User" checked). Then run this with
--    that user's id (copy it from the Users table) and email:

UPDATE auth.users
   SET raw_app_meta_data = raw_app_meta_data || jsonb_build_object('staff_role', 'leadership')
 WHERE id = '00000000-0000-0000-0000-000000000000'; -- <-- the new user's id

INSERT INTO public.funun_staff (user_id, staff_role, display_name)
VALUES ('00000000-0000-0000-0000-000000000000', 'leadership', 'you@example.com') -- <-- same id
ON CONFLICT DO NOTHING;
```

Then, since `handle_new_user()`'s default branch still fires for this new
auth user (it has no staff early-return of its own — the script's reuse of
`createStaffAccount` compensates for this automatically), clean up the
phantom rows it leaves behind:

```sql
DELETE FROM public.subscriptions WHERE user_id = '00000000-0000-0000-0000-000000000000';
DELETE FROM public.user_profiles WHERE id = '00000000-0000-0000-0000-000000000000';
```

Sign in at `/signin` with the password set in the Dashboard's "Add user"
form (or use "Send magic link" from the Users table).

---

## Layer 3 — revert the gate (reopen artist signup entirely)

This is the last resort: it removes the invite requirement from artist
signup completely by restoring `handle_new_user()` to its pre-098 body
(migration 086's — curator → buyer → industry → default/artist, no gate).
Every new artist signup is admitted again, exactly as it was before
migration 098 shipped, until 098 (or a corrected version of it) is
reapplied.

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
no invite check. This is a deliberate, temporary state: re-apply
`supabase/migrations/098_artist_signup_gate.sql` (or a fixed version of
it) as soon as the underlying problem is resolved, so the gate doesn't
stay open longer than necessary.

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
