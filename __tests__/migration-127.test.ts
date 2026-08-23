import { readFileSync } from 'fs'
import { join } from 'path'

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/127_atomic_checklist_reorder.sql'),
  'utf8'
).replace(/^\s*--.*$/gm, '')

describe('migration 127 — atomic checklist reorder', () => {
  it('validates shape, bounded positions, duplicate keys, and maximum length', () => {
    expect(sql).toMatch(/jsonb_typeof\(p_order\) <> 'array'/i)
    expect(sql).toMatch(/v_length > 200/i)
    expect(sql).toMatch(/sort_order'\)::INT > 199/i)
    expect(sql).toMatch(/count\(DISTINCT entry ->> 'key'\)/i)
    expect(sql).toMatch(/positions must be unique and contiguous from zero/i)
  })

  it('locks the table and requires the full current key set before updating', () => {
    const lock = sql.indexOf('LOCK TABLE public.launchpad_checklist_items')
    const update = sql.indexOf('UPDATE public.launchpad_checklist_items')

    expect(lock).toBeGreaterThan(-1)
    expect(update).toBeGreaterThan(lock)
    expect(sql).toMatch(/v_expected <> v_length OR EXISTS/i)
    expect(sql).toMatch(/order must contain every current checklist item exactly once/i)
  })

  it('uses one set-based update inside the RPC transaction', () => {
    expect(sql.match(/UPDATE public\.launchpad_checklist_items/g)).toHaveLength(1)
    expect(sql).toMatch(/FROM jsonb_to_recordset\(p_order\)/i)
    expect(sql).toMatch(/GET DIAGNOSTICS v_updated = ROW_COUNT/i)
  })

  it('is callable only by the service role', () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION[\s\S]*PUBLIC, anon, authenticated/i)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION[\s\S]*TO service_role/i)
  })
})
