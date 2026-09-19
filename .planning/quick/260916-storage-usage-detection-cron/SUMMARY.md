---
type: quick
slug: storage-usage-detection-cron
status: complete
created: 2026-09-16
migration: 227
applied: 2026-09-19
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

## APPLIED 2026-09-19 — verified behaviourally

Production migration ceiling is now **227**. `migration list` showed 226 on both sides and 227
local-only before the push, with no other gap between the columns, so nothing rode along.

### The check that mattered

`storage_usage_over_threshold` is `SECURITY DEFINER` reading `storage.objects`. **A clean
migration proves nothing about whether the function's owner can actually read that table** — that
failure would surface at 05:00 the next morning, not at push time. So it was called for real:

```
SERVICE CALL OK — rows: 9
  largest single account: 0.034 GB (5 objects)
  TOTAL across all prefixes: 0.047 GB
```

### Grant discipline, with a positive control

```
ANON CALL:    REFUSED (42501: permission denied for function storage_usage_over_threshold)
ANON CONTROL: vault_projects reachable, no error
```

The control is not decoration. A refusal on its own can be produced by a bad key or an
unreachable API; pairing it with a call that still succeeds proves the refusal is specific to this
function. Same discipline as `docs/verification/BETA-RLS-SMOKE-SESSION.md`.

### Three failure alerts fired before this landed

The cron route deployed with PR #83 on 2026-09-16 and ran at 05:00 UTC on the 17th, 18th and 19th
against a function that did not yet exist — emitting its own failure alert each time. That is the
designed behaviour and it is the right behaviour, but it is worth stating plainly: **the gap
between deploying the caller and applying the migration is measured in alerts.** The ordering was
genuinely safe either way here; it was not free.

## ⚠ DEFECT FOUND 2026-09-19 BY CODEX REVIEW — attribution is wrong

**The verification above proved the function runs. It did not prove the rows mean what the column
names say, and they do not.** Recorded here rather than quietly fixed, because the gap between
"the mechanism works" and "the output is correct" is exactly the trap this repo's Verification
Gate warns about, and this round walked into it.

`owner_segment` assumes every UUID first path segment is an account. It is not. Verified against
production by cross-referencing each segment against `auth.users` and `works`:

```
segments migration 227 reports as ACCOUNTS: 8
  real accounts: 2 | work ids: 5 | unknown: 1
```

**The largest row — 36,450,479 bytes, reported in this summary's first draft as "largest single
account" — is a work id.** Only two of eight are people.

### Why the path convention differs, deliberately

`lib/catalogue/audio-mime.ts:125-137` is explicit that `buildVersionPath()` returns
`{workId}/{versionId}.{ext}` with **no owner prefix on purpose** (RESEARCH Pitfall 2): migration
004's storage policies check that the first segment equals the caller's own auth id, so an
owner-prefixed path would reject a legitimate collaborator. Access is gated by `work_member_tier()`
in the route instead. Playbook media is `{roomId}/{userId}/...`
(`app/api/admin/playbook/media/upload-intent/route.ts:31`) and stream previews are `{trackId}/...`
(`lib/watermark/stream-preview.ts:63`). All three are UUIDs. None is an account.

### This is a detection failure, not a labelling nit

The stopgap exists to catch one person consuming unbounded storage. Writer's Room uploads — work
versions, recording clips, producer handoffs — all land under `{workId}/...`, so **a prolific
writer's bytes are fragmented across many work ids, and no single group need ever cross 25 GB.**
The person the alarm was built to catch is the person most able to walk past it.

Two further defects in the same function, both from the Codex review and both confirmed by
reading `227_storage_usage_by_owner.sql:35-60`:

- **The bucket dimension is dropped.** Grouping is by first segment alone, so the same UUID in two
  buckets merges into one row.
- **Filtering happens before returning.** A brand-new unknown namespace stays invisible until it
  is independently large, so the report cannot warn about a path convention it has never seen.

### Status

The function is live and harmless today — nothing is within two orders of magnitude of the 25 GB
band, so no alert fires either way. **It should not be trusted as a detector until attribution is
resolved.** Full review and proposed direction:
`.planning/reviews/CODEX-PROMPT-260919-storage-attribution.md`.

## The "unattributed" objects turned out to be the most useful thing here

The probe found 4 unattributed objects (first path segment not a UUID), 222 KB. Chasing what they
actually were produced a finding worth more than the stopgap itself.

They are **Quick Capture voice memos** — `ideas/{ideaId}/{recordingId}.webm`, keyed by idea rather
than by user because an idea is collaborative and has no single owner in its path. Live feature,
most recent recording 2026-09-15.

**And that path is already governed by server-issued upload intents** —
`app/api/ideas/[ideaId]/recordings/upload-intent/route.ts` authenticates, rate-limits, checks
permission, validates size and MIME before issuing anything, chooses the path itself, and hands
back a `createSignedUploadUrl(path, { upsert: false })`. A `/complete` route re-derives the path
and rejects a mismatch.

So the durable fix M-01 has been waiting for is not unbuilt design work. It exists and runs in
production for one feature. Recorded in full on the M-01 todo; it reframes that work from
"design intents" to "extend the working one".

### Two reporting consequences, neither urgent

The function filters by `p_min_bytes` before returning rows, so a non-UUID prefix surfaces only as
a footnote inside an alert fired by some *other* account.

- **Per-account totals undercount** — a user's idea recordings never appear in their own figure.
- **"Unattributed" needs a third category.** The useful distinction is *known non-user prefix* vs
  *genuinely unrecognised*, not UUID vs not-UUID. As written, a real orphan would hide among
  legitimate ones.

**The irony is the point: the one prefix this report cannot attribute is the one prefix that is
already properly governed.** Left alone deliberately — folding it into the intents work, where
attribution is the subject rather than a side effect.

## What remains for M-01

The todo stays open. This is the stopgap; **upload intents are still the destination**, and the
sequencing note there still applies — ship intent-aware clients before revoking the blanket
Storage grant, never the reverse.
