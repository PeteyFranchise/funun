import type { SupabaseClient } from '@supabase/supabase-js'
import {
  setPrimaryContact,
  pickContactFields,
  canAccessOrgContacts,
  type BuyerOrgContact,
} from './contacts'

// ─── Minimal in-memory fake service client ─────────────────────────────────
// Purpose-built to the exact chain shapes contacts.ts issues against
// `buyer_org_contacts` (select/insert/update/delete + eq/neq/order +
// select().maybeSingle()/single()) — not a general PostgREST emulator.
// Mirrors lib/staff/createStaffAccount.test.ts's buildService() convention
// of a hand-rolled fake over a full mock library.
type FakeRow = Record<string, unknown>

function buildFakeContactsService(initialRows: FakeRow[]) {
  let rows = [...initialRows]

  type Filter = { op: 'eq' | 'neq'; col: string; val: unknown }

  function matches(row: FakeRow, filters: Filter[]): boolean {
    return filters.every(f => (f.op === 'eq' ? row[f.col] === f.val : row[f.col] !== f.val))
  }

  function makeBuilder(mode: 'select' | 'insert' | 'update' | 'delete', payload?: FakeRow) {
    const filters: Filter[] = []

    function execute(): FakeRow[] {
      if (mode === 'select') return rows.filter(r => matches(r, filters))
      if (mode === 'update') {
        rows = rows.map(r => (matches(r, filters) ? { ...r, ...payload } : r))
        return rows.filter(r => matches(r, filters))
      }
      if (mode === 'insert') {
        const newRow = { id: `contact-${rows.length + 1}`, ...payload }
        rows.push(newRow)
        return [newRow]
      }
      if (mode === 'delete') {
        const toDelete = rows.filter(r => matches(r, filters))
        rows = rows.filter(r => !matches(r, filters))
        return toDelete
      }
      return []
    }

    const builder = {
      eq(col: string, val: unknown) {
        filters.push({ op: 'eq', col, val })
        return builder
      },
      neq(col: string, val: unknown) {
        filters.push({ op: 'neq', col, val })
        return builder
      },
      order() {
        return builder
      },
      select() {
        return builder
      },
      async maybeSingle() {
        const result = execute()
        return { data: result[0] ?? null, error: null }
      },
      async single() {
        const result = execute()
        return result[0]
          ? { data: result[0], error: null }
          : { data: null, error: { message: 'not found' } }
      },
      then(resolve: (v: { data: FakeRow[]; error: null }) => void) {
        resolve({ data: execute(), error: null })
      },
    }
    return builder
  }

  const service = {
    from: (_table: string) => ({
      select: () => makeBuilder('select'),
      insert: (payload: FakeRow) => makeBuilder('insert', payload),
      update: (payload: FakeRow) => makeBuilder('update', payload),
      delete: () => makeBuilder('delete'),
    }),
    getRows: () => rows,
  }

  return service as unknown as SupabaseClient & { getRows: () => FakeRow[] }
}

describe('lib/client-partners/contacts', () => {
  describe('setPrimaryContact (D-08 one-primary invariant)', () => {
    it('leaves exactly one primary contact for the org after switching', async () => {
      const service = buildFakeContactsService([
        { id: 'c1', buyer_org_id: 'org-1', name: 'Alice', is_primary: true },
        { id: 'c2', buyer_org_id: 'org-1', name: 'Bob', is_primary: false },
        { id: 'c3', buyer_org_id: 'org-1', name: 'Carol', is_primary: false },
        // Different org — must be unaffected by a primary switch on org-1.
        { id: 'c4', buyer_org_id: 'org-2', name: 'Dave', is_primary: true },
      ])

      const updated = (await setPrimaryContact(service, 'org-1', 'c2')) as BuyerOrgContact
      expect(updated.id).toBe('c2')
      expect(updated.is_primary).toBe(true)

      const org1Rows = service.getRows().filter(r => r.buyer_org_id === 'org-1')
      const primaryRows = org1Rows.filter(r => r.is_primary === true)
      expect(primaryRows).toHaveLength(1)
      expect(primaryRows[0]?.id).toBe('c2')

      // Untouched org's primary is unaffected.
      const org2Primary = service.getRows().find(r => r.id === 'c4')
      expect(org2Primary?.is_primary).toBe(true)
    })

    it('throws when the target contact does not belong to the org', async () => {
      const service = buildFakeContactsService([
        { id: 'c1', buyer_org_id: 'org-1', name: 'Alice', is_primary: true },
      ])

      await expect(setPrimaryContact(service, 'org-1', 'nonexistent')).rejects.toThrow(
        'Contact not found.'
      )
    })
  })

  describe('pickContactFields (mass-assignment allowlist, T-31-15)', () => {
    it('keeps every CONTACT_EDITABLE_FIELDS key present on the input', () => {
      const picked = pickContactFields({
        name: 'Alice',
        title: 'A&R',
        tags: ['vip'],
      })
      expect(picked).toEqual({ name: 'Alice', title: 'A&R', tags: ['vip'] })
    })

    it('rejects an unlisted field — is_primary and arbitrary keys never cross the allowlist', () => {
      const picked = pickContactFields({
        name: 'Alice',
        is_primary: true,
        buyer_org_id: 'org-hijack',
        id: 'contact-hijack',
        evil_field: 'nope',
      })
      expect(picked).toEqual({ name: 'Alice' })
      expect(picked).not.toHaveProperty('is_primary')
      expect(picked).not.toHaveProperty('buyer_org_id')
      expect(picked).not.toHaveProperty('id')
      expect(picked).not.toHaveProperty('evil_field')
    })
  })

  describe('canAccessOrgContacts (R5 own-book scope)', () => {
    it('leadership can access any org regardless of assignment', () => {
      expect(canAccessOrgContacts('leadership', { ae_user_id: 'someone-else' }, 'me')).toBe(true)
      expect(canAccessOrgContacts('leadership', null, 'me')).toBe(true)
    })

    it('a non-leadership AE assigned to the org is allowed', () => {
      expect(canAccessOrgContacts('ae', { ae_user_id: 'me' }, 'me')).toBe(true)
    })

    it('a non-leadership AE on an uncovered org is rejected (404-shaped)', () => {
      expect(canAccessOrgContacts('ae', { ae_user_id: 'someone-else' }, 'me')).toBe(false)
      expect(canAccessOrgContacts('bd', { ae_user_id: null }, 'me')).toBe(false)
      expect(canAccessOrgContacts('ae', null, 'me')).toBe(false)
    })
  })
})
