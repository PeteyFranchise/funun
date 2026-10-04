import { readFileSync } from 'fs'
import path from 'path'

const migration229 = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/229_team_tier_leads.sql'),
  'utf8'
)

describe('229', () => {
  it('creates the team_tier_leads table', () => {
    expect(migration229).toContain('CREATE TABLE IF NOT EXISTS public.team_tier_leads')
  })

  it('constrains seat_answer to the four routing values', () => {
    expect(migration229).toContain(
      "CHECK (seat_answer IN ('me_or_a_few', 'small_team', 'more_than_ten', 'not_sure'))"
    )
  })

  it('constrains catalogue_answer to the four draft bands', () => {
    expect(migration229).toContain(
      "CHECK (catalogue_answer IN ('under_25', 'from_25_to_200', 'from_200_to_1000', 'over_1000'))"
    )
  })

  it('caps pain_points at two and allowlists every element', () => {
    expect(migration229).toContain('CONSTRAINT team_tier_leads_pain_points_max_two')
    expect(migration229).toContain(
      'CHECK (array_length(pain_points, 1) IS NULL OR array_length(pain_points, 1) <= 2)'
    )
    expect(migration229).toContain('CONSTRAINT team_tier_leads_pain_points_allowlist')
    expect(migration229).toMatch(/pain_points <@ ARRAY\[[\s\S]*?'something_else'[\s\S]*?\]::text\[\]/)
  })

  it('constrains routing_outcome to bd/self_serve', () => {
    expect(migration229).toContain("CHECK (routing_outcome IN ('bd', 'self_serve'))")
  })

  it('requires contact_name and contact_email whenever routing_outcome is bd', () => {
    expect(migration229).toContain('CONSTRAINT team_tier_leads_bd_requires_contact')
    expect(migration229).toContain(
      "CHECK (routing_outcome <> 'bd' OR (contact_name IS NOT NULL AND contact_email IS NOT NULL))"
    )
  })

  it('is service-role-only: zero CREATE POLICY statements and a full REVOKE ALL', () => {
    expect(migration229).not.toMatch(/CREATE POLICY/i)
    expect(migration229).toContain(
      'REVOKE ALL ON public.team_tier_leads FROM PUBLIC, anon, authenticated;'
    )
    expect(migration229).toContain('ALTER TABLE public.team_tier_leads ENABLE ROW LEVEL SECURITY;')
  })

  it('is human-gated — carries a comment noting it must be pushed by the owner, never by an agent', () => {
    expect(migration229).toMatch(/HUMAN-GATED/)
    expect(migration229).toMatch(/supabase db push/)
  })

  it('ends with a schema-cache reload notify', () => {
    expect(migration229.trim().endsWith("NOTIFY pgrst, 'reload schema';")).toBe(true)
  })
})
