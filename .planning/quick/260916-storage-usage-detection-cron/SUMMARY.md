---
type: quick
slug: storage-usage-detection-cron
status: complete
created: 2026-09-16
migration: 227
applied: false
source: .planning/todos/pending/2026-09-14-storage-upload-admission-bypass.md (audit M-01)
key-files:
  created:
    - supabase/migrations/227_storage_usage_by_owner.sql
    - app/api/cron/storage-usage-check/route.ts
    - __tests__/storage-usage-check-cron.test.ts
  modified:
    - lib/observability/config.ts
    - vercel.json
---

# M-01 stopgap — Storage usage is now visible, not bounded

## What this is, and what it deliberately is not

Storage RLS lets an authenticated user write directly under their own `{userId}/...` prefix. That
path never passes through `lib/security/upload-admission.ts`, so the server's daily count and byte
quotas simply do not bind a direct browser upload.

The durable fix is **server-issued upload intents** — replacing the blanket write grant with a
narrow, expiring, per-upload one, so the browser keeps direct-upload speed and resumability but
has to ask first.

**This is not that.** Owner decision 2026-09-16: ship detection now, choose the long-term shape
later. It does not stop anyone consuming unbounded storage; it means nobody does so unnoticed.
Nothing built here is thrown away when intents land.

## Why it reads `storage.objects` rather than application tables

Summing `tracks.metadata` would only ever find files the app knows about — and a file uploaded
directly, bypassing admission, is exactly the file the app does not know about. Only the bucket
sees everything.

Unattributed prefixes (a first path segment that is not a UUID) are counted and reported
separately rather than dropped. A file nobody can be billed for is its own kind of problem.

## The threshold lives with the others

`account_storage_gb` was added to `lib/observability/config.ts` alongside the existing bands, so
it is tuned in the same place as everything else and flows through the same
`classifyThreshold` helper.

**Deliberately generous — warning 25 GB, critical 50 GB.** Sound Vault allows 250MB per track, so
a twelve-track album with stems is legitimately several GB and a prolific artist reaches double
digits without doing anything wrong. Set to catch abuse, not to nag real users. Marked
`provisional: true`; beta usage should move it.

## Two things the alert does that matter

**It carries no account ids or file paths.** Counts and aggregates only, per T-32-06 — alert
content is a summary status, never raw user records. Identifying *which* account is a deliberate
second step in admin tooling rather than something broadcast by email.

**A failed check alerts too.** Returning quietly on error would make "the check broke" look
identical to "nobody is over threshold" — the one reading this job must never produce by accident.
That mirrors the existing rule that no-data is never silently healthy.

## The tests were proven to bite

Removing the cron auth guard fails the assertion written to catch it. Done by actually removing
it, not by inspection.

The guard also has an ordering assertion, not just a presence one: the `CRON_SECRET` check must
appear **before** any work. Without that check first, the route is a quota-burning DoS vector
reachable by anyone on the public internet.

## Verification

Every step of CI `validate`: `security:migrations:verify` PASS · `typecheck:strict` clean ·
`lint --max-warnings=0` clean · **622 suites / 7,566 tests** · both `npm audit` levels clean.

## NOT APPLIED

Migration 227 is written and content-tested only; application stays human-gated. Production is at
**226**.

**Ordering is safe either way here**, unlike 226. The function is additive and nothing calls it
until the cron route deploys; the route without the function would fail its daily run and alert
about its own failure, which is loud rather than silent. Migration-first is still tidier.

## What remains for M-01

The todo stays open. This is the stopgap; **upload intents are still the destination**, and the
sequencing note there still applies — ship intent-aware clients before revoking the blanket
Storage grant, never the reverse.
