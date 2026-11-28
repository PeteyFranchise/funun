# Scratch verification for migrations 248, 251, 252, 253

**These migrations had never executed anywhere** until 2026-11-28. Four rounds of review — mine and
Codex's — were static only, because neither machine had psql, PostgreSQL, Docker or Podman. Static
analysis missed a runtime-fatal defect in the migration that has since been cut, and would have
missed more: it cannot see a constraint violation, a privilege that is insufficient for the SQL
using it, or a lock that does not serialise.

## What this is NOT

**Not the production schema.** `baseline.sql` creates only the objects these four migrations
reference, because replaying all 247 prior migrations needs Supabase extensions this harness does
not have. It proves these four apply and behave; it proves nothing about the rest.

## Running it

PostgreSQL 17 binaries, matching production's 17.6 line, with no Homebrew compile and no admin:

```bash
mkdir -p /private/tmp/pgtest && cd /private/tmp/pgtest
npm init -y && npm i embedded-postgres@17.12.0-beta.19 pg
B=node_modules/@embedded-postgres/darwin-x64/native/bin
$B/initdb -D /private/tmp/pgdata -U postgres --auth=trust -E UTF8
$B/pg_ctl -D /private/tmp/pgdata -o "-p 54329 -k /private/tmp/pgtest" -l /private/tmp/pg.log start
```

`pg` is deliberately NOT a dependency of this repository — it is a verification tool, not shipped
code — so the probes must be run from the scratch directory, with this repo's migrations passed in:

```bash
cd /private/tmp/pgtest
cp /path/to/repo/scripts/crate-scratch-verify/*.mjs .
cp /path/to/repo/scripts/crate-scratch-verify/baseline.sql .
export MIGRATIONS_DIR=/path/to/repo/supabase/migrations/
```

Then:

```bash
node apply.mjs             # baseline is applied by hand first, then the four migrations
node probe-privileges.mjs  # service_role refused on writes; SELECT and the RPC still work
node probe-truncate.mjs    # the TRUNCATE guard, proven to be the trigger and not a foreign key
node probe-capture.mjs     # digest mismatch, exact replay, current-review-wins, bucket/path, orphans, backfill
node probe-codes.mjs       # the SQLSTATE the TypeScript caller maps is the one the database raises
node probe-concurrency.mjs # two simultaneous captures, and enqueue serialising behind the listing lock
```

## Results, 2026-11-28, PostgreSQL 17.12

All four migrations applied. Every probe passed.

- `service_role` refused INSERT, UPDATE, DELETE, TRUNCATE, CREATE TRIGGER, and CREATE in schema
  public — all `42501`. SELECT and the sanctioned writer still work.
- The TRUNCATE refusal comes from the append-only **trigger**, verified with CASCADE so no foreign
  key could be doing the work instead, and the mutable orphan queue still truncates, so the guard is
  not over-broad.
- A digest mismatch refuses before anything commits. A clean capture creates exactly one
  `review_playback` resting on a review. A retry **replays** and returns the authoritative path. A
  later FAILING review blocks capture. Wrong bucket, wrong path prefix, and a listing that is not
  `pending_admit` are all refused.
- The queue refuses a path a live artifact references, and accepts a genuine stray.
- Backfill refuses the artist as operator, succeeds for a real operator, rests on an **attestation**
  and never a review, and leaves the song `draft`.
- **Concurrency:** two simultaneous captures of one listing produced *created + replayed*, one song,
  one artifact. No unhandled loser. Enqueue **blocks** while a capture holds the listing lock, then
  refuses the now-live path.
- `SQLSTATE 23505` is what the database raises for an already-captured conflict, which is what the
  TypeScript maps to `already_captured_different_bytes` — that branch is live, not dead.
