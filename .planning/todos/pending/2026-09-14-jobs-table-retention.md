---
created: 2026-09-14T00:00:00Z
title: Completed and failed jobs are never pruned — unbounded table growth (audit M-03)
area: reliability
status: deferred
deferred_on: 2026-09-16
files:
  - supabase/migrations/118_jobs_queue.sql
  - lib/jobs/queue.ts
  - vercel.json
---

## Provenance

Reported by the `funun-repo-audit` skill run on 2026-09-14 at commit `22958185`
(Medium, confidence High). **Not independently verified.** The claim is a negative
one — that no pruning path exists anywhere — which is cheap to re-confirm with a
repo-wide search before acting.

## Context

Every job permanently retains its payload, result, timestamps and error
information. `completeJob` and `failJob` update the row's status but never delete
or archive it. The audit found no migration, helper, route, or cron that removes
terminal jobs.

The schema indexes active/pending work only, so terminal rows accumulate outside
the indexes that keep the queue fast — but still inside the table, its backups,
and any service-only status query that scans by status.

## Scenario

Routine watermark, export and lyric-lift work creates jobs. The every-minute
worker keeps processing new rows while every `completed` and `failed` row stays
forever. Table size, index maintenance cost, backup size and restore time grow
monotonically. Nothing fails; it just degrades.

## Fix direction

Define a retention period, then add a service-only bounded cleanup function that
deletes terminal rows in batches. Schedule it separately from job processing so a
slow cleanup cannot starve the queue worker.

Add the supporting partial index (terminal status + `finished_at`) **before**
enabling cleanup against a large production table, and batch the first run — an
unbatched initial delete risks long locks and a replication spike.

## Tests

Confirm cleanup excludes pending and processing jobs, excludes recent terminal
jobs, respects its batch limit, is idempotent across repeated runs, and uses the
intended index.

## DEFERRED 2026-09-16 — owner decision

**Revisit once beta usage shows what a finished job is actually worth.** The retention period
cannot be chosen sensibly in the abstract: it depends on whether anyone ever looks back at a
completed job, and nobody knows that yet because the beta has barely run.

Deferring costs very little. This degrades on a scale of months, and the table is small today —
the failure mode is a slow increase in backup size and restore time, never an outage. Choosing a
number now and discovering it was wrong later is worse than choosing it when there is evidence.

What would settle it: after a few weeks of real use, look at whether anyone has ever needed to
inspect a `completed` or `failed` job more than a day old. If not, 30 days is generous. If job
history turns out to answer real questions ("how often does watermarking fail?"), it is not a
cleanup problem at all — it is an analytics one, and deleting would be the wrong instinct.

## Open question for the owner

What retention period is actually required, and are job payloads/results
operational records, analytics input, or disposable processing state? That answer
sets the retention window and decides whether terminal jobs should be archived
before deletion rather than simply dropped.
