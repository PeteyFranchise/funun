import { readFileSync } from 'fs'
import path from 'path'

const migration = readFileSync(path.join(process.cwd(), 'supabase/migrations/169_ideas_inbox.sql'), 'utf8')
const sqlOnly = migration.split('\n').filter(line => !line.trim().startsWith('--')).join('\n')

describe('migration 169 — private Ideas Inbox', () => {
  it('keeps ideas and their creative evidence private and service-write-only', () => {
    for (const table of ['ideas', 'idea_members', 'idea_share_links', 'idea_recordings', 'idea_markers', 'idea_comments', 'idea_references']) {
      expect(sqlOnly).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`)
      expect(sqlOnly).toContain(`REVOKE ALL ON public.${table} FROM PUBLIC, anon, authenticated`)
    }
    expect(sqlOnly).not.toMatch(/GRANT (INSERT|UPDATE|DELETE) ON public\.idea/)
  })

  it('uses owner-or-member access and does not expose private link tokens to members', () => {
    expect(sqlOnly).toContain('CREATE OR REPLACE FUNCTION public.idea_access_level')
    expect(sqlOnly).toContain('(SELECT public.idea_access_level(id, auth.uid())) IS NOT NULL')
    expect(sqlOnly).toContain('CREATE POLICY idea_share_links_select')
    expect(sqlOnly).toContain('created_by = auth.uid()')
    expect(sqlOnly).toContain('CREATE OR REPLACE FUNCTION public.claim_idea_share_link')
    expect(sqlOnly).toContain('WHERE token_hash = p_token_hash FOR UPDATE')
  })

  it('promotes recordings and contributors without assigning rights or splits', () => {
    expect(sqlOnly).toContain('CREATE OR REPLACE FUNCTION public.promote_idea_to_work')
    expect(sqlOnly).toContain('FOR UPDATE')
    expect(sqlOnly).toContain("member.permission = 'contribute'")
    expect(sqlOnly).toContain('INSERT INTO public.idea_work_version_links')
    expect(sqlOnly).not.toContain('INSERT INTO public.split_sheet_parties')
    expect(sqlOnly).not.toContain('split_percentage')
    expect(sqlOnly).not.toContain('vault_projects')
  })

  it('records immutable provenance while allowing non-destructive branches', () => {
    expect(sqlOnly).toContain('parent_idea_id')
    expect(sqlOnly).toContain('parent_recording_id')
    expect(sqlOnly).toContain('version_id    UUID NOT NULL UNIQUE')
    expect(sqlOnly).toContain("'Immutable provenance from an Idea recording")
  })
})
