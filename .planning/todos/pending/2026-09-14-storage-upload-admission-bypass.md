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

A daily cron (`/api/cron/storage-usage-check`) now totals Storage bytes per account from
`storage.objects` and alerts on anyone at or above the `account_storage_gb` warning band.
Migration 227 adds the service-role-only reporting function. See
`.planning/quick/260916-storage-usage-detection-cron/`.

**This does not close the finding.** Unbounded upload is still possible; it is now visible. The
owner's reasoning: the risk needs someone deliberately abusing a beta with a handful of known,
paying users, and "I would get an alert" is proportionate to that. Nothing built for the stopgap
is wasted when intents land.

**Upload intents remain the destination**, and the sequencing note below still governs it: ship
intent-aware clients FIRST, then revoke the blanket Storage grant. The reverse order breaks stems
and instrumental uploads immediately.

## Open question for the owner

Is browser-direct Storage writing the intended long-term upload architecture? If
yes, the quota enforcement has to move into the database. If no, the direct
INSERT/UPDATE grants should be retired once clients migrate. That decision gates
the shape of the fix.
