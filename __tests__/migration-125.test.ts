import { readFileSync } from 'fs'
import { join } from 'path'

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/125_rate_limit_retention.sql'),
  'utf8'
).replace(/^\s*--.*$/gm, '')

describe('migration 125 — rate-limit retention', () => {
  it('stores and indexes an explicit expiry for every hit', () => {
    expect(sql).toMatch(/ADD COLUMN expires_at TIMESTAMPTZ/i)
    expect(sql).toMatch(/ALTER COLUMN expires_at SET NOT NULL/i)
    expect(sql).toMatch(/CREATE INDEX idx_rate_limit_hits_expiry/i)
    expect(sql).toMatch(/NOW\(\) \+ make_interval\(secs => p_window_seconds\)/i)
  })

  it('validates key, window, and maximum before locking or writing', () => {
    expect(sql).toMatch(/char_length\(v_key\) > 256/i)
    expect(sql).toMatch(/p_window_seconds < 1 OR p_window_seconds > 86400/i)
    expect(sql).toMatch(/p_max < 1 OR p_max > 10000/i)
    expect(sql.indexOf('char_length(v_key)')).toBeLessThan(sql.indexOf('pg_advisory_xact_lock'))
  })

  it('provides a bounded global cleanup RPC', () => {
    expect(sql).toMatch(/FUNCTION public\.cleanup_rate_limit_hits/i)
    expect(sql).toMatch(/WHERE expires_at <= NOW\(\)[\s\S]*LIMIT p_batch_size/i)
    expect(sql).toMatch(/GET DIAGNOSTICS v_deleted = ROW_COUNT/i)
  })

  it('keeps both RPCs service-role-only', () => {
    expect(sql.match(/REVOKE ALL ON FUNCTION/g)).toHaveLength(2)
    expect(sql.match(/GRANT EXECUTE ON FUNCTION/g)).toHaveLength(2)
  })
})
