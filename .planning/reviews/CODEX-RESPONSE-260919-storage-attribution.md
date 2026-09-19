# Storage Attribution Review — Remainder

This file continues the accepted storage-attribution review at Answer 4. It deliberately does not repeat the accepted verdict, corrections, inventory, fragmentation finding, or Answers 1–3.

## Answer 4 — Orphan Reconciliation Design

### Durable model

Use three sources with distinct responsibilities:

1. `storage.objects` is authoritative for object existence and actual stored bytes. Migration 227 was correct to read it because application tables cannot expose a bypass upload (`supabase/migrations/227_storage_usage_by_owner.sql:20-24`).
2. A new `storage_object_ledger` is authoritative for billing owner, uploader, intended entity, declared size, lifecycle state, and expiry.
3. Existing owning tables are authoritative for whether an object is attached to a live domain entity. Those include `tracks`, `work_versions`, `work_recording_clips`, `work_recording_handoffs`, `idea_recordings`, and `playbook_media_assets` (`supabase/migrations/001_initial_schema.sql:115-137`; `supabase/migrations/135_works_core.sql:159-170`; `supabase/migrations/162_writer_room_record_over_beat.sql:12-38`; `supabase/migrations/165_writer_room_take_workflow_handoff.sql:52-64`; `supabase/migrations/169_ideas_inbox.sql:64-84`; `supabase/migrations/206_playbook_enablement_platform.sql:17-29`).

Path parsing becomes a legacy fallback and anomaly signal, not the canonical ownership rule. The deliberate `ideas/{ideaId}/...` and `{workId}/...` layouts should remain unchanged (`lib/ideas/schema.ts:89-96`; `lib/catalogue/audio-mime.ts:125-137`).

### Complete proposed ledger DDL

This is proposed, human-gated SQL. It has not been applied.

```sql
-- Future migration: storage object ownership and lifecycle ledger.
-- HUMAN-GATED. This proposal does not apply itself.

BEGIN;

CREATE TABLE public.storage_object_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id TEXT NOT NULL
    CHECK (char_length(bucket_id) BETWEEN 1 AND 100),
  object_name TEXT NOT NULL
    CHECK (char_length(object_name) BETWEEN 1 AND 1024),
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  uploader_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  entity_kind TEXT NOT NULL
    CHECK (char_length(entity_kind) BETWEEN 1 AND 80),
  entity_id TEXT NOT NULL
    CHECK (char_length(entity_id) BETWEEN 1 AND 200),
  operation TEXT NOT NULL
    CHECK (char_length(operation) BETWEEN 1 AND 80),
  declared_bytes BIGINT
    CHECK (declared_bytes IS NULL OR declared_bytes > 0),
  actual_bytes BIGINT
    CHECK (actual_bytes IS NULL OR actual_bytes > 0),
  state TEXT NOT NULL DEFAULT 'pending'
    CHECK (state IN (
      'pending',
      'attached',
      'failed',
      'abandoned',
      'quarantined',
      'deleted'
    )),
  expires_at TIMESTAMPTZ,
  attached_at TIMESTAMPTZ,
  reconciled_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (bucket_id, object_name),
  CHECK (
    (state = 'attached' AND attached_at IS NOT NULL)
    OR state <> 'attached'
  ),
  CHECK (
    (state = 'deleted' AND deleted_at IS NOT NULL)
    OR state <> 'deleted'
  )
);

CREATE INDEX storage_object_ledger_owner_state_idx
  ON public.storage_object_ledger
  (owner_user_id, state, created_at);

CREATE INDEX storage_object_ledger_uploader_created_idx
  ON public.storage_object_ledger
  (uploader_user_id, created_at);

CREATE INDEX storage_object_ledger_pending_expiry_idx
  ON public.storage_object_ledger (expires_at)
  WHERE state = 'pending';

ALTER TABLE public.storage_object_ledger ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.storage_object_ledger
  FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.storage_object_ledger IS
  'Internal Storage intent, attribution, and reconciliation ledger. owner_user_id is the durable billing/container owner; uploader_user_id is the actor used for admission and abuse controls. No browser role has direct table access.';

COMMIT;
```

There is deliberately no browser RLS policy and no browser grant. Intent routes should write the ledger through a narrowly scoped service-role repository after authenticating and authorizing the caller. If a client-callable RPC is later added, it must derive the actor from `auth.uid()` and derive the owner from the database rather than accept either as authoritative input.

### Creating and completing an intent

The safe lifecycle is:

1. Authenticate and authorize the requested container.
2. Claim uploader admission and container-owner quota atomically.
3. Insert a `pending` ledger row before returning a signed upload URL.
4. Mint the URL for exactly the ledger's bucket and object name.
5. Upload bytes.
6. `/complete` reads Storage metadata, verifies type and actual size, attaches the owning row, and marks the ledger `attached` with `actual_bytes`.

Today, completion routes already inspect Storage after upload, but that validation is callback-dependent (`app/api/vault/[projectId]/tracks/[trackId]/audio/complete/route.ts:48-63`; `app/api/ideas/[ideaId]/recordings/complete/route.ts:32-38`; `app/api/works/[workId]/versions/complete/route.ts:64-77`). The ledger makes an omitted callback visible and attributable.

Where possible, the owning-row mutation and ledger transition must occur in one database RPC/transaction. Otherwise this interleaving is possible:

- Request A uploads an object.
- Request A inserts or updates the owning row.
- Request A crashes before changing the ledger from `pending` to `attached`.
- A cleanup worker sees an expired pending ledger entry.

The worker must therefore check the owning table before deleting. If the owning row references the object, it repairs the ledger to `attached`; it does not delete valid data.

### Comparing Storage with the ledger

`storage.objects` must remain unreadable to ordinary browser roles. Migration 227 uses a `SECURITY DEFINER` function and grants execution only to `service_role`, which is the correct access pattern (`supabase/migrations/227_storage_usage_by_owner.sql:31-33,63-68`).

Use a service-only candidate function. This function may return raw paths to the cron route internally because cleanup needs an exact Storage key, but T-32-06 means alerts may contain only aggregate counts and bytes; the existing cron already states that boundary (`app/api/cron/storage-usage-check/route.ts:70-96`).

```sql
-- Proposed alongside the ledger migration. HUMAN-GATED.

CREATE OR REPLACE FUNCTION public.storage_reconciliation_candidates(
  p_grace INTERVAL DEFAULT INTERVAL '24 hours'
)
RETURNS TABLE (
  bucket_id TEXT,
  object_name TEXT,
  ledger_id UUID,
  owner_user_id UUID,
  classification TEXT,
  actual_bytes BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT
    object_row.bucket_id,
    object_row.name,
    ledger.id,
    ledger.owner_user_id,
    CASE
      WHEN ledger.id IS NULL THEN 'unregistered_object'
      WHEN ledger.state = 'pending'
       AND ledger.expires_at IS NOT NULL
       AND ledger.expires_at + p_grace < now()
        THEN 'abandoned_pending'
      ELSE 'known_object'
    END,
    COALESCE((object_row.metadata ->> 'size')::BIGINT, 0)
  FROM storage.objects object_row
  LEFT JOIN public.storage_object_ledger ledger
    ON ledger.bucket_id = object_row.bucket_id
   AND ledger.object_name = object_row.name
  WHERE ledger.id IS NULL
     OR (
       ledger.state = 'pending'
       AND ledger.expires_at IS NOT NULL
       AND ledger.expires_at + p_grace < now()
     );
$$;

REVOKE ALL
  ON FUNCTION public.storage_reconciliation_candidates(INTERVAL)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
  ON FUNCTION public.storage_reconciliation_candidates(INTERVAL)
  TO service_role;

CREATE OR REPLACE FUNCTION public.storage_missing_attached_objects()
RETURNS TABLE (
  ledger_id UUID,
  bucket_id TEXT,
  object_name TEXT,
  owner_user_id UUID
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT
    ledger.id,
    ledger.bucket_id,
    ledger.object_name,
    ledger.owner_user_id
  FROM public.storage_object_ledger ledger
  LEFT JOIN storage.objects object_row
    ON object_row.bucket_id = ledger.bucket_id
   AND object_row.name = ledger.object_name
  WHERE ledger.state = 'attached'
    AND object_row.id IS NULL;
$$;

REVOKE ALL
  ON FUNCTION public.storage_missing_attached_objects()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
  ON FUNCTION public.storage_missing_attached_objects()
  TO service_role;
```

### Owning-table reconciliation

Backfill and validate ledger entries against these known owners:

- `tracks.audio_file_url` plus `tracks.metadata` master, stems, and instrumental pointers (`app/api/vault/[projectId]/tracks/[trackId]/audio/complete/route.ts:33-45,71-78`; `app/api/vault/[projectId]/tracks/[trackId]/stems/route.ts:61-66`).
- `work_versions.audio_path`, resolving billing ownership through `works.user_id` while retaining `work_versions.user_id` as uploader (`supabase/migrations/135_works_core.sql:77-89,123-132,159-170`).
- `work_recording_clips.audio_path` through session and work (`supabase/migrations/162_writer_room_record_over_beat.sql:12-38`).
- `work_recording_handoffs.vocal_path` through work (`supabase/migrations/165_writer_room_take_workflow_handoff.sql:52-64`).
- `idea_recordings.audio_path` through `ideas.user_id`, retaining `created_by` as uploader (`supabase/migrations/169_ideas_inbox.sql:6-9,64-84`).
- `playbook_media_assets.storage_path` and `created_by` (`supabase/migrations/206_playbook_enablement_platform.sql:17-29`).
- Existing artifact records such as `metadata_delivery_exports` and `song_passport_artifacts` (`app/api/vault/[projectId]/tracks/[trackId]/metadata/sidecar/route.ts:192-208`; `app/api/works/[workId]/passport/artifacts/route.ts:199-218`).

Add explicit `storage_path` columns for surfaces that currently persist only public URLs. Project assets and profile images currently store URLs, which otherwise forces brittle URL parsing during backfill (`app/api/vault/[projectId]/assets/route.ts:104-119`; `app/api/profile/avatar/route.ts:92-100`).

### In-flight versus genuine orphan

An object is **in flight** when it has a `pending` ledger entry whose expiry plus grace period has not passed. It is not an orphan merely because no owning row exists yet.

An object is **abandoned pending** when it has a pending ledger entry, exists in Storage, has no owning-row reference, and its expiry plus grace period has passed.

An object is a **genuine unknown/orphan candidate** when it exists in Storage but has neither a ledger row nor an owning-table reference. Before cutover, that classification requires manual review because it may be legitimate legacy data. After every legitimate writer is ledger-aware and the old grants are removed, a newly created unknown object is either a defect or an unauthorized/bypass artifact.

An `attached` ledger row with no Storage object is a different class: missing-object integrity failure. It should alert and drive repair; the system must not silently remove the owning row.

### Action on a hit

| Classification | Immediate action | Later action | Decision authority |
|---|---|---|---|
| Pending, within grace | None | Await or retry completion | Automatic |
| Pending, expired, object exists, no owner row | Mark `abandoned`; summary alert | Delete through Storage API after a second retention window | Automatic after policy-approved retention |
| Pending, expired, owner row exists | Repair ledger to `attached` | None | Automatic |
| Unknown object created before cutover | Summary alert | Quarantine or delete only after review | Owner/admin |
| Unknown object created after verified cutover | Summary alert and quarantine | Delete after retention | Automatic under documented policy |
| Attached ledger, object missing | Integrity alert | Restore, re-upload, or mark domain record unavailable | Owner/admin or support |
| Known system object | Count separately | Apply system-specific retention | System owner |

Start in report-only mode. After a burn-in period demonstrates that every legitimate writer creates a ledger entry, enable quarantine for post-cutover unknowns. Deletion should follow quarantine and a documented retention period.

Do not delete rows directly from `storage.objects`; use the service-role Storage API so Storage metadata and the backing object remain consistent.

## Answer 5 — Ordered Rollout and the Fail-Closed Limiter Decision

The full consolidated rollout appears under **Recommended Sequence**. The key ordering constraint is that project assets, profile images, and contract verification must move to service-role Storage writes before their authenticated INSERT/UPDATE policies disappear (`app/api/vault/[projectId]/assets/route.ts:87-100`; `app/api/profile/avatar/route.ts:73-87`; `app/api/contracts/verify/route.ts:90-97`).

### Is `failClosed: true` sufficient by itself?

No. Adding `failClosed: true` to the five intent-rate-limit calls closes only the limiter-outage bypass. It does not add aggregate byte admission, bind declared size to the stored object, keep a reservation active through transfer, or clean abandoned signed uploads.

The five affected calls are Ideas, work versions, recording clips, producer handoffs, and Playbook media (`app/api/ideas/[ideaId]/recordings/upload-intent/route.ts:16-17`; `app/api/works/[workId]/versions/upload-intent/route.ts:23-24`; `app/api/works/[workId]/recording-sessions/[sessionId]/clips/upload-intent/route.ts:15-16`; `app/api/works/[workId]/recording-sessions/[sessionId]/handoffs/upload-intent/route.ts:18-19`; `app/api/admin/playbook/media/upload-intent/route.ts:22-24`). The helper explicitly returns the configured failure posture when its RPC errors or throws (`lib/security/rate-limit.ts:41-52`).

### Does fail-closed create a worse failure mode?

It creates an availability tradeoff: a rate-limiter outage blocks new upload intents for those five surfaces. It does not take the whole platform down; it blocks those uploads until the limiter recovers. Those routes already depend on database-backed authorization or persistence: Ideas resolves database access, work routes resolve membership/session state, and Playbook inserts its pending asset before URL issuance (`app/api/ideas/[ideaId]/recordings/upload-intent/route.ts:19-20`; `app/api/works/[workId]/versions/upload-intent/route.ts:27-30`; `app/api/works/[workId]/recording-sessions/[sessionId]/clips/upload-intent/route.ts:18-29`; `app/api/admin/playbook/media/upload-intent/route.ts:25-37`). A broader database failure would therefore impair these flows even if the limiter failed open.

### Which should ship first?

Ship `failClosed: true` first, with monitoring, then ship quota/ledger work immediately afterward.

Reasons:

- It is a small, independently reviewable containment change.
- It prevents the worst posture—unlimited intent issuance precisely while the shared limiter is unavailable.
- Its failure mode is reversible upload unavailability, while fail-open permits unbounded cost accumulation.
- It does not require waiting for schema design, backfill, or policy removal.

Do not describe it as the quota fix. Healthy-limiter abuse bounds from Answer 3 remain until admission and actual-byte reconciliation ship.

## Answer 6 — Repair Migration 227 or Skip Directly to the Ledger?

### Recommendation

Ship a new migration 228 as an interim detector repair, then build the ledger. Do not edit applied migration 227.

Skipping directly to the ledger would leave the live detector systematically fragmented during a multi-step rollout. Migration 227 groups and thresholds each first segment separately (`supabase/migrations/227_storage_usage_by_owner.sql:47-60`), and the cron treats returned UUID segments as accounts (`app/api/cron/storage-usage-check/route.ts:59-64`). Migration 228 should resolve known path families to owners and aggregate all of an owner's segments before applying the threshold.

### Proposed migration 228

This is proposed, human-gated SQL. It has not been applied.

```sql
-- 228_storage_usage_attribution_v2.sql
-- HUMAN-GATED. Migration 227 remains unchanged because it is already applied.

CREATE OR REPLACE FUNCTION public.storage_usage_by_owner_v2(
  p_min_bytes BIGINT
)
RETURNS TABLE (
  owner_user_id UUID,
  attribution TEXT,
  total_bytes BIGINT,
  object_count BIGINT,
  source_group_count BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  WITH object_rows AS (
    SELECT
      object_row.bucket_id,
      object_row.name,
      split_part(object_row.name, '/', 1) AS first_segment,
      split_part(object_row.name, '/', 2) AS second_segment,
      COALESCE((object_row.metadata ->> 'size')::BIGINT, 0) AS object_bytes,
      CASE
        WHEN split_part(object_row.name, '/', 1) ~
          '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        THEN split_part(object_row.name, '/', 1)::UUID
        ELSE NULL
      END AS first_uuid,
      CASE
        WHEN split_part(object_row.name, '/', 2) ~
          '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        THEN split_part(object_row.name, '/', 2)::UUID
        ELSE NULL
      END AS second_uuid
    FROM storage.objects object_row
    WHERE object_row.name IS NOT NULL
      AND position('/' IN object_row.name) > 0
  ),
  resolved AS (
    SELECT
      object_rows.bucket_id,
      object_rows.name,
      object_rows.first_segment,
      object_rows.object_bytes,
      COALESCE(
        playbook.created_by,
        idea.user_id,
        work.user_id,
        preview_track.user_id,
        direct_user.id
      ) AS resolved_owner,
      CASE
        WHEN playbook.id IS NOT NULL THEN 'resolved'
        WHEN idea.id IS NOT NULL THEN 'resolved'
        WHEN work.id IS NOT NULL THEN 'resolved'
        WHEN preview_track.id IS NOT NULL THEN 'resolved'
        WHEN direct_user.id IS NOT NULL THEN 'resolved'
        WHEN object_rows.bucket_id = 'vault-assets'
         AND object_rows.first_segment IN ('staff', 'health-rules')
          THEN 'known_system'
        ELSE 'unknown'
      END AS resolution
    FROM object_rows
    LEFT JOIN public.playbook_media_assets playbook
      ON object_rows.bucket_id = 'playbook-media'
     AND playbook.storage_path = object_rows.name
    LEFT JOIN public.ideas idea
      ON object_rows.first_segment = 'ideas'
     AND idea.id = object_rows.second_uuid
    LEFT JOIN public.works work
      ON object_rows.bucket_id = 'track-audio'
     AND work.id = object_rows.first_uuid
    LEFT JOIN public.tracks preview_track
      ON object_rows.bucket_id = 'selects-stream-previews'
     AND preview_track.id = object_rows.first_uuid
    LEFT JOIN auth.users direct_user
      ON direct_user.id = object_rows.first_uuid
  ),
  aggregated AS (
    SELECT
      resolved_owner AS owner_user_id,
      resolution AS attribution,
      SUM(object_bytes)::BIGINT AS total_bytes,
      COUNT(*)::BIGINT AS object_count,
      COUNT(
        DISTINCT bucket_id || E'\x1f' || first_segment
      )::BIGINT AS source_group_count
    FROM resolved
    GROUP BY resolved_owner, resolution
  )
  SELECT
    aggregated.owner_user_id,
    aggregated.attribution,
    aggregated.total_bytes,
    aggregated.object_count,
    aggregated.source_group_count
  FROM aggregated
  WHERE (
    aggregated.attribution = 'resolved'
    AND aggregated.total_bytes >= GREATEST(p_min_bytes, 0)
  )
  OR aggregated.attribution IN ('unknown', 'known_system')
  ORDER BY
    CASE aggregated.attribution
      WHEN 'unknown' THEN 0
      WHEN 'resolved' THEN 1
      ELSE 2
    END,
    aggregated.total_bytes DESC;
$$;

REVOKE ALL
  ON FUNCTION public.storage_usage_by_owner_v2(BIGINT)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
  ON FUNCTION public.storage_usage_by_owner_v2(BIGINT)
  TO service_role;

COMMENT ON FUNCTION public.storage_usage_by_owner_v2(BIGINT) IS
  'Migration 228 interim detector. Resolves direct account prefixes, work-scoped track-audio, idea-scoped audio, Playbook assets, and track-scoped stream previews to database owners before applying the threshold. Unknown and known-system aggregates are returned regardless of threshold. service_role only; alerts must remain summary-only.';

NOTIFY pgrst, 'reload schema';
```

The matching application PR must switch the cron RPC name, calculate `worstGb` only from resolved-owner rows, report unknown aggregate counts/bytes regardless of threshold, and exclude `known_system` from account-abuse counts. It must not include `owner_user_id` or paths in alerts (`app/api/cron/storage-usage-check/route.ts:70-96`).

Migration 228 is intentionally temporary. Every new path family would otherwise require resolver SQL; the ledger replaces that brittle convention.

## Answer 7 — Container Owner Versus Uploader

### Case for charging the container owner

- The owner controls retention and the durable container.
- The quota remains understandable even when many collaborators upload.
- Removing a collaborator does not require rebilling historical objects.
- A future ownership transfer can move responsibility for the complete container.
- Container deletion supplies a coherent cleanup boundary.

The schema already distinguishes these roles: `works.user_id` is the owner, while `work_versions.user_id` is explicitly the version creator and may be a collaborator (`supabase/migrations/135_works_core.sql:77-89,123-132,159-170`). Ideas likewise have `ideas.user_id` and `idea_recordings.created_by` (`supabase/migrations/169_ideas_inbox.sql:6-9,64-71`).

### Case for charging the uploader

- The actor causing the cost consumes their own allowance.
- A malicious collaborator cannot exhaust the owner's personal uploader quota without exhausting their own.
- Abuse controls and accountability naturally follow the actor.

The downside is fragmented billing: one work becomes a set of differently owned objects, removing a collaborator does not resolve retained historical charges, and a work transfer does not move the associated storage burden.

### Recommendation

Keep both dimensions:

- **Durable billing/retention owner:** the container owner (`works.user_id` or `ideas.user_id`).
- **Admission/abuse actor:** the authenticated uploader (`work_versions.user_id`, `idea_recordings.created_by`, or the intent caller).

Enforce a container-owner byte budget and an uploader count/velocity budget. This stops an individual collaborator from minting unlimited intents while keeping the owner's total storage predictable.

### Collaborator removal

Do not reassign or delete historical objects merely because a collaborator loses membership. The bytes remain charged to the container owner; uploader identity remains immutable provenance. Work access is intentionally resolved through the work rather than `work_versions.user_id` (`supabase/migrations/135_works_core.sql:128-132`).

### Work transfer

There is no sanctioned transfer path for `works.user_id` today; it remains immutable even to elevated application writers (`supabase/migrations/196_owner_immutable_guard_custody_exemption.sql:70,147`). If work transfer is introduced later, change the billing owner for live ledger entries in the same sanctioned transaction while preserving `uploader_user_id`.

For historical reporting, record effective ownership periods rather than rewriting all prior usage history. That history design is a recommendation, not an existing schema fact.

### Work or idea deletion

Work versions, recording sessions, and handoffs cascade relationally when their parent work disappears (`supabase/migrations/135_works_core.sql:159-162`; `supabase/migrations/162_writer_room_record_over_beat.sql:12-16`; `supabase/migrations/165_writer_room_take_workflow_handoff.sql:52-56`). Idea recordings cascade when their idea disappears (`supabase/migrations/169_ideas_inbox.sql:64-68`).

Those database cascades do not themselves delete Storage bytes. A sanctioned container-delete flow must queue or perform Storage deletion, and reconciliation must catch leftovers. Until deletion succeeds, retain the last owner in the ledger so remaining bytes do not become unattributed.

## Answer 8 — Full Policy-Removal SQL

### Preconditions

The removal migration is safe only when all of the following are true:

1. Stems no longer authenticate direct TUS writes with the caller JWT (`components/vault/StemsUpload.tsx:100-133`).
2. Instrumentals no longer use authenticated `.upload(..., upsert: true)` (`components/vault/StemsUpload.tsx:179-213`).
3. Project assets use a service client only after existing authentication, ownership, admission, and content checks (`app/api/vault/[projectId]/assets/route.ts:34-47,61-99`).
4. Profile images use a service client only after existing authentication, admission, and content checks (`app/api/profile/avatar/route.ts:36-70,73-87`).
5. Contract verification uses a service client only after existing authentication, project ownership, admission, and PDF checks (`app/api/contracts/verify/route.ts:41-73,90-97`).
6. Signed and resumable replacement clients have passed non-production tests with the old policies absent.
7. Reconciliation is live in report-only mode and shows no unexplained post-cutover writers.
8. The code PR is deployed before the human-gated policy migration.

### Proposed policy-removal SQL

This is proposed, human-gated SQL. It has not been applied.

```sql
-- Future migration: retire blanket authenticated Storage creation/overwrite.
-- HUMAN-GATED. Apply only after every precondition above is verified.

BEGIN;

DROP POLICY IF EXISTS "track_audio_insert_own"
  ON storage.objects;

DROP POLICY IF EXISTS "track_audio_update_own"
  ON storage.objects;

DROP POLICY IF EXISTS "vault_assets_insert_own"
  ON storage.objects;

DROP POLICY IF EXISTS "vault_assets_update_own"
  ON storage.objects;

DROP POLICY IF EXISTS "vault_contracts_insert_own"
  ON storage.objects;

DROP POLICY IF EXISTS "vault_contracts_update_own"
  ON storage.objects;

COMMIT;
```

### Replacement policies and grants

Create **no replacement authenticated INSERT or UPDATE policy**. Another broad path-prefix policy would recreate M-01.

Do **not** issue a table-wide `REVOKE INSERT, UPDATE ON storage.objects FROM authenticated` in this migration. That would affect unrelated or future buckets rather than only the three reviewed buckets.

No new service-role Storage grant is required in application SQL. Trusted routes use `createServiceClient()` after their authorization gates; the existing legacy track upload demonstrates that pattern (`app/api/vault/[projectId]/tracks/[trackId]/audio/route.ts:29-40,60-90`).

Keep the current SELECT and DELETE policies until separately migrated:

- Track audio SELECT and DELETE remain owner-prefix-scoped (`supabase/migrations/004_track_audio_storage.sql:33-39,59-64`).
- Vault-assets DELETE remains owner-prefix-scoped (`supabase/migrations/002_vault_assets_storage.sql:45-50`).
- Vault-contracts SELECT and DELETE remain owner-prefix-scoped (`supabase/migrations/011_contract_verification.sql:53-55,66-68`).

Those policies do not allow creation of new storage consumption, so removing them is not required to close M-01.

## Recommended Sequence

1. **Add `failClosed: true` to the five intent rate-limit calls and add limiter-failure monitoring.**
   - If skipped: a limiter outage permits unlimited signed-intent issuance (`lib/security/rate-limit.ts:41-52`).
   - This is containment, not quota completion.

2. **Apply human-reviewed migration 228, adding the new attribution function without changing migration 227.**
   - If skipped: the live detector continues thresholding fragmented work IDs.
   - If the cron switches first: it calls a nonexistent RPC and fails.

3. **Deploy the cron PR that calls `storage_usage_by_owner_v2`.**
   - If skipped: migration 228 exists but production still uses the defective 227 function (`app/api/cron/storage-usage-check/route.ts:40-45`).

4. **Adopt container-owner billing and uploader admission as the explicit ownership rule.**
   - If skipped: quota and ledger implementations can disagree about who owns collaborative bytes.

5. **Add and backfill the storage ledger.**
   - If skipped: abandoned signed uploads and genuine bypass objects remain indistinguishable.

6. **Make intent issuance atomic with admission and pending-ledger creation.**
   - If skipped: a signed URL can exist without durable quota reservation or ownership.

7. **Add byte admission to Ideas, work versions, clips, handoffs, and Playbook media.**
   - If skipped: the healthy-limiter byte bounds from Answer 3 remain.

8. **Keep reservations active until completion or expiry and reconcile actual bytes.**
   - If skipped: callers can under-declare, and concurrency claims still end before transfer (`app/api/vault/[projectId]/tracks/[trackId]/audio/upload-intent/route.ts:76-88`).

9. **Migrate instrumentals to immutable signed uploads.**
   - If skipped: removing track-audio INSERT/UPDATE breaks instrumentals (`components/vault/StemsUpload.tsx:179-213`).

10. **Implement and verify a scoped resumable stems flow.**
    - If skipped: removing the policies breaks direct TUS stems (`components/vault/StemsUpload.tsx:85-133`).
    - The current stems route deliberately accepts metadata rather than file bytes (`app/api/vault/[projectId]/tracks/[trackId]/stems/route.ts:9-14`).

11. **Move project assets, profile images, and contract verification to service-client Storage writes after their existing gates.**
    - If skipped: those routes fail authorization immediately after policy removal.

12. **Deploy all code and run reconciliation in report-only mode through a burn-in period.**
    - If skipped: an overlooked writer is discovered through production failure or false orphan cleanup.

13. **Test the exact no-INSERT/no-UPDATE policy state outside production.**
    - Verify all six intents, stems, instrumentals, project assets, profile images, contract verification, completion retries, and abandoned-upload cleanup.
    - If skipped: there is no evidence the intended production policy state is compatible with every active writer.

14. **Apply the human-gated policy-removal migration through the protected-main PR process.**
    - If reordered ahead of steps 9–13: active uploads break.
    - If omitted: direct authenticated Storage abuse remains possible regardless of UI changes.

15. **Enable cleanup enforcement gradually: alert, then quarantine, then delete after grace.**
    - If deletion is enabled immediately: callback races or incomplete backfills can destroy valid user files.

16. **Retire 227 cron usage after 228 is verified, then replace 228 attribution with ledger-native accounting.**
    - If 228 becomes permanent: each new path family requires resolver SQL and attribution drift returns.

## Confidence

### Verified by reading code

- Migration 227 groups and thresholds by first segment before any owner resolution (`supabase/migrations/227_storage_usage_by_owner.sql:47-60`).
- `storage.objects` is accessed through a service-only `SECURITY DEFINER` function (`supabase/migrations/227_storage_usage_by_owner.sql:31-33,63-68`).
- The five intent rate-limit call sites omit `failClosed: true`, and the helper fails open by default (`lib/security/rate-limit.ts:24-29,41-52`).
- Work and idea schemas distinguish container owner from uploader (`supabase/migrations/135_works_core.sql:77-89,123-132,159-170`; `supabase/migrations/169_ideas_inbox.sql:6-9,64-71`).
- `works.user_id` has no sanctioned transfer exemption today (`supabase/migrations/196_owner_immutable_guard_custody_exemption.sql:70,147`).
- The three authenticated server routes identified in C7 still rely on caller-scoped Storage writes (`app/api/vault/[projectId]/assets/route.ts:97-100`; `app/api/profile/avatar/route.ts:84-87`; `app/api/contracts/verify/route.ts:90-97`).
- The named INSERT/UPDATE policies exist in migrations 002, 004, and 011 (`supabase/migrations/002_vault_assets_storage.sql:27-43`; `supabase/migrations/004_track_audio_storage.sql:41-57`; `supabase/migrations/011_contract_verification.sql:57-64`).

### Inferred or proposed

- Ledger DDL, reconciliation functions, migration 228, retention periods, quarantine behavior, and policy-removal SQL are proposals. None was applied or tested against production.
- The recommendation to fail closed first is a risk judgment: temporary upload unavailability is considered preferable to unlimited intent issuance during limiter failure.
- Exact quarantine and deletion intervals require an owner-approved retention policy.
- Historical billing across a future work transfer requires product/accounting policy; the current code makes work ownership immutable.

### Production evidence boundary

Production segment counts and byte totals were supplied by the owner and were not independently queried in this review. Alert recommendations preserve T-32-06 by keeping raw owner identifiers and paths inside service-only reconciliation and emitting only summary counts and aggregate bytes (`app/api/cron/storage-usage-check/route.ts:70-96`).

### Repository state

This document proposes future work only. It does not apply migrations, change policies, contact production, deploy code, or alter the deliberate `ideas/...` and `{workId}/...` path shapes.
