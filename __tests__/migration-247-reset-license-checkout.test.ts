import { readFileSync } from 'fs'
import path from 'path'

const sql = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/247_reset_license_checkout.sql'),
  'utf8'
)

// Executable SQL only: comments may legitimately mention 'paid'.
const executable = sql.replace(/--[^\n]*/g, '')

describe('migration 247 reset license checkout', () => {
  it('is explicitly human-gated and wrapped in one transaction', () => {
    expect(sql).toContain('HUMAN-GATED')
    expect(executable.match(/\bBEGIN;/g)).toHaveLength(1)
    expect(executable.match(/\bCOMMIT;/g)).toHaveLength(1)
  })

  it('hardens the definer and grants execution only to service_role', () => {
    expect(executable.match(/SECURITY DEFINER/g)).toHaveLength(1)
    expect(executable.match(/SET search_path = ''/g)).toHaveLength(1)
    expect(executable).toContain(
      'REVOKE ALL ON FUNCTION public.reset_license_checkout(UUID, TEXT) FROM PUBLIC, anon, authenticated;'
    )
    expect(executable).toContain(
      'GRANT EXECUTE ON FUNCTION public.reset_license_checkout(UUID, TEXT) TO service_role;'
    )
    expect(executable).not.toMatch(/GRANT EXECUTE[\s\S]{0,160}TO (anon|authenticated)\b/)
  })

  it('only resets an in-flight deal whose stored session id matches the argument', () => {
    const where = executable.slice(executable.indexOf('WHERE id = p_deal_id'))
    expect(where).toContain("payment_status IN ('awaiting_payment', 'creating_payment')")
    expect(where).toContain('stripe_checkout_session_id = p_checkout_session_id')
  })

  it('moves the deal to unpaid, clears every checkout field, and never writes paid', () => {
    const set = executable.slice(executable.indexOf('SET payment_status'), executable.indexOf('WHERE id'))
    expect(set).toContain("payment_status = 'unpaid'")
    for (const column of [
      'stripe_checkout_session_id',
      'stripe_checkout_url',
      'stripe_checkout_economics_fingerprint',
      'checkout_claim_token',
      'checkout_claimed_at',
      'checkout_economics_fingerprint',
    ]) {
      expect(set).toContain(`${column} = NULL`)
    }
    expect(set).not.toContain("'paid'")
    expect(set).not.toContain('stripe_payment_intent_id')
    expect(set).not.toContain('paid_at')
  })

  it('rejects null or blank arguments', () => {
    expect(executable).toContain('RAISE EXCEPTION')
    expect(executable).toContain("NULLIF(BTRIM(p_checkout_session_id), '') IS NULL")
  })
})
