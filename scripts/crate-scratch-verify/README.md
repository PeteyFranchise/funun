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

Then, one command that runs them all and stops on the first failure:

```bash
node run-all.mjs
```

An earlier version of this README listed five probes while the results claimed seven passed. The
orchestrator exists so the evidence cannot drift from what actually ran:

| probe | proves |
|---|---|
| `probe-privileges.mjs` | `service_role` refused on every write; SELECT and the sanctioned writer still work |
| `probe-truncate.mjs` | the TRUNCATE refusal comes from the trigger, and the mutable queue still truncates |
| `probe-capture.mjs` | digest mismatch, clean capture, current-review-wins, bucket/path, orphans, backfill |
| `probe-codes.mjs` | the SQLSTATE the TypeScript maps is the one the database raises |
| `probe-concurrency.mjs` | two captures give created+replayed; enqueue blocks behind the lock, then refuses |
| `probe-rls.mjs` | the writers work as `service_role` under production RLS, with a real must-fail control |
| `probe-capture-vs-reject.mjs` | racing admit against reject yields only legal outcomes, both branches exercised |
| `probe-replay-status.mjs` | replay succeeds while admitted and is refused after withdrawn, removed or rejected |


## Apply AS A NON-SUPERUSER. This harness certified SQL that production rejected twice.

The first two production applies of 248 failed on things a local superuser never meets:

1. `uuid_generate_v4()` does not resolve — `uuid-ossp` lives in `extensions`, not `public`, and the
   baseline had installed it into `public`.
2. `ALTER ROLE ... NOSUPERUSER NOBYPASSRLS` is superuser-only, and Supabase's runner is not one.

Both would have failed here immediately had the harness applied the way production does. It now
creates a `migration_runner` role — `NOSUPERUSER NOBYPASSRLS CREATEROLE` — owns the legacy tables
and schema `public` with it, and `apply.mjs` does `SET ROLE migration_runner` before applying.

Chasing those permissions surfaced three more dependencies in a row: the runner must own the legacy
tables to GRANT on them, and must own schema `public` to grant and revoke `CREATE` there. **That
last one is an assumption, not a verified fact** — the first production apply never reached those
statements, so whether Supabase's role owns `public` is still unknown. If the next apply fails on a
schema grant, the baseline is what was wrong.

## The baseline MUST reproduce production RLS, and the first version did not

This harness's first version created the legacy tables **without their RLS**, and every probe
passed. That was worthless for the question that mattered: all three tables the writers read have
RLS enabled with ownership-scoped policies, and `funun_crate_evidence` is `NOBYPASSRLS`, so in
production its `SELECT ... FOR UPDATE` would have returned **no rows** and every writer would have
been dead on arrival. A reviewer found it by reading the real migrations; no amount of probing
against an unfaithful baseline could have.

`baseline.sql` now enables that RLS, and `probe-rls.mjs` runs every RPC through
`SET LOCAL ROLE service_role` with a **must-fail control**: drop the listing policy and the writer
stops finding its row, which proves the policies are what make it work rather than decoration.

The same lesson repeated twice more in miniature, both found by running it: the stub `sync_listings`
was missing `admitted_at`, so a grant failed and nothing applied; and the probes reused one track
across listings, which the real partial unique index forbids.

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
- **As `service_role`, under production RLS**, quality review, capture and backfill all succeed —
  and dropping one policy makes capture fail, so the policies are load-bearing.
- **Capture and admission are one transaction.** Racing a capture+admit against a reject, in both
  orderings, yields only *admitted with one capture* or *rejected with none*. Never a captured song
  on a rejected listing.
- **Every probe exits nonzero when it fails**, verified by inverting an assertion in each.
- `SQLSTATE 23505` is what the database raises for an already-captured conflict, which is what the
  TypeScript maps to `already_captured_different_bytes` — that branch is live, not dead.
