import { readFileSync } from 'fs'
import path from 'path'

const read = (name: string) =>
  readFileSync(path.join(process.cwd(), 'supabase/migrations', name), 'utf8')

const ddlOnly = (sql: string) =>
  sql
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n')

describe('migration 092 — buyer-table TRUNCATE/TRIGGER/REFERENCES revoke (review #4)', () => {
  const m = read('092_buyer_tables_revoke_destructive_grants.sql')
  const ddl = ddlOnly(m)

  it('surgically revokes TRUNCATE, TRIGGER, REFERENCES on both buyer tables from PUBLIC/anon/authenticated', () => {
    expect(ddl).toMatch(/REVOKE TRUNCATE, TRIGGER, REFERENCES ON public\.buyer_orgs\s+FROM PUBLIC, anon, authenticated/)
    expect(ddl).toMatch(/REVOKE TRUNCATE, TRIGGER, REFERENCES ON public\.buyer_members\s+FROM PUBLIC, anon, authenticated/)
  })

  it('is surgical — does NOT REVOKE ALL or touch SELECT/DML/column grants, and leaves service_role alone', () => {
    expect(ddl).not.toMatch(/REVOKE ALL/i)
    expect(ddl).not.toMatch(/REVOKE SELECT/i)
    expect(ddl).not.toMatch(/GRANT/i)
    ddl.split('\n').filter((l) => /REVOKE/i.test(l)).forEach((l) => expect(l).not.toMatch(/service_role/))
  })

  it('is human-gated and does not edit migration 080', () => {
    expect(m).toMatch(/human-gated/i)
    expect(m).toMatch(/supabase db push/i)
    expect(m).toMatch(/Do NOT edit migration 080/i)
  })
})

describe('migration 093 — Green Room author column allowlist (review #2)', () => {
  const m = read('093_green_room_author_column_allowlist.sql')
  const ddl = ddlOnly(m)

  it('revokes the broad table-wide UPDATE from anon/authenticated', () => {
    expect(ddl).toMatch(/REVOKE UPDATE ON public\.green_room_posts FROM anon, authenticated/)
  })

  it('re-grants UPDATE only on author-editable columns — NOT the moderation/system columns', () => {
    const grantStart = ddl.indexOf('GRANT UPDATE')
    expect(grantStart).toBeGreaterThan(-1)
    const grant = ddl.slice(grantStart)
    // author-editable columns present
    for (const col of ['body', 'visibility', 'status', 'post_type', 'allow_resharing']) {
      expect(grant).toContain(col)
    }
    // moderation / immutable columns must NOT be grantable to authors
    for (const col of ['moderation_status', 'report_count', 'deleted_at', 'author_id', 'created_at']) {
      expect(grant).not.toContain(col)
    }
    expect(grant).toMatch(/\)\s*ON public\.green_room_posts TO authenticated/)
  })

  it('touches only UPDATE grants (not INSERT/SELECT/DELETE) and is human-gated', () => {
    expect(ddl).not.toMatch(/REVOKE (INSERT|SELECT|DELETE)/i)
    expect(m).toMatch(/human-gated/i)
    expect(m).toMatch(/supabase db push/i)
  })
})

describe('migration 094 — funun_staff UNIQUE(user_id) + dedup (review #10)', () => {
  const m = read('094_funun_staff_user_id_unique.sql')
  const ddl = ddlOnly(m)

  it('deduplicates existing rows keeping MIN(ctid) per user_id before constraining', () => {
    expect(ddl).toMatch(/DELETE FROM public\.funun_staff/)
    expect(ddl).toMatch(/MIN\(ctid\)[\s\S]*GROUP BY user_id/)
    // the DELETE must precede the constraint
    expect(ddl.indexOf('DELETE FROM public.funun_staff')).toBeLessThan(ddl.indexOf('ADD CONSTRAINT'))
  })

  it('adds a UNIQUE constraint on user_id', () => {
    expect(ddl).toMatch(/ALTER TABLE public\.funun_staff[\s\S]*ADD CONSTRAINT funun_staff_user_id_key UNIQUE \(user_id\)/)
  })

  it('is human-gated and does not edit migration 089', () => {
    expect(m).toMatch(/human-gated/i)
    expect(m).toMatch(/supabase db push/i)
    expect(m).toMatch(/Do NOT edit migration 089/i)
  })
})
