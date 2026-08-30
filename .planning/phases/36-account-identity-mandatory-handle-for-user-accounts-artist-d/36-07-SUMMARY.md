---
phase: 36-account-identity-mandatory-handle-for-user-accounts-artist-d
plan: 07
subsystem: database
tags: [supabase, postgres, migration, handles, constraints, account-types, human-gated]
status: complete

# Dependency graph
requires:
  - phase: 36-account-identity-mandatory-handle-for-user-accounts-artist-d
    provides: "lib/handles/validate.ts (plan 01) — the single handle format authority the CHECK constraint is text-locked against"
  - phase: 36-account-identity-mandatory-handle-for-user-accounts-artist-d
    provides: "migration 133 (plan 02) — the reserved/retired guard on both write paths, and the D-15 handle-less fallback the NOT NULL analysis turns on"
  - phase: 36-account-identity-mandatory-handle-for-user-accounts-artist-d
    provides: "The D-09 hard gate (plan 06) — the draining mechanism, and now the sole enforcer of handle PRESENCE"
provides:
  - "supabase/migrations/134_handle_format_and_backfill.sql — user_profiles_handle_format_chk, LIVE in production"
  - "The handle format rule as a database guarantee, closing the PostgREST column-level UPDATE bypass for malformed values"
  - "D-13 resolved on the record: NOT NULL deferred with a named tripwire, not silently dropped"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cross-language text-lock: the SQL CHECK's regex operand and the TypeScript validator's pattern are read out of their own files at test time and compared with toBe — neither is hardcoded in the test, so the two layers cannot drift without the suite failing"
    - "Inverse text-lock: when a removed statement would be dangerous if it returned, assert its absence against the WHOLE file including comments, not just the executable SQL — a commented-out UPDATE is one uncomment away from running"
    - "Count SQL statements by statement-initiating verbs at line start, never by splitting on ';' — a COMMENT ON body containing a semicolon reports a phantom extra statement"

key-files:
  created:
    - supabase/migrations/134_handle_format_and_backfill.sql
    - __tests__/migration-134.test.ts
    - .planning/todos/pending/2026-08-27-handle-tripwire-reconsider-not-null.md
  modified:
    - .planning/phases/36-account-identity-mandatory-handle-for-user-accounts-artist-d/36-CONTEXT.md

key-decisions:
  - "D-13 AMENDED (owner, 2026-08-27): NOT NULL deferred with a named tripwire — 'option 1, for now. The moment we start to see handle-less accounts posting on the website, we need to reconsider our options.' The blocker is INSERT-time provisioning, not old rows: app_metadata is invisible to handle_new_user() at INSERT, so all four admin lanes fall through to the default branch and a non-nullable column would reject buyer/staff/industry/curator provisioning AND fire inside migration 133's D-15 fallback, converting a lost handle race back into a lost signup."
  - "The migration's fixture sweep was REMOVED mid-plan after the owner deleted the five fixture accounts outright rather than sweeping them. That inverted the statement's meaning: the remaining handle-less rows became three real people, and the sweep would have auto-assigned them public identities in violation of D-09's 'prompted, never generated' rule."
  - "The CHECK constraint keeps the `handle IS NULL OR` disjunct. Redundant against a CHECK's own NULL semantics, but it is what makes the migration pushable TODAY against three humans who have not signed in yet, and writing it explicitly keeps that intent legible to whoever reads the constraint next."
  - "The column comment ends with 'Never generate a handle for an existing account' so the rule is visible from \\d+ user_profiles alone, without reading the migration or the phase context."

patterns-established:
  - "A migration whose safety depends on a premise about live data must state that premise in its header. When the premise changed here (fixtures deleted rather than swept), the header was the artifact that made the danger obvious rather than something a reviewer had to reconstruct."
  - "When a locked decision cannot be executed as written, escalate it with the evidence attached and record the rejected option as considered-and-rejected. A silently dropped decision is re-derived by someone six months later who assumes it was an oversight."

requirements-completed: [D-05, D-13]

coverage:
  - id: C1
    description: "The database rejects a malformed handle written directly, closing the migration-040 column-level UPDATE bypass for format (D-05, T-36-34)"
    requirement: "D-05"
    verification:
      - kind: unit
        ref: "__tests__/migration-134.test.ts#adds exactly one CHECK constraint, named, on the handle column"
        status: pass
      - kind: manual
        ref: "Owner + orchestrator against production: rolled-back UPDATE ... SET handle='-nope-' REJECTED with the check-constraint violation"
        status: pass
    human_judgment: true
  - id: C2
    description: "The SQL rule and the application rule are the same rule, and cannot drift (T-36-35)"
    requirement: "D-05"
    verification:
      - kind: unit
        ref: "__tests__/migration-134.test.ts#the SQL pattern is IDENTICAL to the TypeScript pattern, character for character"
        status: pass
      - kind: unit
        ref: "__tests__/migration-134.test.ts#the SQL length bounds are the validator's own HANDLE_MIN_LENGTH and HANDLE_MAX_LENGTH"
        status: pass
    human_judgment: false
  - id: C3
    description: "The SQL pattern string is a working format rule, not merely a plausible-looking one — compiled from the migration and exercised against maya-reyes and the D-05 edge cases"
    requirement: "D-05"
    verification:
      - kind: unit
        ref: "__tests__/migration-134.test.ts#the pattern taken from the SQL behaves like the format rule it claims to be"
        status: pass
    human_judgment: false
  - id: C4
    description: "No handle is ever generated for an existing account — the migration writes to no row (D-09, T-36-37)"
    requirement: "D-13"
    verification:
      - kind: unit
        ref: "__tests__/migration-134.test.ts#contains no UPDATE statement at all"
        status: pass
      - kind: unit
        ref: "__tests__/migration-134.test.ts#never generates a handle value, in any statement or any leftover comment"
        status: pass
      - kind: manual
        ref: "Owner confirmed post-push: maya-reyes untouched"
        status: pass
    human_judgment: true
  - id: C5
    description: "No NOT NULL alteration reaches production, so the four admin-provisioning lanes and the D-15 fallback keep working (T-36-36)"
    requirement: "D-13"
    verification:
      - kind: unit
        ref: "__tests__/migration-134.test.ts#contains no NOT NULL alteration of the handle column anywhere in the file"
        status: pass
    human_judgment: false
  - id: C6
    description: "The constraint validates against every existing row on apply, including the three that have no handle (T-36-38)"
    requirement: "D-05"
    verification:
      - kind: unit
        ref: "__tests__/migration-134.test.ts#the constraint tolerates the handle-less humans it will be pushed against"
        status: pass
      - kind: manual
        ref: "Owner ran the pre-push violator query (0 rows), then supabase db push succeeded and migration list showed parity through 134"
        status: pass
    human_judgment: true

metrics:
  duration: "~50min"
  completed: 2026-08-27
  tasks: 3
  files: 4
---

# Phase 36 Plan 07: Migration 134 + the D-13 Decision Gate — Summary

The handle format became a database guarantee, and the `NOT NULL` constraint D-13 asked for
was escalated rather than shipped — because writing D-13, D-15 and the signup trigger down
side by side showed it would break every admin provisioning lane on this instance.

## What Shipped

**`supabase/migrations/134_handle_format_and_backfill.sql` — LIVE in production.** Three
statements: `user_profiles_handle_format_chk`, a `COMMENT ON COLUMN`, and the schema reload.

```sql
CHECK (
  handle IS NULL
  OR (handle ~ '^[A-Za-z0-9]+(?:[_-][A-Za-z0-9]+)*$' AND length(handle) BETWEEN 3 AND 30)
)
```

Migration 040 grants `authenticated` a column-level UPDATE on `handle`, so a raw PostgREST
write reaches this column without passing through any application route — the same bypass
that forced migration 133's reserved-name trigger rewrite. 133 closed the reserved/retired
half. This closes the format half. Before it, nothing at the database layer stopped `-`,
`   `, a single character, a 400-character string, or an emoji from becoming somebody's
public identity and rendering at `/u/<handle>`.

**`__tests__/migration-134.test.ts`** — 18 assertions. The load-bearing one is a
cross-language string-identity proof: the regex is read out of the migration and out of
`lib/handles/validate.ts` and compared with `toBe`. Neither is hardcoded in the test, so
they cannot drift silently — which matters because a one-character divergence surfaces much
later as an unexplainable 400 on a value the signup form said was fine.

## Task Commits

| Task | Commit | What |
| --- | --- | --- |
| 1 | `de4120d` | Migration 134 as originally planned — fixture sweep + format constraint + text-lock test |
| 1 (revised) | `2abd6c9` | Sweep removed after the owner deleted the fixtures; inverse text-lock added |
| 2 | `4743830` | D-13 amended in CONTEXT.md with the owner's tripwire; interim option folded into the tripwire todo |
| 3 | — | Owner-executed: `supabase db push`, parity confirmed, constraint verified live |

## Decisions Made

### D-13 — `NOT NULL` deferred, with a tripwire (owner, at the plan's checkpoint)

Owner's words, recorded verbatim in the D-13 amendment because the condition *is* the
decision: *"option 1, for now. The moment we start to see handle-less accounts posting on
the website, we need to reconsider our options."*

D-13 assumed the only obstacle to `NOT NULL` was old un-backfilled rows, and that draining
them would clear the way. Reading migration 105's live `handle_new_user()` alongside
`lib/accounts/provisionIntent.ts` showed otherwise. On this Supabase instance `app_metadata`
is **invisible to the trigger at INSERT** — the Phase 27 `27-13` diagnostic that cost two
failed cutovers. So the curator, buyer, staff and industry branches, all of which read
`raw_app_meta_data`, cannot fire, and **every** provisioning path falls through to the
default branch, which carries a handle only for a self-serve artist signup.

A non-nullable column would therefore have rejected buyer, staff, industry and curator
provisioning outright, and would also have fired *inside* migration 133's D-15 fallback —
the handler whose entire purpose is to insert a handle-less row so a lost race costs a
handle rather than an account. A violation raised there propagates, aborts the trigger, and
rolls back the signup: exactly the failure D-15 exists to prevent, re-entered through a
different door. D-10b was a third obstacle: it fixes the gate condition as a plain "profile
row exists and has no handle" test, so the usual placeholder-handle workaround would require
amending a decision plan 06 spent a whole test suite defending.

The obstacle is **INSERT-time provisioning, not old rows** — which is why deleting the five
fixture accounts did not unblock it, and the amendment says so explicitly so the deletion is
never misread as having cleared the way.

**What enforces what, as of this phase:**

| Property | Enforced by | Layer |
| --- | --- | --- |
| Uniqueness | migration 010's `lower(handle)` unique index | database |
| Reserved / retired names | migration 133's `check_handle_not_reserved()`, INSERT + UPDATE | database |
| Format | migration 134's `user_profiles_handle_format_chk` | database |
| **Presence** | **D-09's gate in `app/(artist)/layout.tsx`** | **application** |

**Accepted residual:** the gate guards page loads, not direct API calls, so a deliberate
API-only user could act while handle-less. Security-neutral — a handle is a display identity,
never an authorisation input, so there is no impersonation, escalation or exposure — but
visible: such an account can surface on social surfaces with no name. That is precisely what
the tripwire watches for. Tracked at
`.planning/todos/pending/2026-08-27-handle-tripwire-reconsider-not-null.md`.

The literal `not-null-now` option is recorded in CONTEXT.md as considered-and-rejected rather
than dropped, so nobody re-derives it later and assumes D-13 was ignored.

### The `handle IS NULL OR` disjunct stays

Redundant against a CHECK's own NULL semantics, and it is exactly what made this migration
pushable on 2026-08-27 against three humans who had not signed in yet. Written explicitly so
the intent survives review and nobody tidies it away.

## Deviations from Plan

### 1. [Mid-plan reversal — owner action] The fixture sweep was removed entirely

Task 1 authored Section 1 as the plan specified: `UPDATE public.user_profiles SET handle =
'user-' || left(replace(id::text, '-', ''), 12) WHERE handle IS NULL;`. Its safety rested on
one premise — every remaining handle-less row was a test or demo fixture the D-09 gate could
never reach.

The owner retired that premise on 2026-08-27 by **deleting** the five fixture accounts via
the management API rather than sweeping them. That inverted the statement's meaning.
Production then held 4 `user_profiles`: `maya-reyes` with a handle, and three handle-less
rows belonging to **real people** (the owner, and two of Thomas's accounts). Pushing 134 as
authored would have auto-assigned each of them a generated public identity for the sole
reason that they had not signed in since plan 06's gate shipped — a direct violation of the
locked rule that existing accounts are *prompted* to choose, never assigned (D-09; ROADMAP
owner decision 4).

- **Fix:** Section 1 deleted. Header rewritten to record *why* there is no sweep, so its
  absence reads as a decision rather than an omission.
- **Test:** the five sweep assertions were replaced by five inverse ones — no `UPDATE`, no
  `INSERT INTO`, no `DELETE FROM`, no `SET handle`; statement verbs at line start equal
  exactly `['ALTER', 'COMMENT', 'NOTIFY']`; and, asserted against the **whole file including
  comments**, no `'user-' ||` generator and no `WHERE handle IS NULL;`. A commented-out sweep
  is one uncomment away from renaming three real people, so it is locked out of the text, not
  just out of the executable SQL.
- **Commit:** `2abd6c9`

### 2. [Rule 2 — added beyond the plan's task list] `COMMENT ON COLUMN user_profiles.handle`

Not enumerated in the plan. Migration 133 established the convention with `COMMENT ON TABLE
public.handle_history`, and this column now carries three enforcement mechanisms across two
migrations plus a load-bearing NULL semantic — none of it discoverable from `\d+
user_profiles` without a comment. It ends with *"Never generate a handle for an existing
account"* so deviation 1's rule is visible at the schema, not only in the phase context.

### 3. [Plan-authoring imprecision — recorded, not worked around] A verify step is unsatisfiable

Task 1's `grep -c 'user_profiles_handle_format_chk' … | grep -qx 1` returns **2**: the name
appears on the `ADD CONSTRAINT` line and inside the `COMMENT ON COLUMN` body. The second is
documentation — when someone hits a violation, Postgres names the constraint, and grepping
that name should land on the explanation. This is the same class of unsatisfiable
`grep -c … | grep -qx 1` step recorded in the 36-05 and 36-06 summaries when an import and a
call site both match. Verified the underlying property with `grep -n` instead — exactly one
`ADD CONSTRAINT` in the file — and the test asserts it independently. The other two grep
verifies pass exactly (`SET NOT NULL` → 0, `NOTIFY` → 1).

### 4. [Duplicate avoided] A second tripwire todo was written and deleted

The orchestrator had already filed
`2026-08-27-handle-tripwire-reconsider-not-null.md`. Rather than leave two todos for one
watch item, the duplicate was deleted and the two things it added were folded into the
existing file: why the schema route is not simply "add the constraint", and a cheaper interim
worth pricing first — extending the presence check to the wall/endorsement/DM POST routes
closes the API-only hole without touching D-10b, plan 06's test suite, or the schema.

## Testing

| Gate | Result |
| --- | --- |
| `npx jest __tests__/migration-134.test.ts` | 18 passed |
| `npx jest` (full) | **3134 passed**, 288 suites — baseline 3116 + 18 net new |
| `npx tsc --noEmit` | 0 errors |
| `npm run lint -- --max-warnings=0` | clean |
| `npm run build` | **not run** — dev server on :3000, per the standing prohibition |

The sweep removal was test-neutral: five assertions out, five in.

One bug was caught by the tests rather than by review — the statement-count assertion split
`sqlOnly` on `';'` and reported a phantom fourth statement, because the column comment's own
prose contains a semicolon. Replaced with a verb-at-line-start count.

## Human Verification (Task 3, owner-executed)

An agent never runs `supabase db push` on this project. The owner ran it and confirmed
parity; the orchestrator independently verified against production via the management API:

- `user_profiles_handle_format_chk` exists on `public.user_profiles`
- a rolled-back `UPDATE … SET handle='-nope-'` was **rejected** with the check-constraint
  violation
- `maya-reyes` untouched

**The plan's Task 3 step 2 was stale and was corrected before the owner ran it.** It said to
STOP if any handle-less row belonged to a real person — a guard that existed solely to
protect against the sweep. With the sweep gone, three handle-less rows are the expected,
tolerated state, and following the stale text would have blocked a safe push. The corrected
precondition is the violator query (any stored handle the constraint would reject), which
returned 0 rows.

## Follow-ups / Open Items

- **The tripwire.** `NOT NULL` is deferred, not cancelled. `.planning/todos/pending/2026-08-27-handle-tripwire-reconsider-not-null.md`
  reopens it on a named condition: a handle-less account authoring public activity. If it
  fires, the candidate is `not-null-with-trigger-rework` — **a phase, not a task**.
- **Three handle-less rows remain in production**, by design. Each clears the moment that
  person next loads any `app/(artist)/` page and the gate collects a handle. Worth confirming
  during phase verification that this actually happens for at least one of them — it is the
  first real-world exercise of plan 06's gate, and nothing in this phase has observed it fire
  against a live session.
- **Nothing else in this plan is unverifiable.** The constraint is live and its rejection
  behaviour was exercised against production.

## Self-Check: PASSED

- `supabase/migrations/134_handle_format_and_backfill.sql` — FOUND
- `__tests__/migration-134.test.ts` — FOUND
- `.planning/todos/pending/2026-08-27-handle-tripwire-reconsider-not-null.md` — FOUND
- Commits `de4120d`, `2abd6c9`, `4743830` — FOUND in `git log`
