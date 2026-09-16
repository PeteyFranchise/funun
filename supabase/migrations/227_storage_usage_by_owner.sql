-- 227_storage_usage_by_owner.sql
-- A reporting function for the M-01 stopgap: total Storage bytes per account,
-- returning only accounts above a caller-supplied threshold. Read-only. Adds no
-- authorship, credits, splits, rights, approvals, delivery state, or membership.

-- ─── Why this exists ─────────────────────────────────────────────────────
-- Storage RLS lets an authenticated user write directly under their own
-- `{userId}/...` prefix, which never passes through the server's upload
-- admission checks (`lib/security/upload-admission.ts`). Daily counts and byte
-- quotas therefore do not bind a direct browser upload.
--
-- The proper fix is server-issued upload intents, which replaces the blanket
-- write grant with a narrow, expiring, per-upload one. That is a real piece of
-- work and it is deliberately NOT what this is.
--
-- This is the stopgap the owner chose: DETECTION, not prevention. It does not
-- stop anyone consuming unbounded storage; it means nobody does so unnoticed.
-- Nothing here is thrown away when intents land later.
--
-- ─── Reading storage.objects ─────────────────────────────────────────────
-- Usage is summed from `storage.objects` rather than from application tables
-- on purpose. Summing `tracks.metadata` would only ever find files the app
-- knows about — and a file uploaded directly, bypassing admission, is exactly
-- the file the app does not know about. Only the bucket sees everything.
--
-- The owning account is the FIRST path segment, which is the convention every
-- upload path in this codebase follows (`{userId}/{projectId}/...`). Rows whose
-- first segment is not a UUID are counted as unattributed rather than dropped:
-- a file nobody can be billed for is itself worth seeing.
--
-- SECURITY DEFINER is required — `storage.objects` is not readable by
-- `authenticated`, and must not become so. Execute is granted to service_role
-- ONLY, so this is reachable from the cron route and nowhere else.

CREATE OR REPLACE FUNCTION public.storage_usage_over_threshold(p_min_bytes BIGINT)
RETURNS TABLE (
  owner_segment TEXT,
  is_uuid       BOOLEAN,
  total_bytes   BIGINT,
  object_count  BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, storage, pg_temp
STABLE
AS $$
  SELECT
    split_part(o.name, '/', 1) AS owner_segment,
    split_part(o.name, '/', 1) ~
      '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' AS is_uuid,
    -- COALESCE because a row mid-upload can carry no size yet; treating that
    -- as zero keeps the total honest rather than nulling the whole sum.
    SUM(COALESCE((o.metadata ->> 'size')::BIGINT, 0))::BIGINT AS total_bytes,
    COUNT(*)::BIGINT AS object_count
  FROM storage.objects o
  WHERE o.name IS NOT NULL
    AND position('/' in o.name) > 0
  GROUP BY 1, 2
  HAVING SUM(COALESCE((o.metadata ->> 'size')::BIGINT, 0)) >= p_min_bytes
  ORDER BY 3 DESC;
$$;

-- service_role only. This reads every object in every bucket, so it must not
-- be reachable by a browser client under any role.
REVOKE EXECUTE ON FUNCTION public.storage_usage_over_threshold(BIGINT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.storage_usage_over_threshold(BIGINT)
  TO service_role;

COMMENT ON FUNCTION public.storage_usage_over_threshold(BIGINT) IS
  'M-01 stopgap. Totals Storage bytes per owning path segment and returns only those at or above p_min_bytes. Detection, not prevention: direct browser uploads bypass server-side admission quotas, and this makes that visible rather than preventing it. service_role only — it reads every object in every bucket.';

NOTIFY pgrst, 'reload schema';
