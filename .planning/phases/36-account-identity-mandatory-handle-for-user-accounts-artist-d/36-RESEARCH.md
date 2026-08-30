# Phase 36: Account Identity — mandatory @handle for User Accounts - Research

**Researched:** 2026-08-30
**Domain:** Postgres/Supabase trigger design, Next.js 15 App Router auth-gating, signup UX
**Confidence:** HIGH

## Summary

Every piece of infrastructure this phase needs already exists in some form — the `handle`
column, its case-insensitive unique index, the `reserved_handles` table, the public
`/u/[handle]` route, and even the `user_metadata`-at-INSERT pattern the handle will travel
through. The work is entirely in **closing three specific gaps** between what exists and
what D-01–D-15 require:

1. **`check_handle_not_reserved()` only fires on UPDATE, never INSERT** (D-06) — a live
   security hole today, not a hypothetical one. Fixing it means rewriting the function body
   (not just the trigger's event list), because it currently dereferences `OLD.handle`
   unconditionally and `OLD` is `NULL` on INSERT.
2. **`handle_new_user()`'s default (artist) branch does a bare insert with no exception
   handling** — any collision (a taken handle, a reserved word, or — once it exists — a
   retired handle) will raise inside the trigger and abort the entire `signUp()` call,
   including the just-created `auth.users` row. D-15 requires this be downgraded to
   "insert with `NULL` handle instead," which requires a narrowly-scoped nested
   `EXCEPTION` block that catches exactly two conditions and nothing else.
3. **Nothing enforces handle-mandatory at the app layer yet.** D-09's hard gate has zero
   code today. It must be mounted in `app/(artist)/layout.tsx`, key on
   `profile && !profile.handle` (never on authentication alone), and be proven — via an
   automated test, not manual QA — to never fire for a staff or buyer identity.

**Primary recommendation:** One new migration (`133_...sql`) rewrites
`check_handle_not_reserved()` (widen to INSERT, add `handle_history` to what it checks) and
`handle_new_user()` (add the handle to the default branch's INSERT, wrapped in the
narrowly-scoped catch), plus creates `handle_history` following the established zero-policy
RLS doctrine. Application code changes are: one field + one `signUp()` call-site edit on the
signup form, one new dedicated `PATCH /api/profile/handle` route (mirroring the existing
`/api/profile/visibility` pattern — `handle` is deliberately **not** in
`EDITABLE_FIELDS` today), one new `GET /api/profile/handle/available` route (mirroring
`check-invite`'s rate-limit pattern), the gate itself in `app/(artist)/layout.tsx`, and a
one-line fix to `lib/profile/load.ts:126`. `NOT NULL` on `handle` is a follow-up migration,
sequenced after the gate has drained the backlog — do not add it in migration 133.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Handle uniqueness / reservation enforcement | Database (Postgres trigger + unique index) | — | D-14: the DB is the enforcement; UI is a courtesy only. Must survive a direct PostgREST write, not just app-layer validation. |
| Handle format validation | API / Backend (signup form + `/api/profile/handle`) | Database (optional CHECK constraint) | Format is a UX/API concern; the DB CHECK is defense-in-depth, not the primary gate (unlike uniqueness). |
| Handle chosen at signup | Browser / Client (signup form state) → API (Supabase Auth `signUp`) | Database (`handle_new_user()` trigger) | The value is client-collected but the write happens entirely inside the DB trigger at INSERT — no separate API round-trip needed (mirrors `display_name` precedent). |
| Live "is this available" check | API / Backend (`GET /api/profile/handle/available`) | Database (reads 3 tables) | Must be rate-limited and must read `user_profiles` + `reserved_handles` + `handle_history` — never becomes enforcement (D-14). |
| Hard gate (handle-less User Account) | Frontend Server / SSR (`app/(artist)/layout.tsx`) | — | D-10a: structural placement in the route-group layout, not middleware, so it is physically scoped to `(artist)` tree renders only. |
| Old-handle redirect | Frontend Server / SSR (`app/u/[handle]/page.tsx`) | Database (`handle_history` lookup) | Resolution order (live handle → history → 404) is a page-level concern; the data lives in the DB. |
| Profile header rendering (D-11/D-12) | Frontend Server / SSR (`lib/profile/load.ts`) | — | Pure data-shaping function, already the single source of the "Unnamed artist" bug. |

## User Constraints

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Scope — who is in**
- **D-01:** Curators ARE User Accounts and DO get handles. The `role = 'curator'` branch in
  `handle_new_user()` is dead code (0 accounts, 0 `curators` table rows, nothing sets that
  role); curators are provisioned as Industry via `provisionIndustryAccount()`. The dead
  branch may be left alone.

**Where the handle is chosen**
- **D-02:** On the create-account form (signup step 2), as a third field beside email and
  password — NOT a step after email verification.
- **D-03:** The handle travels via `signUp({ options: { data: { handle } } })` →
  `raw_user_meta_data.handle` → `handle_new_user()` writes it with the profile row, because
  `user_metadata` IS visible to the trigger at INSERT (`app_metadata`/`email_confirmed_at`
  are NOT). The `industry` branch already does this with `display_name` — precedent exists.
  Result: no window where a User Account exists without a handle for a new signup.

**Format and reserved names**
- **D-04:** Case-preserving storage, case-insensitive uniqueness (Twitter/GitHub behavior).
  No schema change needed — migration 010's index is already on `lower(handle)`. Rule: do
  NOT lowercase on write, always compare lowered.
- **D-05:** Hyphens must be allowed (`maya-reyes` is live). Proposed set: letters, digits,
  hyphen, underscore; 3–30 chars. Researcher to confirm edge rules.
- **D-06 (BLOCKING DEFECT — must be fixed in this phase):** The reserved-name guard
  (`supabase/migrations/037_reserved_handles.sql`) is `BEFORE UPDATE OF handle` only — never
  INSERT. `reserved_handles` holds 58 rows in production. As things stand, someone could
  sign up as `@admin` and the database would not stop them. Must be extended to fire on
  INSERT as well as UPDATE.

**Changing a handle**
- **D-07:** Handles are changeable, and old URLs redirect. A `handle_history` table keeps
  retired handles pointing at the right profile (301 → current handle).
- **D-08:** A retired handle stays reserved to its original owner — not released back into
  the pool. Prevents impersonation via a freshly-vacated name. Handle churn permanently
  burns names.

**Converting the existing accounts**
- **D-09:** Hard gate. A signed-in User Account with no handle sees a single "Choose a
  handle to continue" screen with no skip and no dismiss, until one is chosen. Guarantees
  100% coverage immediately; lets `NOT NULL` land right away instead of waiting on
  stragglers. Cost: one-time interruption for ~3 real humans (5 other handle-less rows are
  test/demo fixtures).
- **D-10 (implementation trap):** the gate must key on "has a `user_profiles` row but no
  handle," NOT on "is authenticated." Keying on authentication alone would gate Team Members
  and Client Partners, who have no profile row and never will.
- **D-10a:** MOUNT THE GATE IN `app/(artist)/layout.tsx`, NOT IN `middleware.ts`. Route
  groups already separate account types: `app/(artist)/` (41 pages) is rendered only for
  User Accounts, `app/(admin)/` (37 pages) only for Team Members, `app/sync/` (8 pages) only
  for Client Partners. Middleware is the wrong home and the tempting one — it runs on every
  request holding only the auth session and already gates `/admin` in the same `isProtected`
  expression as `/vault`, which is exactly the context where "authenticated" becomes a proxy
  for "User Account" and staff get locked out. Bonus: `app/(artist)/layout.tsx` already calls
  `getUser()` and already queries `capability_grants` — the handle check rides along.
- **D-10b:** absence of a profile row means DO NOT GATE. Write the condition as
  `if (profile && !profile.handle)`. The `profile &&` is load-bearing.
- **D-10c:** the test must not be an artist. Follow the precedent in
  `lib/admin/gate.test.ts`, which machine-verifies leadership-only loaders are never called
  for `ae`/`bd`. Required cases: (1) staff identity → gate never fires, (2) buyer identity →
  gate never fires, (3) User Account with a handle → passes through, (4) User Account
  without one → gated. Cases 1 and 2 are the ones a normal pass would skip.

**Rendering**
- **D-11:** With an artist name set, the profile header shows the artist name as the title
  and `@handle` beneath it. With none, the `@handle` IS the title. Never a fabricated name,
  never "Unnamed artist."
- **D-12:** Legal name fields are unchanged — contracts only, never leaks into public
  profile rendering.

**Enforcement sequencing**
- **D-13:** `NOT NULL` on `handle` is the only true DB-level guarantee, and cannot be added
  until every existing row is backfilled — it would fail on deploy. Sequence it last, after
  D-09's gate has drained handle-less accounts. Until then "mandatory" is enforced by the
  application.
- **D-14:** Uniqueness is the database's job. The unique index is the guarantee; a live
  "that's taken" check in the UI is a courtesy only and must never be the enforcement.
  Handle the simultaneous-claim race at the DB error, never optimistically.
- **D-15 (race behaviour):** if a handle is claimed between the availability check and the
  INSERT, the unique index rejects it, the trigger raises, and `signUp` ABORTS today — the
  person sees a generic failure after already committing a password. The trigger must
  instead catch the unique violation and insert NULL, letting D-09's gate collect a handle
  on first sign-in.

### Claude's Discretion
- Exact handle regex edge cases (leading/trailing hyphen, consecutive separators, whether to
  block visual confusables such as `rn` vs `m`).
- Debounce timing and copy for the live availability check.
- Where the `handle_history` lookup sits in the `/u/[handle]` resolution order.
- Whether unverified-account handle claims expire (see Specific Ideas in CONTEXT.md).

### Deferred Ideas (OUT OF SCOPE)
- Asking new users what they do / an onboarding step — no onboarding flow exists at all
  today; this is a new capability and its own phase.
- The ~23 other `artist_name ||` fallbacks in `lib/tools/*` (AI prompt filler text) and
  `lib/sync-library/mint-agreement.ts` — prompt filler, not identity. Out of scope; only
  `lib/profile/load.ts:126` is this phase's concern.
- Removing the dead `role = 'curator'` branch from `handle_new_user()` — confirmed dead
  (D-01), but deleting it is cleanup, not this phase's job.
- Turnstile not configured in production — unrelated to handles, its own todo.
</user_constraints>

## Project Constraints (from CLAUDE.md)

- No semicolons, 2-space indent, camelCase functions/vars, `PascalCase` types, `@/*` path
  aliases only (never relative imports in shared code).
- API routes: `NextResponse.json(...)`, explicit `EDITABLE_FIELDS`-style allowlists,
  destructure `{ error, data }` before using.
- No `console.log` in committed code; errors thrown with actionable, specific messages.
- **GSD workflow enforcement**: file edits happen through `/gsd-execute-phase`, not direct
  edits — this applies to the *implementation* phase, not this research.
- **Do not run `npm run build`** while the dev server is live on :3000 — use
  `npx tsc --noEmit` for type-checking (per this task's explicit constraint and
  `feedback_no_build_while_dev_server` memory).
- Migrations are **human-gated**: every migration file in this repo carries a
  "never `supabase db push` from an agent" header; the owner runs the push manually. This
  phase's migration 133 must carry the same header and must NOT be pushed by an executor
  agent.

<phase_requirements>
## Phase Requirements

No `REQUIREMENTS.md` with numbered IDs exists for this phase; ROADMAP.md and CONTEXT.md's
D-01…D-15 decisions serve as the requirement set. The Validation Architecture section below
maps each D-xx decision that has an automatable, machine-checkable behavior to a specific
test file and command.
</phase_requirements>

## Standard Stack

No new external packages are required by this phase. Every piece — the trigger rewrite, the
handle_history table, the signup field, the gate, the availability endpoint — is built with
tools already in the stack: Postgres/PL-pgSQL (via Supabase migrations), Next.js 15 App
Router, `@supabase/supabase-js`, Zod is available but not strictly needed (the handle format
check is a single regex + length check, matching the style of
`lib/metadata/identifiers.ts`'s `isValidIsrc`/`isValidCountry` pattern — small pure
functions, not a schema library).

### Core
None — no new runtime dependency.

### Supporting
None.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| A dedicated `handle_history` table | Add `retired_handles: text[]` array column to `user_profiles` | Rejected — cannot express "which profile a *different* now-deleted handle belongs to" once the array grows, and cannot carry a `lower()` unique index the same way a separate table's column can. A table is the standard shape for this (mirrors how `reserved_handles` itself is a separate table, not a config blob). |
| PL/pgSQL `EXCEPTION WHEN unique_violation OR raise_exception` | `WHEN OTHERS` | Rejected per D-15's own explicit warning ("confirm it cannot swallow unrelated errors") — `WHEN OTHERS` would also swallow a genuine DB outage, a broken FK, or a typo in the INSERT, masking real bugs as "handle taken." |

**Installation:** None required.

**Version verification:** N/A — no new packages.

## Package Legitimacy Audit

Not applicable — this phase adds zero new npm/pip/cargo dependencies. All work is
first-party SQL migrations and TypeScript within the existing stack.

## Architecture Patterns

### System Architecture Diagram

```
                    ┌─────────────────────────────────────────┐
                    │   app/(auth)/signup/page.tsx             │
                    │   'allowed' branch — NEW handle field     │
                    │   (client-side format check, debounced    │
                    │    availability call as courtesy only)    │
                    └───────────────┬───────────────────────────┘
                                    │ supabase.auth.signUp({
                                    │   email, password,
                                    │   options: { data: { handle } }
                                    │ })
                                    ▼
                    ┌─────────────────────────────────────────┐
                    │   Supabase Auth: INSERT INTO auth.users   │
                    │   NEW.raw_user_meta_data.handle is        │
                    │   VISIBLE here (unlike app_metadata)      │
                    └───────────────┬───────────────────────────┘
                                    │ AFTER INSERT trigger fires
                                    ▼
                    ┌─────────────────────────────────────────┐
                    │   handle_new_user()  (migration 133)      │
                    │   curator/buyer/staff/industry branches   │
                    │   unchanged → default (artist) branch:    │
                    │                                            │
                    │   BEGIN                                   │
                    │     INSERT INTO user_profiles(id, handle)  │
                    │   EXCEPTION WHEN unique_violation           │
                    │            OR raise_exception THEN          │
                    │     INSERT INTO user_profiles(id)  -- NULL │
                    │   END                                      │
                    └───────────────┬───────────────────────────┘
                                    │ the INSERT above fires the
                                    │ BEFORE INSERT trigger below
                                    ▼
                    ┌─────────────────────────────────────────┐
                    │  check_handle_not_reserved()               │
                    │  BEFORE INSERT OR UPDATE OF handle         │
                    │  (migration 133 widens from UPDATE-only)   │
                    │                                            │
                    │  handle IS NOT NULL AND (INSERT OR changed)│
                    │    → check reserved_handles (58 rows)      │
                    │    → check handle_history (D-08)           │
                    │    → RAISE EXCEPTION if either matches      │
                    └─────────────────────────────────────────┘

  ── separately, on every /(artist) page load ──

                    ┌─────────────────────────────────────────┐
                    │   app/(artist)/layout.tsx                 │
                    │   getUser() (already there)                │
                    │   + NEW: SELECT handle FROM user_profiles  │
                    │   + NEW: if (profile && !profile.handle)   │
                    │          render <ChooseHandleGate />        │
                    │          (no children, no skip, no dismiss)│
                    └─────────────────────────────────────────┘

  ── handle change, later ──

     PATCH /api/profile/handle          GET /api/profile/handle/available
     (dedicated route, mirrors           (dedicated route, mirrors
      /api/profile/visibility —          check-invite's rate-limit
      handle is NOT in the generic       pattern — courtesy only, D-14)
      EDITABLE_FIELDS allowlist)
              │
              ▼
     service.from('user_profiles')
       .update({ handle: newHandle })
       .eq('id', user.id)
     -- on success, INSERT the OLD handle into handle_history
     -- (same transaction / same request, best-effort ordering)
              │
              ▼
     /u/[old-handle] → 404 in user_profiles
       → falls back to handle_history lookup → 301 to /u/[new-handle]
```

### Recommended Project Structure
```
supabase/migrations/
└── 133_handle_history_and_insert_gate.sql   # trigger rewrite + new table + handle_new_user() edit
lib/handles/
├── validate.ts       # NEW — isValidHandle(), normalizeHandle() pure functions (mirrors lib/metadata/identifiers.ts style)
└── validate.test.ts  # NEW — regex edge cases (D-05 discretion)
app/api/profile/
├── handle/
│   ├── route.ts           # NEW — PATCH, dedicated (mirrors visibility/route.ts)
│   └── available/
│       └── route.ts       # NEW — GET, rate-limited (mirrors check-invite pattern)
app/(auth)/signup/
└── page.tsx           # EDIT — add handle field to 'allowed' branch, pass via signUp options.data
app/(artist)/
├── layout.tsx          # EDIT — query handle, mount gate
└── gate.test.ts        # NEW — the D-10c 4-case test (mirrors lib/admin/gate.test.ts)
components/gate/
└── ChooseHandleGate.tsx  # NEW — the blocking screen
lib/profile/
└── load.ts             # EDIT — line 126, remove 'Unnamed artist' fallback (D-11)
app/u/[handle]/
└── page.tsx             # EDIT — case-insensitive lookup + handle_history fallback
__tests__/
└── migration-133.test.ts  # NEW — text-lock test, mirrors migration-105-gate.test.ts's structure
```

### Pattern 1: The narrowly-scoped nested EXCEPTION block (D-15)
**What:** Wrap only the single INSERT statement that can collide, catching exactly the two
SQLSTATEs that statement can raise.
**When to use:** Any trigger-time INSERT where a "soft fail forward with NULL" behavior is
required instead of aborting the whole transaction (this codebase's established idiom — see
`claim_collaborators()`'s and the subscriptions-insert's `EXCEPTION WHEN OTHERS THEN NULL;`
blocks in `handle_new_user()` for the general pattern, though those correctly use `OTHERS`
because those side-effects are genuinely non-critical; this one must be narrower because a
handle collision is an *expected*, common condition, not an unexpected failure).
**Example:**
```sql
-- Source: composed from supabase/migrations/105_artist_gate_intent_id_exemption.sql's
-- established exception-isolation idiom + PostgreSQL's documented condition
-- names (raise_exception = SQLSTATE P0001, the default for a plain
-- RAISE EXCEPTION with no USING ERRCODE clause).
BEGIN
  INSERT INTO public.user_profiles (id, handle)
  VALUES (NEW.id, NULLIF(TRIM(NEW.raw_user_meta_data->>'handle'), ''));
EXCEPTION WHEN unique_violation OR raise_exception THEN
  -- unique_violation: the handle was taken between the client's
  -- availability check and this INSERT (D-15's named race).
  -- raise_exception (P0001): check_handle_not_reserved() rejected it —
  -- reserved word (D-06) or a retired handle still owned by someone else
  -- (D-08). Either way: never abort signUp; fall back to NULL and let
  -- D-09's gate collect a handle on next sign-in.
  INSERT INTO public.user_profiles (id) VALUES (NEW.id);
END;
```
**Why this composes correctly:** the `not_invited` RAISE earlier in the same function
(migration 105) also uses SQLSTATE `P0001`, but it fires *before* this nested block is ever
entered (it aborts the whole trigger at the top of the artist branch, before any INSERT is
attempted) — so there is no risk of this narrow catch accidentally swallowing an
unrelated invite-gate rejection. Verify this ordering invariant is preserved when writing
the migration (the existing `__tests__/migration-105-gate.test.ts` already text-asserts the
gate precedes the default-branch inserts; extend that assertion rather than replacing it).

### Pattern 2: Zero-policy RLS + REVOKE for `handle_history` (established doctrine)
**What:** `ENABLE ROW LEVEL SECURITY` with **zero** `CREATE POLICY` statements, plus an
explicit `REVOKE ALL ... FROM PUBLIC, authenticated, anon`. Reachable only via
`createServiceClient()`.
**When to use:** Every new table in this codebase since migration 128 (see 128–132's
identical doctrine comment, reproduced verbatim in each file).
**Example:**
```sql
-- Source: supabase/migrations/132_selects_engagement.sql's RLS DOCTRINE
-- comment, reproduced pattern (this codebase's mandatory shape since 128)
CREATE TABLE public.handle_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  old_handle  TEXT NOT NULL,
  retired_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Case-insensitive: D-04's casing rule and D-08's "reserved forever, by
-- anyone" rule both need lower() matching, mirroring migration 010's
-- artist_profiles_handle_lower_uniq index exactly.
CREATE UNIQUE INDEX handle_history_old_handle_lower_uniq
  ON public.handle_history (lower(old_handle));
CREATE INDEX handle_history_profile_id_idx ON public.handle_history (profile_id);

ALTER TABLE public.handle_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.handle_history FROM PUBLIC, authenticated, anon;
-- No CREATE POLICY statement anywhere in this file.
```
**Consequence for `/u/[handle]/page.tsx`:** the fallback lookup against
`handle_history` **must** use `createServiceClient()`, not the page's existing
`createServerClient()` (anon/authenticated-bound). The page already has this exact pattern
one query away — `loadBlockedIds(createServiceClient(), viewerId)` — so add the
`handle_history` fallback query alongside it, same client.

### Pattern 3: Dedicated route for a sensitive/gated field, not the generic PATCH allowlist
**What:** `handle` is deliberately **absent** from `app/api/profile/route.ts`'s
`EDITABLE_FIELDS` array today (verified by reading the file — `instagram_handle`,
`threads_handle`, `tiktok_handle` are present; the profile's own `handle` field is not).
This is not an oversight to "fix" by adding it to the list — the existing
`profile_visibility`/`open_to_visibility` fields show the established alternative: a
**separate route** for a field whose write needs extra server-side logic beyond a plain
column update.
**When to use:** Any profile field where the write must also do something else atomically
(here: check uniqueness *and* write a `handle_history` row on change) or needs stricter
validation than the generic sanitizer provides.
**Example:**
```typescript
// Source: app/api/profile/visibility/route.ts (existing file, reproduced
// pattern) — this is the template for the new app/api/profile/handle/route.ts
import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { isValidHandle, normalizeHandleForCompare } from '@/lib/handles/validate'

export async function PATCH(request: Request) {
  const supabase = await createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const handle = typeof body.handle === 'string' ? body.handle.trim() : ''
  if (!isValidHandle(handle)) {
    return NextResponse.json({ error: 'Invalid handle format' }, { status: 400 })
  }

  const service = createServiceClient()

  // Read current handle first — needed to write handle_history on success,
  // and to short-circuit a no-op "change" to the same handle.
  const { data: current } = await service
    .from('user_profiles')
    .select('handle')
    .eq('id', user.id)
    .maybeSingle()
  if (current?.handle && normalizeHandleForCompare(current.handle) === normalizeHandleForCompare(handle)) {
    return NextResponse.json({ data: { handle: current.handle } })
  }

  // D-14: the DB is the enforcement — this UPDATE can still fail on the
  // unique index or the reserved-name/handle_history trigger; surface that
  // as a normal 409/400, never treat the prior availability check as proof.
  const { data, error } = await service
    .from('user_profiles')
    .update({ handle })
    .eq('id', user.id)
    .select('id, handle')
    .single()

  if (error) {
    // 23505 = unique_violation ("that handle is taken");
    // the reserved/history trigger raises a plain message ("handle is reserved")
    const status = error.code === '23505' ? 409 : 400
    return NextResponse.json({ error: 'That handle is not available' }, { status })
  }

  // Best-effort — mirrors this codebase's established "swallow secondary-
  // write failures, do not fail the primary action" idiom (e.g.
  // handle_new_user()'s subscriptions/claim inserts). A missed history row
  // means a stale old-handle link 404s instead of redirecting — degraded,
  // not broken.
  if (current?.handle) {
    await service.from('handle_history').insert({ profile_id: user.id, old_handle: current.handle })
  }

  return NextResponse.json({ data })
}
```

### Anti-Patterns to Avoid
- **Keying the gate on `if (user)` instead of `if (profile && !profile.handle)`:** this is
  D-10's named trap. `user` is non-null for staff and buyers too; only the profile-row check
  structurally excludes them.
- **Trusting the availability check as proof a handle is free before INSERT/UPDATE:** D-14
  is explicit that this is a courtesy only. Always let the DB constraint be the final word,
  and handle its rejection gracefully (D-15 for signup; a normal error response for the
  change-handle route).
- **Using `WHEN OTHERS` in the new nested EXCEPTION block:** would also mask a genuine bug
  (bad column name, broken FK) as "handle was taken," making failures silent and
  undebuggable. Use the two named conditions.
- **Lowercasing on write:** breaks D-04's case-preservation requirement. Only lowercase for
  *comparison* (`lower(handle)` in SQL, `.toLowerCase()` in TS query params), never before
  storing.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Case-insensitive uniqueness | A separate "canonical lowercase handle" column kept in sync via app code | The existing `lower(handle)` functional unique index (migration 010) | Already correct, already live, already enforced at the DB layer regardless of write path. |
| Rate limiting the availability-check endpoint | A new in-memory or ad hoc limiter | `lib/security/rate-limit.ts`'s `checkRateLimit`/`getClientIp` (durable, Postgres-RPC-backed, migration 116) | This is the exact mechanism `check-invite/route.ts` already uses for an identical "public, called from a form, needs abuse protection" shape. Building a second one duplicates a component this project already deliberately made shared/durable (its own header explains why the prior in-memory version was removed). |
| Signal transport for the chosen handle | A new API round-trip immediately after `signUp()` to PATCH the handle in | `options: { data: { handle } }` on the `signUp()` call itself | `user_metadata` is visible to `handle_new_user()` at INSERT — this is the exact mechanism D-03 requires and the exact one `display_name` already proves works. An extra round-trip reopens the "handle-less window" the whole design is built to avoid. |

**Key insight:** every "don't hand-roll" item in this phase is really "don't hand-roll a
second version of a mechanism this codebase already built and proved correct once." The
phase's job is composition, not invention.

## Common Pitfalls

### Pitfall 1: Forgetting `handle_history` needs its OWN uniqueness check inside the trigger
**What goes wrong:** widening `check_handle_not_reserved()` to fire on INSERT but only
checking `reserved_handles` (the D-06 fix as literally described) still leaves D-08 (retired
handles stay permanently reserved) completely unenforced at the DB layer — a signup or a
handle-change could claim a name someone else retired.
**Why it happens:** D-06 and D-08 are described in CONTEXT.md as separate decisions, easy to
treat as separate migrations/checks, but they are enforced by the *same* trigger function in
the cleanest design (see Pattern 1's example above, which checks both tables in one
function).
**How to avoid:** when rewriting `check_handle_not_reserved()`, add the `handle_history`
`EXISTS` check in the same function body as the `reserved_handles` check, not a second
trigger.
**Warning signs:** a test that signs up with a genuinely-retired handle and expects
rejection, but the migration only text-asserts `reserved_handles` is queried.

### Pitfall 2: The `/u/[handle]` page's current lookup is NOT case-insensitive
**What goes wrong:** `app/u/[handle]/page.tsx:151` does
`.eq('handle', handle)` — an exact-case match against the URL segment, not
`.ilike()` or a `lower()` comparison. D-04 promises `/u/mayareyes` resolves the same profile
as `/u/MayaReyes`; today it does not (only the exact stored casing 404s correctly, any other
casing 404s incorrectly since the unique index is case-insensitive but this read isn't).
**Why it happens:** this route predates D-04's formal decision; the DB-level guarantee
(index) was built correctly but the one read path wasn't updated to match.
**How to avoid:** change the query to `.ilike('handle', handle)` or, more precisely and
index-friendly, filter with a server-side `lower()` comparison
(`.eq('handle', handle)` replaced with a raw filter or an RPC — `ilike` without wildcards is
the simplest fix and Postgres can use the existing functional index for it via
`lower(handle) = lower($1)` phrased as a direct filter; confirm the planner picks a form that
still uses `artist_profiles_handle_lower_uniq` rather than a sequential scan). This is a
pre-existing bug this phase should fix while it's already touching this file for the
`handle_history` fallback (D-07's redirect work touches the same query block anyway).
**Warning signs:** a test hitting `/u/MayaReyes` (title case) expecting the same profile as
`/u/maya-reyes` and getting a 404.

### Pitfall 3: Treating `app/(artist)/layout.tsx`'s existing `capability_grants` query as proof the gate is "already covered"
**What goes wrong:** the layout already does a DB round-trip per request (for capabilities)
and it's tempting to assume any User Account reaching this layout already has a profile row
with intent to display it correctly. But the layout's current code has **no `user_profiles`
query at all** — it reads `auth.getUser()` and `capability_grants` only. The `handle` check
is a net-new query, not a field already in scope.
**Why it happens:** the research prompt's framing ("rides along on work that is happening
anyway") is about *the pattern* (SSR layout already does a Supabase round-trip for this
user), not about the specific query already fetching `handle`.
**How to avoid:** add a dedicated `select('handle').eq('id', user.id).maybeSingle()` (or fold
it into a combined query if convenient) — do not assume it's already there.

### Pitfall 4: A buyer CAN structurally reach `app/(artist)/layout.tsx` by direct navigation
**What goes wrong:** D-10a's "physically incapable of reaching staff or buyers" framing is
about route-group *file* separation for normal app flow (post-sign-in routing sends a buyer
to `BUYER_HOME = '/sync/catalog'`, per `lib/auth/postSignInPath.ts`). But `middleware.ts`'s
`isProtected` check for `/vault` only requires `user` to be truthy — it does not check role.
A signed-in buyer who manually navigates to `/vault` **will** render
`app/(artist)/layout.tsx`. D-10c's "test with a buyer identity" requirement exists precisely
because this path is real, not just defense-in-depth paranoia.
**Why it happens:** the route-group argument is true for how a normal user's session flows,
but not an absolute technical guarantee against direct navigation.
**How to avoid:** this is exactly why D-10b's `profile && !profile.handle` check is the real
safety net, not the route grouping alone — a buyer has `profile === null`
(`user_profiles` has zero rows for them per `ACCOUNT-TYPES.md`), so the gate condition is
false regardless of which URL they typed. Confirms the D-10c test matters and should assert
against a mocked buyer session reaching the layout's gate logic directly, not just "buyers
don't normally go here."
**Precedent that this pattern already works correctly in this codebase:** `middleware.ts`
already does an equivalent "profile may not exist, that's fine" query today —
`const { data: ap } = await supabase.from('user_profiles').select('claimed_at').eq('id', user.id).maybeSingle()`
followed by `if (ap && ap.claimed_at === null)`, for **every** authenticated non-auth-route
request (including staff hitting `/admin`, since `ap` is `null` for them and the check
short-circuits). This is the same `profile &&` guard shape D-10b requires, already proven
safe in production for a different field.

### Pitfall 5: `handle` is writable via direct PostgREST today, bypassing app validation entirely
**What goes wrong:** migration 040 grants `authenticated` column-level `UPDATE` on `handle`
directly on the table (verified: `handle` is in migration 040's `GRANT UPDATE (...)` list,
carried through migration 076's view/rename). This means the trigger (not the app's
`EDITABLE_FIELDS` allowlist, not any new `/api/profile/handle` route) is the **only**
backstop against a user setting their own `handle` to a reserved or retired word via a raw
`fetch` to Supabase's REST endpoint. This is precisely why D-06 calls the current state "a
blocking defect" rather than a nice-to-have — the reserved-word bypass is exploitable via
PostgREST *today*, independent of anything the app's UI does.
**How to avoid:** this reinforces (does not change) the recommended design — the trigger
fix is not optional cosmetic hardening, it is the sole enforcement layer for direct-write
attempts. Do not treat the app-layer `/api/profile/handle` route's validation as sufficient.

## Code Examples

### The complete rewritten `check_handle_not_reserved()` (D-06 + D-08)
```sql
-- Source: composed from supabase/migrations/037_reserved_handles.sql's
-- existing function (SECURITY DEFINER + SET search_path = '' preserved
-- byte-for-byte) + this phase's D-06/D-08 requirements.
CREATE OR REPLACE FUNCTION public.check_handle_not_reserved()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- D-06: fire on INSERT as well as UPDATE OF handle. OLD is NULL on
  -- INSERT (TG_OP = 'INSERT'), so the prior unconditional
  -- "lower(NEW.handle) IS DISTINCT FROM lower(OLD.handle)" comparison
  -- (which dereferenced OLD unconditionally) must become conditional.
  IF NEW.handle IS NOT NULL
     AND (TG_OP = 'INSERT' OR lower(NEW.handle) IS DISTINCT FROM lower(OLD.handle))
  THEN
    IF EXISTS (
      SELECT 1 FROM public.reserved_handles WHERE handle = lower(NEW.handle)
    ) THEN
      RAISE EXCEPTION 'handle is reserved';
    END IF;

    -- D-08: a retired handle stays reserved to its original owner
    -- forever — no one (including a different user) may claim it. The
    -- new user_profiles UPDATE path for D-07's "change your handle" flow
    -- also fires this trigger, so this same check protects both signup
    -- and later changes.
    IF EXISTS (
      SELECT 1 FROM public.handle_history WHERE lower(old_handle) = lower(NEW.handle)
    ) THEN
      RAISE EXCEPTION 'handle is reserved';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger widened from UPDATE-only to INSERT OR UPDATE. Renamed for
-- clarity now that it lives on user_profiles (migration 076 carried the
-- old artist_profiles_handle_not_reserved name through the rename
-- untouched, per that migration's own "cosmetic only" note — this
-- migration is already rewriting the function body, so renaming the
-- trigger at the same time is low-risk and removes stale naming).
DROP TRIGGER IF EXISTS artist_profiles_handle_not_reserved ON public.user_profiles;
CREATE TRIGGER user_profiles_handle_not_reserved
  BEFORE INSERT OR UPDATE OF handle ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.check_handle_not_reserved();
```

### The `handle_new_user()` default-branch edit (D-03 + D-15)
```sql
-- Source: composed by extending supabase/migrations/105_artist_gate_intent_id_exemption.sql's
-- live handle_new_user() body. Everything ABOVE this point in the function
-- (curator/buyer/staff/industry branches, the admin-provision exemption,
-- the artist invite gate) is UNCHANGED — reproduce byte-for-byte from
-- migration 105. This is the only edit, replacing the current:
--   INSERT INTO public.user_profiles (id) VALUES (NEW.id);
-- with:
BEGIN
  INSERT INTO public.user_profiles (id, handle)
  VALUES (NEW.id, NULLIF(TRIM(NEW.raw_user_meta_data->>'handle'), ''));
EXCEPTION WHEN unique_violation OR raise_exception THEN
  -- D-15: never abort signUp on a handle collision (taken, reserved, or
  -- a retired handle per D-08). Insert with NULL handle instead — D-09's
  -- hard gate collects one on first sign-in. raise_exception is
  -- PostgreSQL's condition name for SQLSTATE P0001, the default code for
  -- a plain RAISE EXCEPTION with no USING ERRCODE — exactly what
  -- check_handle_not_reserved() raises above. This catch is scoped to
  -- ONLY this INSERT statement, so it cannot swallow the unrelated
  -- 'not_invited' raise earlier in this function (that raise aborts the
  -- whole trigger before this block is ever entered) or any other error.
  INSERT INTO public.user_profiles (id) VALUES (NEW.id);
END;

INSERT INTO public.subscriptions (user_id, tier, status)
VALUES (NEW.id, 'free', 'active');
-- ... rest of the default branch (claim_collaborators call) UNCHANGED
```

Admin-provisioned lanes (buyer/staff/industry, which never set
`user_metadata.handle`) are unaffected — `NULLIF(TRIM(NEW.raw_user_meta_data->>'handle'), '')`
evaluates to `NULL` for them, identical to today's bare insert, and their rows are deleted
or updated by the calling helper immediately afterward exactly as today.

### Recommended handle format validator (D-05)
```typescript
// Source: new file lib/handles/validate.ts, styled after
// lib/metadata/identifiers.ts's small-pure-function pattern
// (normalizeCountry/isValidCountry etc.)

const HANDLE_MIN = 3
const HANDLE_MAX = 30

// Letters, digits, single hyphens/underscores as internal separators only.
// No leading/trailing separator, no consecutive separators (GitHub/Twitter-
// style convention). Confirmed against the one live handle: 'maya-reyes'
// passes (letters, single internal hyphen, no leading/trailing separator).
// Confirmed against all 58 reserved_handles seed values (migration 037):
// none contain hyphens/underscores, so this format is a strict superset —
// no conflict.
const HANDLE_RE = /^[A-Za-z0-9]+(?:[_-][A-Za-z0-9]+)*$/

export function isValidHandle(raw: string): boolean {
  const value = raw.trim()
  if (value.length < HANDLE_MIN || value.length > HANDLE_MAX) return false
  return HANDLE_RE.test(value)
}

// For comparison ONLY — never use this to decide what gets STORED (D-04:
// case-preserving storage, case-insensitive uniqueness).
export function normalizeHandleForCompare(raw: string): string {
  return raw.trim().toLowerCase()
}
```

### Optional DB-level format guard (defense-in-depth, discretionary)
```sql
-- Optional addition to migration 133. Safe to add immediately (unlike
-- NOT NULL, D-13) because a CHECK constraint is automatically satisfied
-- by NULL values — it only ever rejects a non-NULL value that violates
-- the format, so it does not block the ~8 existing handle-less rows.
ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_handle_format_chk
  CHECK (
    handle IS NULL
    OR (handle ~ '^[A-Za-z0-9]+(?:[_-][A-Za-z0-9]+)*$' AND length(handle) BETWEEN 3 AND 30)
  );
```

### The gate condition (D-10b) and where it plugs into the existing layout
```typescript
// Source: app/(artist)/layout.tsx — existing code queries capability_grants
// via `service` after `const { data: { user } } = await supabase.auth.getUser()`.
// Add a sibling query in the same `if (user) { ... }` block:
let profileHandle: string | null | undefined // undefined = no row at all
if (user) {
  const service = createServiceClient()
  const { data: prof } = await service
    .from('user_profiles')
    .select('handle')
    .eq('id', user.id)
    .maybeSingle()
  profileHandle = prof?.handle ?? (prof === null ? undefined : null)
  // ... existing capability_grants / hasSyncLibraryAccess queries unchanged
}

// D-10b: profile absence (Team Member, Client Partner, or any edge case)
// means DO NOT GATE. Only a User Account WITH a row and a NULL/empty
// handle is blocked.
const needsHandle = user && profileHandle !== undefined && !profileHandle

if (needsHandle) {
  return <ChooseHandleGate userId={user.id} />  // no ArtistNav, no children
}
```

### The D-10c test shape (mirrors `lib/admin/gate.test.ts`)
```typescript
// Source: new file app/(artist)/gate.test.ts, styled after the existing
// lib/admin/gate.test.ts's mockSession/describe structure. Tests the
// EXTRACTED pure gate-decision function, not the full layout render (same
// testability move the client-partners room-data tests made — factor the
// decision out of the async server component).
import { shouldGateForHandle } from './gate-logic' // new pure function to extract

describe('app/(artist) hard gate — D-10b/D-10c', () => {
  it('never gates a staff identity (no user_profiles row)', () => {
    expect(shouldGateForHandle({ user: { id: 'staff-1' }, profile: null })).toBe(false)
  })

  it('never gates a buyer identity (no user_profiles row)', () => {
    expect(shouldGateForHandle({ user: { id: 'buyer-1' }, profile: null })).toBe(false)
  })

  it('passes through a User Account that already has a handle', () => {
    expect(shouldGateForHandle({ user: { id: 'u1' }, profile: { handle: 'maya-reyes' } })).toBe(false)
  })

  it('gates a User Account with a profile row but no handle', () => {
    expect(shouldGateForHandle({ user: { id: 'u1' }, profile: { handle: null } })).toBe(true)
  })
})
```
Extracting `shouldGateForHandle()` as a pure function (mirroring how
`loadClientPartnersRoomData` was factored out of its page for testability) is the
recommended approach — it lets the D-10c test suite assert the decision logic directly
without mocking `next/navigation` or Supabase server-client machinery.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `artist_name \|\| 'Unnamed artist'` as the profile title | `artist_name` if set, else `@handle` (never a fabricated string) | This phase (D-11) | Single line change at `lib/profile/load.ts:126`; the surrounding `buildProfileData()` function already receives `profile.handle` as a field, it's simply unused in the `name` computation today. |
| `handle` optional, nullable, never enforced | `handle` mandatory for all User Accounts, enforced first by app (D-09 gate) then DB (D-13 `NOT NULL`, follow-up migration) | This phase | Sequencing matters — see D-13; do not add `NOT NULL` in the same migration as the trigger fix. |

**Deprecated/outdated:**
- The mental model "the reserved-handles guard protects the handle column" — it currently
  protects only the UPDATE path. This phase corrects that, but until migration 133 lands and
  is pushed, treat the guard as **not** covering signups.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A retired handle (D-08) is reserved against **everyone**, including the original owner reclaiming it later. CONTEXT.md's wording ("stays reserved to its original owner") is ambiguous about self-reclaim. | `handle_history` design, Pattern 1/Pitfall 1 | If the owner intends self-reclaim to be allowed, the `check_handle_not_reserved()` EXISTS check against `handle_history` needs an extra `profile_id != NEW.id` (or equivalent) carve-out. Low risk to fix later — the simpler universal-block version is the safe default and can be relaxed without a breaking migration (just a function edit). |
| A2 | The optional DB-level `CHECK` constraint on handle format (regex + length) is worth adding in migration 133 even though CONTEXT.md frames format rules as app-layer/discretionary. | Code Examples, "Optional DB-level format guard" | Low risk either way — if the planner decides against it, simply omit that one `ALTER TABLE` statement; nothing else depends on it. If included, must double-check the regex is byte-identical to `lib/handles/validate.ts`'s `HANDLE_RE` so the two never disagree (a mismatch would let the API reject a handle the DB would have accepted, or vice versa). |
| A3 | Renaming the trigger from `artist_profiles_handle_not_reserved` to `user_profiles_handle_not_reserved` while rewriting it in migration 133 is safe and desirable. | Code Examples, rewritten function | Very low risk — `DROP TRIGGER IF EXISTS ... ON public.user_profiles` targets the correct live table regardless of the trigger's own name (confirmed: migration 076's rename carried the trigger over under its old name, attached to the renamed table). If the planner prefers zero cosmetic changes, keep the old trigger name — purely a style choice, no functional difference. |

## Open Questions

1. **Does the `/api/profile/handle` change-route need to be built in this phase, or can D-07
   ship with only the `handle_history` table + trigger + redirect resolver, deferring the
   actual "change your handle" UI/route to a later phase?**
   - What we know: D-07 says "handles are changeable" as a locked decision, and the phase's
     `<domain>` boundary explicitly lists "handle changes with old-URL redirects" as in
     scope.
   - What's unclear: whether the UI entry point (a settings-page field) is required in this
     phase's UAT, or whether shipping the DB/redirect infrastructure with the change
     initiated via the existing generic profile PATCH is acceptable for v1.
   - Recommendation: build the dedicated route (Code Examples above) since it's a small,
     well-precedented addition (mirrors `visibility/route.ts` almost exactly) and the
     `handle_history` table has no other write path — without this route, D-07's "changeable"
     decision has no way to be exercised at all.

2. **Should the live availability-check endpoint (`GET /api/profile/handle/available`) be
   built as a fully separate route, or folded into the existing
   `POST /api/signup/check-invite` response?**
   - What we know: `check-invite` already round-trips on the signup form at the email-entry
     step; the handle field is a *later* field on the same form (the `'allowed'` branch,
     after the invite check already passed).
   - What's unclear: whether reusing the same rate-limit keyspace (`ip:`/`email:`) for a
     structurally different check (handle availability, not invite eligibility) is
     desirable, or whether a separate endpoint with its own rate-limit keyspace
     (`handle:`) is cleaner.
   - Recommendation: separate route, separate rate-limit key prefix — the two checks guard
     different resources and conflating their limits could let a rapid-fire handle-typing
     session exhaust the same budget the invite check needs, or vice versa.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase CLI (`supabase`) | Local migration diffing/testing before the owner's `supabase db push` | Not verified this session (not required — CLI use is optional; migrations are text-authored and tested via Jest, not run locally against a live DB) | — | Author + text-test the migration; owner runs the actual push. |
| Postgres / Supabase project | All DB-layer changes | Assumed available (production project referenced throughout: `wgfjakfiyeewzfuxkgyo` per migration 132's header) | — | N/A — this is the target system, not optional. |
| Jest / ts-jest | Text-lock migration tests, gate logic tests | ✓ (confirmed in `package.json`: `"test": "jest"`, `jest@^30.4.2`, `ts-jest@^29.4.11`) | jest 30.4.2 | — |

No missing dependencies block this phase. All required tooling is already in the repo.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30.4.2 + ts-jest 29.4.11 |
| Config file | `jest.config.js` |
| Quick run command | `npx jest __tests__/migration-133.test.ts` (or the specific new test file) |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Decision | Behavior | Test Type | Automated Command | File Exists? |
|----------|----------|-----------|-------------------|--------------|
| D-06 | `check_handle_not_reserved()` fires on INSERT, not just UPDATE; handles `OLD IS NULL` safely | unit (text-lock) | `npx jest __tests__/migration-133.test.ts` | ❌ Wave 0 |
| D-08 | `handle_history` is checked by the same guard, blocking reclaim by anyone | unit (text-lock) | `npx jest __tests__/migration-133.test.ts` | ❌ Wave 0 |
| D-15 | `handle_new_user()`'s nested exception catches exactly `unique_violation OR raise_exception`, never `OTHERS`, and does not swallow the earlier `not_invited` raise | unit (text-lock, structural — mirrors `migration-105-gate.test.ts`'s branch-extraction style) | `npx jest __tests__/migration-133.test.ts` | ❌ Wave 0 |
| D-10b/D-10c | Gate never fires for staff or buyer identity; fires only for a handle-less User Account | unit (mirrors `lib/admin/gate.test.ts`) | `npx jest app/(artist)/gate.test.ts` | ❌ Wave 0 |
| D-05 | Handle format regex accepts `maya-reyes`, rejects leading/trailing/consecutive separators and out-of-range lengths | unit | `npx jest lib/handles/validate.test.ts` | ❌ Wave 0 |
| D-04 | `/u/[handle]` resolves case-insensitively | integration (mocked Supabase client) | `npx jest app/u/\[handle\]/page.test.tsx` (new, or extend existing coverage if present) | ❌ Wave 0 (confirm no existing test file covers this page before creating) |
| D-11/D-12 | `buildProfileData()` never renders "Unnamed artist"; shows `@handle` as title when no artist name; legal name never appears | unit | `npx jest lib/profile/load.test.ts` (new, or extend if a load.test.ts already exists — verify before creating) | ❌ Wave 0 (verify) |

### Sampling Rate
- **Per task commit:** the specific new/changed test file's quick-run command above.
- **Per wave merge:** `npm test` (full suite — this phase touches a security-sensitive
  trigger and an auth-adjacent gate; the full suite catch is worth the time given
  `handle_new_user()` is shared across every account-creation path in the app).
- **Phase gate:** full suite green before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `__tests__/migration-133.test.ts` — text-lock + structural test for the trigger
      rewrite and `handle_new_user()` edit, styled after `migration-105-gate.test.ts`.
- [ ] `app/(artist)/gate.test.ts` (or wherever the extracted `shouldGateForHandle()` pure
      function lives) — the D-10c 4-case test.
- [ ] `lib/handles/validate.test.ts` — format regex edge cases.
- [ ] Verify whether `lib/profile/load.test.ts` already exists before assuming a Wave 0 gap
      (not found during this research pass, but confirm at planning time — a stale
      assumption here is cheap to get wrong and cheap to check).
- [ ] Verify whether any existing test already covers `app/u/[handle]/page.tsx` before
      creating a new one (none found during this research pass).

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | No (unchanged) | Signup still goes through unmodified Supabase Auth `signUp()`; this phase adds a field to the call, not new auth logic. |
| V3 Session Management | No (unchanged) | Not touched. |
| V4 Access Control | Yes | Zero-policy RLS + REVOKE on `handle_history` (service-role-only reachability, matching migrations 128–132's established doctrine); the D-10b/D-10c structural exclusion of Team Members/Client Partners from the handle gate is itself an access-control correctness property, test-enforced. |
| V5 Input Validation | Yes | Handle format enforced both client-side (signup form UX) and server-side (`isValidHandle()` in the new `/api/profile/handle` route); the DB CHECK constraint (optional, Assumption A2) is defense-in-depth. Never trust the client-side check alone — mirrors the existing codebase-wide "server re-validates everything" convention (`app/api/profile/route.ts`'s explicit allowlist pattern). |
| V6 Cryptography | No | Not touched. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|-----------------------|
| Reserved-word/brand impersonation via handle (`@admin`, `@spotify`, `@ascap`) | Spoofing | `reserved_handles` table + `check_handle_not_reserved()` trigger, now covering INSERT (D-06 fix) as well as UPDATE — this is the core threat this phase's blocking defect exposes. |
| Impersonation via re-claiming a rebranded artist's abandoned handle | Spoofing | `handle_history` + D-08's permanent-reservation rule, enforced in the same trigger. |
| TOCTOU race on handle claim (two signups/changes racing the same handle) | Tampering | D-14: the unique index (`lower(handle)`) is the actual enforcement; the availability-check endpoint is explicitly non-authoritative. D-15 defines the exact graceful-degradation behavior for the signup-time race. |
| Direct PostgREST write bypassing app-layer validation (Pitfall 5) | Elevation of Privilege | The DB trigger, not the app route, is the backstop — `authenticated` already holds column-level `UPDATE` on `handle` per migration 040, so app-layer validation alone is insufficient by design of this codebase's existing grant model. |
| Handle-availability endpoint used for account enumeration | Information Disclosure | Mirror `check-invite`'s posture: durable, dual-dimension rate limiting (`ip:`, and a `handle:` key here) via `lib/security/rate-limit.ts`. Unlike `check-invite`'s email-enumeration concern, handle availability is inherently public information (anyone can visit `/u/[handle]` to check), so full response-shape masking isn't necessary here — only abuse-rate protection is. |

## Sources

### Primary (HIGH confidence — read directly from this repository this session)
- `supabase/migrations/010_public_showcase_profile.sql` — confirmed `handle` column + case-insensitive unique index on `lower(handle)`, `WHERE handle IS NOT NULL`.
- `supabase/migrations/037_reserved_handles.sql` — confirmed `reserved_handles` (58 seed rows), `check_handle_not_reserved()`'s exact current body (`BEFORE UPDATE OF handle` only, unconditional `OLD.handle` dereference).
- `supabase/migrations/076_rename_artist_profiles_to_user_profiles.sql` — confirmed the trigger followed the table rename under its old name; confirmed `handle_new_user()`'s default branch does the bare `INSERT INTO public.user_profiles (id) VALUES (NEW.id)` at this point.
- `supabase/migrations/098/104/105_*.sql` — confirmed the CURRENT LIVE body of `handle_new_user()` (105 supersedes 104 supersedes 098/099), the `user_metadata`-visible-at-INSERT / `app_metadata`-not-visible-at-INSERT finding, and the exception-isolation idiom used elsewhere in the same function.
- `lib/accounts/provisionIntent.ts` — confirmed the INSERT-time metadata visibility rule's canonical explanation and the admin-provisioning exemption mechanism.
- `app/u/[handle]/page.tsx` — confirmed the exact query (`.eq('handle', handle)`, NOT case-insensitive), confirmed `createServerClient()` vs `createServiceClient()` usage split within the same file (the `loadBlockedIds` precedent for service-role reads of privileged tables).
- `app/(auth)/signup/page.tsx` — confirmed the 5-state machine, the exact `handleSignUpSubmit()` body and its current `supabase.auth.signUp({ email, password, options: { emailRedirectTo } })` call (no `options.data` yet).
- `app/(artist)/layout.tsx` — confirmed current queries (`getUser()`, `capability_grants` only — no `user_profiles` query yet).
- `lib/admin/gate.test.ts` — confirmed the exact test-pattern precedent D-10c references (mocked session, `it.each`-free explicit per-role assertions, and the `loadClientPartnersRoomData` "hide-not-filter" extracted-pure-function testing style used further down the same file).
- `lib/profile/load.ts` — confirmed the exact fallback at line 126 and the `buildProfileData()` function's existing `handle` field pass-through.
- `lib/auth/postSignInPath.ts` — confirmed buyer routing (`BUYER_HOME = '/sync/catalog'`) is independent of `/vault` access control.
- `middleware.ts` — confirmed `isProtected` includes `/vault` gated only on `user` truthiness (not role), and confirmed the existing `profile && ...`-shaped guard already in production for `claimed_at` (Pitfall 4's precedent).
- `app/api/profile/route.ts` — confirmed `handle` is absent from `EDITABLE_FIELDS`.
- `app/api/profile/visibility/route.ts` — confirmed the dedicated-route pattern this phase's `/api/profile/handle` route should mirror.
- `app/api/signup/check-invite/route.ts` — confirmed the rate-limit pattern (`checkRateLimit`/`getClientIp`) this phase's availability-check route should mirror.
- `lib/security/rate-limit.ts` — confirmed the durable, RPC-backed limiter's fail-open behavior and usage contract.
- `supabase/migrations/128_ae_console_health.sql` through `132_selects_engagement.sql` — confirmed the zero-policy-RLS + REVOKE doctrine's exact wording and consistency across 5 consecutive migrations.
- `__tests__/migration-105-gate.test.ts` — confirmed the text-lock/structural-extraction test style to mirror for the new `migration-133.test.ts`.
- `supabase/migrations/` directory listing — confirmed 132 is the highest existing migration number; **133 is next free**.
- `lib/metadata/identifiers.ts` — confirmed the small-pure-function validator style (`isValidCountry`, `isValidRegistrant`) to mirror in `lib/handles/validate.ts`.
- `.planning/config.json` — confirmed `nyquist_validation: true` and `security_enforcement: true` (both sections included above), `security_asvs_level: 1`.

### Secondary (MEDIUM confidence)
- PostgreSQL condition name `raise_exception` = SQLSTATE `P0001` (the default code for an unqualified `RAISE EXCEPTION`) — standard, well-documented PostgreSQL behavior (Appendix A, Class P0 — PL/pgSQL Error), consistent with this codebase's own explicit `USING ERRCODE = 'P0001'` on the `not_invited` raise in the same function (migrations 098/104/105), which corroborates the default.

### Tertiary (LOW confidence)
None — every claim above was either read directly from the repository this session or is well-established PostgreSQL/Next.js platform behavior corroborated by in-repo evidence.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies, entire design composes existing, verified-in-repo mechanisms.
- Architecture: HIGH — every pattern cited was read directly from a live file in this repository this session, not inferred from documentation.
- Pitfalls: HIGH — all five pitfalls are grounded in specific, quoted code (exact line numbers/queries), not speculative.

**Research date:** 2026-08-30
**Valid until:** Next migration touching `handle_new_user()`, `check_handle_not_reserved()`, or `app/(artist)/layout.tsx` invalidates the "current live state" claims above — treat as stable until this phase's own migration 133 lands (at which point this document's "current state" sections become historical, not live).
