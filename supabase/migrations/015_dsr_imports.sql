-- ============================================================
-- 015 — Persisted DSR import aggregates
-- Stores the aggregated result of a parsed DDEX DSR flat-file so the
-- Earnings room shows real history without re-uploading. One row per
-- import; per-ISRC breakdown kept as JSONB.
-- Idempotent. Run via: supabase db push (or the management query API).
-- ============================================================

CREATE TABLE IF NOT EXISTS dsr_imports (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  file_name     TEXT,
  currency      TEXT,
  total_revenue NUMERIC NOT NULL DEFAULT 0,
  total_units   BIGINT  NOT NULL DEFAULT 0,
  by_isrc       JSONB   NOT NULL DEFAULT '[]'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dsr_imports_user_idx ON dsr_imports (user_id, created_at DESC);

ALTER TABLE dsr_imports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dsr_imports_select_own" ON dsr_imports;
DROP POLICY IF EXISTS "dsr_imports_insert_own" ON dsr_imports;
DROP POLICY IF EXISTS "dsr_imports_delete_own" ON dsr_imports;
CREATE POLICY "dsr_imports_select_own" ON dsr_imports FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "dsr_imports_insert_own" ON dsr_imports FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "dsr_imports_delete_own" ON dsr_imports FOR DELETE TO authenticated USING (user_id = auth.uid());
