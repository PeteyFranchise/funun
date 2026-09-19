---
created: 2026-09-14T00:00:00Z
title: Direct Storage writes bypass upload-admission quotas (audit M-01)
area: security
files:
  - supabase/migrations/004_track_audio_storage.sql
  - supabase/migrations/041_track_audio_stems_config.sql
  - supabase/migrations/002_vault_assets_storage.sql
  - supabase/migrations/011_contract_verification.sql
  - lib/security/upload-admission.ts
  - components/vault/StemsUpload.tsx
---

## Provenance

Reported by the `funun-repo-audit` skill run on 2026-09-14 at commit `22958185`
(Medium, confidence High). **Not independently verified** — the audit's findings
against migration 224 were checked line by line and held up, which is some
evidence for its accuracy, but this one has not been re-confirmed. Verify before
acting.

## Context

Application routes enforce daily upload counts, byte quotas, idempotency and
concurrency through `claim_upload_admission`. Storage RLS separately grants
authenticated users direct INSERT and UPDATE under any path beginning with their
own user ID. **A direct Storage request never invokes the admission RPC.**

`track_audio_insert_own` / `track_audio_update_own` validate only the first path
segment. Migration 041 permits individual track-audio objects up to 250 MB.
Equivalent direct-write policies exist for public `vault-assets` and private
`vault-contracts`. `StemsUpload.tsx` proves the direct authenticated Storage path
is reachable and currently in use.

## Scenario

An authenticated user writes objects directly to `track-audio`, `vault-assets` or
`vault-contracts` under `<their-user-id>/...`. Each object can satisfy the
bucket's size/MIME declaration while bypassing daily count, aggregate byte and
concurrency limits entirely. Public vault-assets uploads also skip the server's
magic-byte content inspection.

UID path scoping still prevents cross-tenant writes, so this is authenticated
resource abuse — unbounded object counts and storage/egress cost — not a data
breach. That's why it's Medium rather than Critical.

## Fix direction

Move managed buckets to server-issued upload intents and revoke unrestricted
browser INSERT/UPDATE. If resumable TUS uploads must stay direct, mint narrowly
scoped expiring intents and enforce the quota/path claim at the database or
Storage boundary. Verify size and content before recording completion; reclaim
abandoned intents.

**Sequencing matters:** roll out intent-aware upload clients *first*, then revoke
the old Storage policies. The reverse order breaks stems and instrumental uploads.
Inventory existing orphaned objects separately.

## STOPGAP SHIPPED 2026-09-16 — detection, not prevention

A daily cron (`/api/cron/storage-usage-check`) reads `storage.objects` via migration 227's
service-role-only reporting function. See `.planning/quick/260916-storage-usage-detection-cron/`.

**LIVE as of 2026-09-19.** Migration 227 applied and verified behaviourally: the function runs as
`service_role` against production, and `anon` is refused by name with a positive control
alongside. Current real usage is 0.047 GB across every prefix.

**CORRECTED 2026-09-19** (`.planning/quick/260919-storage-cron-global-total/`). As shipped the job
could not fire: it passed the 25 GB per-account band as the RPC's floor, so it returned zero rows
and reported healthy at any realistic usage. It also called each path segment an account, which is
false — 5 of 8 production UUID segments are work ids. The job now sums every row into one **global
total** and bands it against `storage_total_gb` (warn 5 GB, crit 20 GB, provisional). The
per-account band `account_storage_gb` is **retired**: nothing can measure a per-account footprint
until attribution is repaired, which is this todo's own work.

## 2026-09-19 — upload intents ALREADY EXIST in this codebase

Investigating the stopgap's four "unattributed" objects turned up something that changes this
todo's shape. They are not orphans. They are **Quick Capture voice memos** from the Ideas feature,
stored at `ideas/{ideaId}/{recordingId}.webm` — keyed by idea rather than by user, because an idea
is collaborative and has no single owner in its path. Live and in use; most recent 2026-09-15.

**And that path is already governed by exactly the mechanism this todo calls "the fix".** See
`app/api/ideas/[ideaId]/recordings/upload-intent/route.ts`:

- authenticates, then rate-limits (80 per 15 min per user)
- checks idea-level `contribute` permission
- validates size against `MAX_BYTES` and MIME **before** issuing anything
- **the server chooses the path** via `buildIdeaRecordingPath` — the client cannot name it
- issues `createSignedUploadUrl(path, { upsert: false })` — narrow, expiring, single-path, no overwrite
- a separate `/recordings/complete` route re-derives the path and rejects a mismatch

That is a server-issued upload intent, in production, working.

### What this means for M-01

The fix direction below was written as if intents are unbuilt design work. **They are not — this
is a rollout problem, not a design problem.** The remaining work is to extend the existing pattern
from `ideas/` to `track-audio/{userId}/`, `vault-assets` and `vault-contracts`, then revoke the
blanket browser INSERT/UPDATE grants.

That is substantially smaller and substantially less risky than it reads below, because the shape
is already proven against a real feature rather than being invented for this one. The sequencing
note still governs: intent-aware clients first, revoke second, never the reverse.

`components/vault/StemsUpload.tsx` is the client to convert first — it is the one named in this
todo as proof the direct path is reachable and in use.

## The reporting gap this exposed — and why it is mild

`storage_usage_over_threshold` filters by `p_min_bytes` before returning rows, so a non-UUID path
prefix only ever appears as a footnote inside an alert that fired for some *other* account. You
would not hear about `ideas/` until someone separately crossed 25 GB.

**The irony is worth recording: the one prefix the report cannot attribute is the one prefix that
is already properly governed.** Nothing can be written under `ideas/` without the server issuing a
signed URL for that exact path first. The report's implicit "unattributed means nobody can be
billed for this" is simply the wrong reading here.

Two consequences, neither urgent:

- **Per-account totals undercount.** A user's idea recordings never land in their own figure. At
  222 KB across four files this is noise; it would stop being noise if Quick Capture takes off.
- **"Unattributed" needs a third category.** The useful distinction is not UUID vs not-UUID, it is
  *known non-user prefix* vs *genuinely unrecognised*. Lumping them together means a real orphan
  would hide among legitimate ones.

Worth folding into the intents work, where attribution is the subject rather than a side effect —
not worth a separate migration now.

## Open question for the owner

Is browser-direct Storage writing the intended long-term upload architecture? If
yes, the quota enforcement has to move into the database. If no, the direct
INSERT/UPDATE grants should be retired once clients migrate. That decision gates
the shape of the fix.
