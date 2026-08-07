import { readFileSync } from 'fs'
import path from 'path'

const migration095 = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/095_buyer_org_lead_fields.sql'),
  'utf8'
)

describe('095', () => {
  it('adds status with the pending_onboarding/active CHECK and default', () => {
    expect(migration095).toMatch(
      /status text NOT NULL DEFAULT 'pending_onboarding'\s*\n?\s*CHECK \(status IN \('pending_onboarding', 'active'\)\)/
    )
  })

  it('adds each qualifying column', () => {
    expect(migration095).toContain('ADD COLUMN use_case text')
    expect(migration095).toContain('ADD COLUMN contact_name text')
    expect(migration095).toContain('ADD COLUMN contact_email text')
    expect(migration095).toContain('ADD COLUMN contact_phone text')
    expect(migration095).toContain('ADD COLUMN contact_role text')
    expect(migration095).toMatch(
      /ADD COLUMN source text NOT NULL DEFAULT 'register'\s*\n?\s*CHECK \(source IN \('register', 'sales_rep'\)\)/
    )
  })

  it('grants status and use_case to authenticated', () => {
    expect(migration095).toContain(
      'GRANT SELECT (status, use_case) ON public.buyer_orgs TO authenticated;'
    )
  })

  it('does NOT grant any contact_* column to authenticated (staff-only privacy)', () => {
    const grantStart = migration095.indexOf('GRANT SELECT (status, use_case)')
    expect(grantStart).toBeGreaterThan(-1)
    const grantLine = migration095.slice(grantStart, migration095.indexOf(';', grantStart) + 1)
    expect(grantLine).not.toContain('contact_name')
    expect(grantLine).not.toContain('contact_email')
    expect(grantLine).not.toContain('contact_phone')
    expect(grantLine).not.toContain('contact_role')
    expect(grantLine).not.toContain('source')

    const grantSelectLines = migration095
      .split('\n')
      .filter((line) => line.trim().startsWith('GRANT SELECT'))
    for (const line of grantSelectLines) {
      expect(line).not.toContain('contact_phone')
    }
  })

  it('is human-gated — carries a comment noting it must be pushed by the owner, never by an agent', () => {
    expect(migration095).toMatch(/human-gated/i)
    expect(migration095).toMatch(/supabase db push/i)
  })

  it('ends with a schema-cache reload notify', () => {
    expect(migration095.trim().endsWith("NOTIFY pgrst, 'reload schema';")).toBe(true)
  })
})
