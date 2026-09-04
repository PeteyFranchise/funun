import { readFileSync } from 'fs'
import path from 'path'

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/176_writer_room_personal_layouts.sql'),
  'utf8'
)

describe('migration 176 — private Writer’s Room layouts', () => {
  it('stores one layout per user and work with cascading cleanup', () => {
    expect(migration).toContain('CREATE TABLE public.work_room_layouts')
    expect(migration).toContain('PRIMARY KEY (work_id, user_id)')
    expect(migration).toContain('REFERENCES public.works(id) ON DELETE CASCADE')
    expect(migration).toContain('REFERENCES auth.users(id) ON DELETE CASCADE')
    expect(migration).toContain("CHECK (jsonb_typeof(layout) = 'object')")
  })

  it('requires both row ownership and current access to the work', () => {
    expect(migration).toContain('ALTER TABLE public.work_room_layouts ENABLE ROW LEVEL SECURITY')
    expect(migration).toContain('user_id = (SELECT auth.uid())')
    expect(migration).toContain('(SELECT public.is_work_owner(work_id, auth.uid()))')
    expect(migration).toContain('(SELECT public.work_member_tier(work_id, auth.uid())) IS NOT NULL')
    expect(migration).toContain('WITH CHECK')
  })

  it('keeps anonymous access revoked and grants only authenticated CRUD', () => {
    expect(migration).toContain('REVOKE ALL ON public.work_room_layouts FROM PUBLIC, anon')
    expect(migration).toContain(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_room_layouts TO authenticated'
    )
  })

  it('does not add a Diary trigger for personal presentation changes', () => {
    expect(migration).not.toMatch(/CREATE\s+TRIGGER/i)
    expect(migration).not.toContain('work_diary_events')
  })
})
