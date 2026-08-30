# Account types — the official vocabulary

**Status:** canonical. When anyone says "User Account" on this project, this is what
they mean. Last verified against the live schema and production data 2026-08-26.

---

## The one-line version

> A **User Account** is an account that owns a `user_profiles` row.
> That is exactly **Artist** and **Industry**, and nothing else.

Team Members and Client Partners are *not* User Accounts. They are separate account
types with their own tables and their own surfaces.

---

## The five account types

| Term we use | Identified by | Owns a `user_profiles` row? | Lands on |
|---|---|---|---|
| **Artist** | *no* `app_metadata.role` — the default branch | yes, `member_type = 'artist'` | `/vault` |
| **Industry** | `app_metadata.role = 'industry'` | yes, `member_type = 'industry'` | `/vault` |
| **Client Partner** (buyer) | `app_metadata.role = 'buyer'` | **no** | buyer catalogue |
| **Team Member** (staff) | `app_metadata.staff_roles[]` | **no** — lives in `funun_staff` | `/admin/*` |
| **Curator** | provisioned as **Industry** | yes, `member_type = 'industry'` | `/vault` |

"User Account" is the umbrella for the first two rows. It is not a database value —
there is no `account_type` column. It is a *derived* category, and the derivation is
the presence of a profile row.

---

## Why the profile row is the definition

Everything is decided once, at signup, by the `handle_new_user()` trigger
(`supabase/migrations/098_artist_signup_gate.sql`). It reads
`NEW.raw_app_meta_data->>'role'` and returns early — creating **no** profile — for
`curator` and `buyer`. Only the `industry` branch and the fall-through `artist`
default insert into `public.user_profiles`.

That is why the `member_type` union in `types/index.ts` is:

```ts
member_type: 'artist' | 'industry'
```

Exactly two values, no others — because no other account type has a row to put a
`member_type` on. **The type system already encodes "User Account."** If you need to
ask "is this a User Account?", the honest check is "does it have a profile row?",
and `member_type` is its label.

Production data confirms the separation holds: 11 auth users = 9 `user_profiles`
+ 2 `funun_staff`, with **zero overlap**. `pete@funun.studio` and
`soko@funun.studio` have no profile row at all.

---

## What this buys you

Scoping a feature to User Accounts is **structural, not a convention**. Profile-shaped
work physically cannot reach a Team Member or a Client Partner, because there is no row
to write to. That is a much stronger guarantee than "remember to exclude staff", and it
is why Phase 36 (mandatory `@handle`) can state its scope in one line.

The inverse is also true and worth remembering: **staff-shaped work must not assume a
profile row exists.** A Team Member has no `artist_name`, no `handle`, no `avatar_url`
— their display name comes from `funun_staff.display_name`.

---

## How does someone BECOME each type?

`app_metadata.role` is set **at account creation and never again**. Nothing a person
fills in later changes their account type — filling in an artist name does NOT make an
Artist account, because the account was already Artist from the moment of signup.

There are exactly two creation paths:

**1. Self-serve signup** — `supabase.auth.signUp()` (anon key). Sets no role, so it
falls through to the default branch. **Every self-serve account is an Artist.** There is
no way to self-serve into any other type. (Signup is still invite-gated by migrations
098/099 — an invite controls *whether* you get in, not *what* you become.)

**2. Admin provisioning** — `service.auth.admin.createUser()` via
`lib/accounts/provisionIntent.ts`. This is how every Buyer, Team Member, Industry, and
Curator account is made: staff create it explicitly with the role attached. Note the
instance-specific quirk documented in that file — `app_metadata` is applied AFTER the
`auth.users` INSERT, so the trigger cannot see the role at insert time; a single-use
intent id in `user_metadata` is what exempts the account from the invite gate.

### There is no onboarding flow

Nothing ever asks a new user what they do or what they want to build. Signup is email
and password, then straight into the app as an Artist. No `/onboarding` or `/welcome`
route exists.

The only self-directed way to change lane afterwards is the **"+ Add industry access"**
CTA in the nav footer (`components/nav/CapabilityCta.tsx`) — a deliberately subtle
entry into the capability request flow. The decision is server-side
(`POST /api/capabilities/request`): **artist capability is granted instantly, industry
goes to `pending` review.**

**This is the root of the "Unnamed artist" problem.** The product never asks who anyone
is, so it defaults everyone into the one lane that assumes a stage name — and then
displays the absence of that name as an identity. Phase 36 is the first point where
signup asks anything about the person at all, which makes it the natural place to also
ask what they do.

---

## Two traps

**1. Artist is the *absence* of a role, not a value.**
There is no `role = 'artist'`. You are an Artist if none of the other branches matched.
This works, but a typo'd or unrecognised role value silently produces an Artist account
rather than failing. Worth knowing when debugging a wrong-account-type report.

**2. Team Member roles are a second, independent axis.**
A Team Member is not one thing — they carry a `staff_roles[]` array with any of nine
values: `leadership`, `ae`, `bd`, `anr`, `it`, `legal`, `tms`, `accounting`,
`marketing`. One person can hold several. `it` is deliberately excluded from the general
staff default (it is read-only) and is admitted only where a route names it explicitly.

---

## Capabilities are not account types

Separately from account type, `capability_grants` lets **one profile** hold both artist
and industry capability (`lib/capabilities/grant.ts`). So Artist vs Industry is a
starting lane rather than a wall — a single User Account can do both.

Client Partner and Team Member are genuinely separate account types, not capabilities.
Do not model them as grants on a profile.

---

## Resolved — Curator (2026-08-27)

**Curators ARE User Accounts.** They are provisioned as **Industry** and get a
`user_profiles` row like any other Industry member.

This was an open question because `handle_new_user()` has a `role = 'curator'` branch
that returns early and creates no profile — which looked like it contradicted the
standing decision. It does not. **That branch is dead code.** Evidence, gathered against
production during the Phase 36 discussion:

- **0** auth users carry `app_metadata.role = 'curator'`
- the `curators` table has **0 rows**
- nothing in the codebase *sets* that role — exactly one place reads it
  (`app/api/curators/[id]/route.ts`)
- `app/api/curators/claim/[token]/route.ts` states in its own header that it
  **"NEVER mints app_metadata.role='curator'"**; it provisions via
  `provisionIndustryAccount()`

So no current code path can reach that branch. It is a leftover guard from before
curators were folded into Industry. Removing it is safe cleanup, but nothing depends on
it happening.

**Consequence:** curators are in scope for every User Account feature, `@handle`
included. See `.planning/phases/36-account-identity-mandatory-handle-for-user-accounts-artist-d/36-CONTEXT.md` D-01.
