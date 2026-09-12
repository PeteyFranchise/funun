import { readFileSync } from 'fs'
import path from 'path'

const sql = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/215_atomic_checkout_creation.sql'),
  'utf8'
)

describe('migration 215 atomic checkout creation', () => {
  it('is explicitly human-gated and introduces a leased claim state', () => {
    expect(sql).toContain('HUMAN-GATED')
    expect(sql).toContain("'creating_payment'")
    expect(sql).toContain('checkout_claim_token UUID')
    expect(sql).toContain('checkout_claimed_at TIMESTAMPTZ')
    expect(sql).toContain('checkout_economics_fingerprint TEXT')
  })

  it('serializes checkout claims without taking an FK-hostile lock', () => {
    const block = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.claim_license_checkout'),
      sql.indexOf('CREATE OR REPLACE FUNCTION public.finalize_license_checkout')
    )
    expect(block).toContain('FOR NO KEY UPDATE')
    expect(block).toContain("RETURN QUERY SELECT 'busy'")
    expect(block).toContain("RETURN QUERY SELECT 'existing'")
    expect(block).toContain('make_interval(secs => p_lease_seconds)')
  })

  it('reconciles webhook facts against stored economics and payout destination', () => {
    const block = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.complete_license_checkout'))
    expect(block).toContain('p_amount_cents IS DISTINCT FROM v_deal.gross_fee_cents')
    expect(block).toContain("LOWER(p_currency) IS DISTINCT FROM 'usd'")
    expect(block).toContain('p_application_fee_cents IS DISTINCT FROM v_expected_fee')
    expect(block).toContain('p_transfer_destination IS DISTINCT FROM v_expected_destination')
    expect(block).toContain('p_economics_fingerprint IS DISTINCT FROM COALESCE')
  })

  it('hardens every definer and grants execution only to service_role', () => {
    expect(sql.match(/SECURITY DEFINER/g)).toHaveLength(4)
    expect(sql.match(/SET search_path = ''/g)).toHaveLength(4)
    expect(sql.match(/FROM PUBLIC, anon, authenticated;/g)).toHaveLength(4)
    expect(sql.match(/TO service_role;/g)).toHaveLength(4)
    expect(sql).not.toMatch(/GRANT EXECUTE[\s\S]{0,160}TO (anon|authenticated)\b/)
  })
})
