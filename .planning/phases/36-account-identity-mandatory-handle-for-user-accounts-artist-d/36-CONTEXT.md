# Phase 36: Account Identity — mandatory @handle for User Accounts - Context

**Gathered:** 2026-08-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Every **User Account** gets a unique, mandatory `@handle` as its identity, and `artist_name`
is demoted to an optional display field. A profile is never again titled "Unnamed artist",
and someone who works behind the scenes is a first-class member rather than a nameless one.

**In scope:** handle field on the create-account form; handle written atomically with the
profile row; profile header rendering; a hard gate that converts the existing handle-less
accounts; handle changes with old-URL redirects; extending the reserved-name guard to cover
the INSERT path; auditing the `artist_name` fallback that produces "Unnamed artist".

**Out of scope:** asking new users what they do / any onboarding questionnaire; changing
sign-in; changing the invite gate; the ~23 AI-tool prompt fallbacks (see Deferred).

**SCOPE — USER ACCOUNTS ONLY.** Artist and Industry, i.e. accounts owning a `user_profiles`
row. NOT Team Members, NOT Client Partners. Both exclusions are **structural** — those
account types have no profile row, so this work cannot reach them even by careless code.
See `docs/architecture/ACCOUNT-TYPES.md`.

</domain>

<decisions>
## Implementation Decisions

### Scope — who is in

- **D-01:** **Curators ARE User Accounts and DO get handles.** Resolved by evidence, not
  opinion, during this discussion. The `role = 'curator'` branch in `handle_new_user()` is
  **dead code**: production has **0 accounts** with `app_metadata.role = 'curator'`, the
  `curators` table has **0 rows**, nothing in the codebase *sets* that role (one place reads
  it, `app/api/curators/[id]/route.ts`), and `app/api/curators/claim/[token]/route.ts` states
  in its own header that it **"NEVER mints app_metadata.role='curator'"** — it provisions
  curators via `provisionIndustryAccount()`, i.e. as **Industry**. So curators get profile
  rows and are in scope. This confirms the standing taxonomy rather than contradicting it.
  The dead branch may be left alone; it is not this phase's job to remove it.

### Where the handle is chosen

- **D-02:** **On the create-account form** (signup step 2), as a third field beside email and
  password — NOT a step after email verification. Locked previously; see ROADMAP.md Phase 36.
- **D-03:** The handle travels via `signUp({ options: { data: { handle } } })` →
  `raw_user_meta_data.handle` → `handle_new_user()` writes it with the profile row. This works
  because **`user_metadata` IS visible to the trigger at INSERT** (`app_metadata` and
  `email_confirmed_at` are NOT — that asymmetry cost two cutover failures in Phase 27). The
  `industry` branch already does exactly this with `display_name`, so there is precedent.
  Result: for a new signup there is **no window** where a User Account exists without a handle.

### Format and reserved names

- **D-04:** **Case-preserving storage, case-insensitive uniqueness.** Someone types
  `@MayaReyes`, it displays `@MayaReyes`, and `@mayareyes` is the same handle that nobody else
  can claim in any casing. Twitter/GitHub behaviour. **No schema change needed** — the unique
  index from migration 010 is already on `lower(handle)`. The rule is simply: do NOT lowercase
  on write, and always compare lowered.
- **D-05:** **Hyphens must be allowed.** The one live handle in production is `maya-reyes`. A
  rule of `a-z0-9_` would invalidate it and break `/u/maya-reyes`. Proposed set: letters,
  digits, hyphen, underscore; 3–30 chars. Researcher to confirm edge rules (leading/trailing
  hyphen, consecutive separators).
- **D-06 (BLOCKING DEFECT — must be fixed in this phase):** **The reserved-name guard does not
  cover the path this phase uses.** `supabase/migrations/037_reserved_handles.sql` creates it
  as `BEFORE UPDATE OF handle ON public.artist_profiles` — **UPDATE only, never INSERT**. The
  trigger is still attached (migration 076 used `ALTER TABLE ... RENAME TO user_profiles`, so
  triggers followed the table under the old trigger name), and `reserved_handles` holds **58
  rows** in production (`admin`, `api`, `settings`, `signin`, `signup`, `vault`, …). But D-02/D-03
  write the handle at **INSERT**, which the guard never sees. **As things stand today someone
  could sign up as `@admin` and the database would not stop them.** The guard must be extended
  to fire on INSERT as well as UPDATE.

### Changing a handle

- **D-07:** **Handles are changeable, and old URLs redirect.** A `handle_history` table keeps
  retired handles pointing at the right profile so a link an AE or client already shared keeps
  working (301 → current handle). People outgrow names and a rebranding artist should not be
  stuck.
- **D-08:** **A retired handle stays reserved to its original owner** — it is not released back
  into the pool. This prevents impersonation via a freshly-vacated name. Consequence to accept:
  handle churn permanently burns names.

### Converting the existing accounts

- **D-09:** **Hard gate.** A signed-in User Account with no handle sees a single
  "Choose a handle to continue" screen with **no skip and no dismiss**, until one is chosen.
  Owner chose this over softer options because it guarantees 100% coverage immediately and lets
  the `NOT NULL` constraint land right away instead of waiting on stragglers. Cost is a
  one-time interruption for **~3 real humans** (the other 5 handle-less rows are `demo@`,
  `epktest-`, `droptest-`, and two `codex-064-*` fixtures).
- **D-10 (implementation trap):** the gate must key on **"has a `user_profiles` row but no
  handle"**, NOT on "is authenticated". Keying on authentication alone would gate Team Members
  and Client Partners, who have no profile row and no handle and never will — locking staff out
  of the admin console and buyers out of the catalogue. Structurally they cannot be given a
  handle, so the gate must not ask them for one.

- **D-10a — MOUNT THE GATE IN `app/(artist)/layout.tsx`, NOT IN `middleware.ts`.** This is the
  decision that makes D-10 structural rather than a rule someone has to remember. The route
  groups already separate the account types completely: `app/(artist)/` (41 pages) is rendered
  **only** for User Accounts, `app/(admin)/` (37 pages) only for Team Members, `app/sync/`
  (8 pages) only for Client Partners. Mounting the gate there keeps it out of the staff and
  buyer trees, which is where the risk of a blanket auth check actually bites.

  **CORRECTION (2026-08-27, found by research — do not rely on the stronger claim).** An
  earlier draft of this decision said a gate in the artist layout would be *physically
  incapable* of reaching staff or buyers. **That is false.** `middleware.ts`'s `isProtected`
  check only tests `!user` — it does NOT check role. A signed-in Client Partner who navigates
  directly to `/vault` therefore DOES render `app/(artist)/layout.tsx`. Route groups separate
  where pages live, not who can reach them.

  What this changes:
  - **D-10b is the real protection, not D-10a.** The `profile &&` guard is load-bearing — a
    buyer has no `user_profiles` row, so the gate must not fire for them. Location alone does
    not save it.
  - **D-10c's buyer case covers a reachable path**, not a hypothetical. Write it as such.
  - Mounting in the layout is still correct — it is cheaper than middleware, rides on queries
    already happening, and keeps the check off `/admin` entirely. It is just not a guarantee
    on its own.

  **Middleware is the wrong home and it is the tempting one.** It runs on every request holding
  only the auth session, so it would need a DB round-trip per request just to learn whether a
  profile row exists — and it already gates `/admin` in the same `isProtected` expression as
  `/vault`. That is precisely the context in which "is authenticated" gets used as a proxy for
  "is a User Account" and staff get locked out.

  Bonus: `app/(artist)/layout.tsx` **already** calls `supabase.auth.getUser()` and already
  queries `capability_grants` for the nav. The handle check rides along on work that is
  happening anyway.

- **D-10b — absence of a profile row means DO NOT GATE.** Write the condition as
  `if (profile && !profile.handle)`. The `profile &&` is load-bearing: if the row is missing for
  any reason, let the person through. The gate exists to collect a handle from someone who
  should have one; a missing profile means "not my business", never "block".

- **D-10c — the test must not be an artist.** Layers D-10a and D-10b both look correct in
  review, and testing with an artist account passes every time — which is exactly how this bug
  would ship. Follow the existing precedent in `lib/admin/gate.test.ts`, which machine-verifies
  that leadership-only loaders are *never called* for `ae`/`bd`. Required cases:
  1. a **staff** identity → the gate never fires
  2. a **buyer** identity → the gate never fires
  3. a User Account **with** a handle → passes through
  4. a User Account **without** one → gated
  Cases 1 and 2 are the ones a normal pass would skip, and the only ones that actually prevent
  the lockout.

### Rendering

- **D-11:** With an artist name set, the profile header shows the artist name as the title and
  `@handle` beneath it. With none, the **`@handle` IS the title**. Never a fabricated name,
  never "Unnamed artist". Locked previously.
- **D-12:** Legal name (`legal_first_name` / `legal_middle_name` / `legal_last_name` / suffix)
  is **unchanged** — contracts only. It is not a display name and must never leak into public
  profile rendering.

### Enforcement sequencing

- **D-13:** A `NOT NULL` constraint on `handle` is the only true database-level guarantee, and
  it **cannot be added until every existing row is backfilled** — it would fail on deploy.
  Sequence it **last**, after D-09's gate has drained the handle-less accounts. Until then
  "mandatory" is enforced by the application.

- **D-13 — AMENDED 2026-08-27 (owner, at plan 07's decision checkpoint): `NOT NULL` is
  DEFERRED, with a named tripwire.** Owner's words: *"option 1, for now. The moment we start
  to see handle-less accounts posting on the website, we need to reconsider our options."*

  **Why the original sequencing did not survive contact.** D-13 assumed the only obstacle was
  old un-backfilled rows, and that draining them would clear the way. It does not. On this
  Supabase instance `app_metadata` is **invisible to `handle_new_user()` at INSERT** (the Phase
  27 `27-13` diagnostic, which cost two failed cutovers), so the curator, buyer, staff and
  industry branches cannot fire and **every** provisioning lane falls through to the default
  branch — which carries a handle only for a self-serve artist signup. A non-nullable column
  would therefore reject buyer, staff, industry and curator provisioning outright, and would
  also fire *inside* migration 133's D-15 fallback, whose entire purpose is to insert a
  handle-less row so that a lost race costs a handle rather than an account. A `NOT NULL`
  violation raised in that handler propagates, aborts the trigger, and rolls back the signup:
  precisely the failure D-15 exists to prevent, re-entered through a different door. The
  obstacle is **INSERT-time provisioning, not old rows** — which is why deleting the five
  fixture accounts on 2026-08-27 did not unblock this.

  **What enforces what, as shipped.** The database guarantees **uniqueness** (migration 010's
  lowered functional index), **reserved and retired names** (migration 133's
  `check_handle_not_reserved()`, on both write paths), and **format** (migration 134's
  `user_profiles_handle_format_chk`, text-locked to `lib/handles/validate.ts`). **Presence is
  the one property that stays application-enforced**, by D-09's hard gate in
  `app/(artist)/layout.tsx`.

  **Known residual, accepted.** The gate guards **page loads, not direct API calls**. A
  deliberate API-only user could act while handle-less. This is **security-neutral** — no
  impersonation, no access escalation, no data exposure, since a handle is a display identity
  and never an authorisation input — but it is **visible**: such an account can surface on
  social surfaces without a name.

  **TRIPWIRE (owner's words).** *The moment handle-less accounts are seen POSTING on the
  website, this decision is reopened.* At that point the candidate is the
  `not-null-with-trigger-rework` path: a placeholder-handle scheme for the four admin lanes and
  the D-15 fallback, which necessarily amends **D-10b**'s gate condition (today a plain
  "profile row exists and has no handle" test) into a "real handle vs placeholder" predicate,
  rewrites plan 06's test suite around it, and requires excluding placeholder values from the
  unique index's practical namespace and from public rendering. **That is its own phase, not a
  task.** Tracked at `.planning/todos/pending/2026-08-27-handle-tripwire-reconsider-not-null.md`.

  **Rejected outright:** applying `NOT NULL` as D-13 literally specified. It breaks buyer,
  staff, industry and curator provisioning at the first attempt after the push and converts a
  lost handle race back into a lost signup. Recorded here so the option is on the record as
  *considered and rejected*, never silently dropped.
- **D-14:** **Uniqueness is the database's job.** The unique index is the guarantee; a live
  "that's taken" check in the UI is a courtesy only and must never be the enforcement. Handle
  the simultaneous-claim race at the DB error, never optimistically.
- **D-15 (race behaviour):** if a handle is claimed between the availability check and the
  INSERT, the unique index rejects it, the trigger raises, and **`signUp` ABORTS** — the person
  sees a generic failure after already committing a password. The trigger must instead **catch
  the unique violation and insert NULL**, letting D-09's gate collect a handle on first sign-in.
  A rare, brief gap is the correct trade against costing someone their signup.

### Claude's Discretion

- Exact handle regex edge cases (leading/trailing hyphen, consecutive separators, whether to
  block visual confusables such as `rn` vs `m`).
- Debounce timing and copy for the live availability check.
- Where the `handle_history` lookup sits in the `/u/[handle]` resolution order.
- Whether unverified-account handle claims expire (see Specific Ideas).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Account model
- `docs/architecture/ACCOUNT-TYPES.md` — the canonical account vocabulary. Defines "User
  Account" as an account owning a `user_profiles` row (exactly Artist + Industry), and why the
  Team Member / Client Partner exclusions are structural rather than conventional.
- `.claude/CLAUDE.md` § "Account Vocabulary" — the summary that loads every session.

### The signup trigger and its traps
- `supabase/migrations/098_artist_signup_gate.sql` — `handle_new_user()`. The role branching,
  the invite gate, and the bare `INSERT INTO public.user_profiles (id)` the artist branch does
  today. The `industry` branch shows the `raw_user_meta_data->>'display_name'` precedent D-03
  relies on.
- `supabase/migrations/104_artist_gate_provision_intent.sql` and
  `105_artist_gate_intent_id_exemption.sql` — why `app_metadata` is NOT usable at INSERT on this
  instance, and the single-use intent-id mechanism that admits admin-provisioned accounts.
- `lib/accounts/provisionIntent.ts` — the header comment documents the INSERT-time metadata
  visibility rule in full. Read it before touching the trigger.

### Handles — what already exists
- `supabase/migrations/010_public_showcase_profile.sql` — adds `handle`; creates the
  **case-insensitive unique index on `lower(handle)`** that D-04 and D-14 depend on.
- `supabase/migrations/037_reserved_handles.sql` — the `reserved_handles` table (58 rows live)
  and the `SECURITY DEFINER` guard. **Read this closely: it is `BEFORE UPDATE OF handle` only —
  the D-06 defect.**
- `supabase/migrations/076_rename_artist_profiles_to_user_profiles.sql` — the `ALTER TABLE …
  RENAME TO` that carried the trigger over under its old name.
- `app/u/[handle]/page.tsx` — the existing public profile-by-handle route D-07's redirect plugs
  into.

### The surfaces this phase touches
- `app/(auth)/signup/page.tsx` — the five-state gate (`form` / `allowed` / `existing-account` /
  `denied` / `invite-expired`). The handle field goes in the `allowed` branch.
- `lib/profile/load.ts:126` — `profile.artist_name || 'Unnamed artist'`, the single fallback
  that produces the reported bug.
- `lib/auth/postSignInPath.ts` — where the D-09 gate has to intercept without breaking the
  buyer and staff branches.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`handle` column + case-insensitive unique index** (migration 010) — already exists, already
  correct for D-04. No schema change needed for uniqueness or casing.
- **`reserved_handles` table + `SECURITY DEFINER` guard** (migration 037) — 58 rows seeded in
  production. The table and function are reusable as-is; only the **trigger's event scope**
  needs widening (D-06).
- **`app/u/[handle]/page.tsx`** — the public profile-by-handle route already exists and works
  (`/u/maya-reyes` is live).
- **`raw_user_meta_data` pass-through** — the `industry` branch of `handle_new_user()` already
  reads `display_name` from it, so D-03 copies a proven pattern rather than inventing one.

### Established Patterns
- **The invite gate owns signup admission.** Whatever this phase adds to the signup form must
  not weaken migrations 098/099's `not_invited` check.
- **Text-lock tests for migrations.** `__tests__/migration-*.test.ts` assert migration content
  as strings. New migrations here should follow that convention.
- **Zero-policy RLS + REVOKE** is the doctrine for new tables (see migrations 128–132). A
  `handle_history` table (D-07) must follow it.

### Integration Points
- `handle_new_user()` — the artist branch's bare insert gains the handle; the whole function
  gains the D-15 unique-violation catch.
- The reserved-name trigger — widened from `UPDATE` to `INSERT OR UPDATE` (D-06).
- Signup form — one new field plus a live availability check.
- Post-sign-in routing — the D-09 hard gate, keyed on profile-row-without-handle (D-10).
- `/u/[handle]` — falls back to `handle_history` before 404 (D-07).

</code_context>

<specifics>
## Specific Ideas

- **Unverified-account squatting is an open question.** Someone can claim `@maya`, never click
  the verification email, and hold the name indefinitely. Twitter and Instagram both expire
  unverified claims. Worth a decision during planning; not blocking.
- **The waitlist asks for a name; signup does not.** Noted during discussion as the sharpest
  illustration of the problem — a rejected applicant tells you who they are, an accepted one
  never does. Not a change this phase makes, but it is the reason the phase exists.

</specifics>

<deferred>
## Deferred Ideas

- **Asking new users what they do / an onboarding step.** There is no onboarding flow at all
  today (no `/onboarding`, no `/welcome`) — signup is email + password, then straight into the
  app as an Artist. Adding a "what do you do?" step is a **new capability and its own phase**,
  even though the handle field makes signup the natural place for it later.
- **The ~23 other `artist_name ||` fallbacks.** `lib/tools/*` and `lib/tools/registry.ts` fall
  back to `'the artist'` / `'this artist'` inside AI prompt strings, and
  `lib/sync-library/mint-agreement.ts` falls back to the user's email. These are **prompt filler
  and document text, not identity** — substituting a handle would read oddly ("a track by
  @maya-reyes"). Out of scope; only `lib/profile/load.ts:126` is this phase's concern.
- **Removing the dead `role = 'curator'` branch** from `handle_new_user()`. Confirmed dead
  (D-01), but deleting it is cleanup, not this phase's job.
- **Turnstile is not configured in production.** Discovered while walking the signup flow:
  `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is unset in Vercel, so the waitlist form has **no bot
  protection** (it degrades gracefully — the submit button still works — but nothing verifies).
  Unrelated to handles; belongs in its own todo.

</deferred>

---

*Phase: 36-account-identity-mandatory-handle-for-user-accounts-artist-d*
*Context gathered: 2026-08-27*
