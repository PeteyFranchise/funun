# Break-glass: self-lockout escape hatch (Phase 27 artist-invite gate)

**Threat:** D-18 / INVITE-11 / T-27-17 (owner self-lockout on gate flip).

Migration 098 adds an invite check to `handle_new_user()`'s DEFAULT (artist)
branch only. Migration 099 (27-CODEX-REVIEW.md B1/M3/M4/L1) redefines the
same function again on top of 098, adding a dedicated staff early-return
branch and fixing which specific invite row gets consumed — 098 and 099
are pushed together and 099's body is what actually runs once both are
live. Once the gate is live, a brand-new artist signup is rejected unless
the email is a `collaborators` row or a `pending`, unexpired
`artist_invites` row. Curator, buyer, industry, and (as of migration 099)
staff signups — and **every existing account** — are completely
unaffected (the gate is inside the artist branch only, and only runs for
`auth.users` rows that don't already exist).

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
reached). As of migration 099, `handle_new_user()` has a dedicated staff
branch keyed on `app_metadata.staff_role` being present, positioned before
the artist gate — a new staff account is never subject to the artist
invite gate, by construction, **provided `staff_role` is set atomically at
account-creation time** (inside the same `auth.admin.createUser()` call,
never a follow-up `UPDATE`). That distinction matters for which of the two
paths below you can actually use once the gate is live — read the raw-SQL
path's caveat before relying on it.

### Script (works cleanly, gate live or not)

```bash
npm run break-glass -- create-staff you@example.com leadership
```

- `role` is optional and defaults to `leadership`. Valid roles:
  `leadership`, `ae`, `bd` (see `lib/admin/staff-role.ts`).
- Reuses `lib/staff/createStaffAccount.ts` — the same helper the Team
  Console's "invite staff" flow uses, including its rollback-on-partial-
  failure discipline. `createStaffAccount()` sets `app_metadata.staff_role`
  atomically inside its own `auth.admin.createUser()` call, so migration
  099's staff branch is what actually runs for this path — no gate check
  is ever reached, and (unlike before migration 099 existed) no phantom
  `user_profiles`/`subscriptions` rows are created for the trigger to clean
  up in the first place.
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

**Caveat — only reliable while the gate is NOT yet live.** Staff account
creation calls `auth.admin.createUser()` (the GoTrue admin API), which
isn't expressible as plain SQL — `auth.users` password hashing and
`email_confirm` are enforced by GoTrue, not by a direct table insert. The
Supabase Dashboard's **Authentication → Users → Add user** UI doesn't
expose `app_metadata` at creation either, so this path is necessarily
"create the user first, set `staff_role` after" — which means the initial
`INSERT` fires `handle_new_user()` with `staff_role` still absent, and it
runs the **default/artist branch**, not the staff branch. Migration 099's
staff exemption only helps paths where `staff_role` is present at
`INSERT` time (the script path above); it does not close this gap. Two
consequences follow:

- **Gate not yet live (098/099 not pushed):** the artist branch has no
  gate check to fail — this path works exactly as below, creating the
  usual phantom `user_profiles`/`subscriptions` rows that the cleanup step
  removes, same as pre-Phase-27 behavior.
- **Gate live:** the artist branch's invite check runs during that same
  `INSERT`, and — unless the email you're creating already happens to
  satisfy the gate (a `collaborators` row or a pending `artist_invites`
  row) — `RAISE EXCEPTION 'not_invited'` rolls back the **entire**
  transaction, including the `auth.users` row the Dashboard just tried to
  insert. The "Add user" step itself will visibly fail, and there is no
  row for the follow-up `UPDATE`/cleanup below to act on. If this happens
  and the repo/terminal really are unreachable (the whole reason you're on
  the raw-SQL path), run **Layer 1's raw SQL** first for the SAME email to
  grant it a `pending` `artist_invites` row, retry "Add user", then
  continue below — or use **Layer 3** to temporarily reopen signup instead.

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

Then, since `handle_new_user()`'s default (artist) branch fired for this
new auth user at `INSERT` time (`staff_role` wasn't set yet — see the
caveat above; this is true with or without migration 099), clean up the
phantom rows it left behind:

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
(migration 086's — curator → buyer → industry → default/artist, no gate,
no staff branch). Every new artist signup is admitted again, exactly as it
was before migration 098 shipped, until 098+099 (or corrected versions of
them) are reapplied. Note this also removes migration 099's staff
exemption — while reverted, a staff signup falls through to the
default/artist branch same as pre-Phase-27, but since the gate itself is
off in this state, that branch admits everyone (no rejection, just the
same phantom-row cleanup Layer 2's raw-SQL path already documents).

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
`supabase/migrations/098_artist_signup_gate.sql` followed by
`supabase/migrations/099_artist_signup_gate_fixes.sql` (or corrected
versions of them) as soon as the underlying problem is resolved, so the
gate doesn't stay open longer than necessary. Applying 098 alone without
099 re-introduces B1 (staff creation gets rejected again) — always push
both together.

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
