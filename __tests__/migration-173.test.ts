import { readFileSync } from 'fs'
import path from 'path'

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/173_ai_and_selects_abuse_controls.sql'),
  'utf8'
)

describe('migration 173 — AI and Selects abuse controls', () => {
  it('serializes durable AI admission and limits daily/concurrent usage', () => {
    expect(migration).toContain('CREATE TABLE public.ai_usage_claims')
    expect(migration).toContain('pg_advisory_xact_lock')
    expect(migration).toContain("'reason', 'concurrency'")
    expect(migration).toContain("'reason', 'daily_limit'")
    expect(migration).toContain('UNIQUE (user_id, idempotency_key)')
    expect(migration).toContain('CREATE TABLE public.ai_usage_policy')
    expect(migration).toContain('idx_ai_usage_claims_global_daily')
    expect(migration).toContain('idx_ai_usage_claims_retention')
    expect(migration).toContain("'ai-global:' || v_day::TEXT")
    expect(migration).toContain("'reason', 'global_limit'")
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.claim_ai_usage')
  })

  it('stores bounded daily Selects aggregates with retention and capacity caps', () => {
    expect(migration).toContain('CREATE TABLE public.selects_track_engagement_daily')
    expect(migration).toContain('CREATE TABLE public.selects_opens_daily')
    expect(migration).toContain('selects_engagement_capacity_reached')
    expect(migration).toContain("engagement_day < v_day - 90")
    expect(migration).toContain('v_rows >= 10000')
    expect(migration).toContain('FULL OUTER JOIN open_rollup')
    expect(migration).not.toContain('DELETE FROM public.selects_track_engagement;')
    expect(migration).not.toContain('DELETE FROM public.selects_opens;')
  })

  it('persists a Selects AI starter in one service-only transaction', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.persist_selects_ai_draft')
    expect(migration).toContain('FOR UPDATE')
    expect(migration).toContain('jsonb_array_length(p_tracks) > 10')
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION public.persist_selects_ai_draft(UUID, UUID, TEXT, JSONB)'
    )
    expect(migration).toContain(
      'GRANT EXECUTE ON FUNCTION public.persist_selects_ai_draft(UUID, UUID, TEXT, JSONB)'
    )
  })
})
