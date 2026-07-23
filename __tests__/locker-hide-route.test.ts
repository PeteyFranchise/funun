// POST /api/contracts/documents/[id]/hide — per-party soft-hide (18-02).
// Mocked-Supabase route style matching __tests__/antenna-apply-atomic.test.ts
// and __tests__/approve-token-identity-action.test.ts. Asserts, per the
// plan's threat register (T-18-08/T-18-09): no delete is ever issued, the
// update is scoped by the caller's user_id, and pre-existing document_data
// keys (esign evidence, split_sheet_id) survive the write untouched.

import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { POST } from '@/app/api/contracts/documents/[id]/hide/route'

jest.mock('@/lib/supabase/server', () => ({
  createApiClient: jest.fn(),
  createServiceClient: jest.fn(),
}))

const USER_ID = 'user-1'
const DOC_ID = 'doc-1'

function jsonRequest(body: unknown = {}) {
  return new Request(`http://test.local/api/contracts/documents/${DOC_ID}/hide`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function ctx() {
  return { params: Promise.resolve({ id: DOC_ID }) }
}

function mockAuthedApi(userId: string | null = USER_ID) {
  ;(createApiClient as jest.Mock).mockResolvedValue({
    auth: { getUser: jest.fn(async () => ({ data: { user: userId ? { id: userId } : null } })) },
    from: jest.fn(),
  })
}

type Recorded = {
  deletes: { table: string }[]
  updates: { table: string; values: Record<string, unknown>; matchers: [string, string][] }[]
}

// A single shared apiClient mock used for BOTH the ownership read and (if
// misused) any delete — so a delete call anywhere in the route surfaces.
function mockApiClientRead(docRow: Record<string, unknown> | null, recorded: Recorded) {
  ;(createApiClient as jest.Mock).mockResolvedValue({
    auth: { getUser: jest.fn(async () => ({ data: { user: { id: USER_ID } } })) },
    from: jest.fn((table: string) => {
      const q: Record<string, unknown> = {}
      q.select = jest.fn(() => q)
      q.eq = jest.fn(() => q)
      q.maybeSingle = jest.fn(() => Promise.resolve({ data: docRow, error: null }))
      q.delete = jest.fn(() => {
        recorded.deletes.push({ table })
        return q
      })
      return q
    }),
  })
}

function mockServiceClient(recorded: Recorded) {
  ;(createServiceClient as jest.Mock).mockReturnValue({
    from: jest.fn((table: string) => {
      const q: Record<string, unknown> = {}
      q.delete = jest.fn(() => {
        recorded.deletes.push({ table })
        return q
      })
      q.update = jest.fn((values: Record<string, unknown>) => {
        const matchers: [string, string][] = []
        const chain: Record<string, unknown> = {}
        chain.eq = jest.fn((col: string, val: string) => {
          matchers.push([col, val])
          return chain
        })
        chain.then = (resolve: (v: unknown) => void) => {
          recorded.updates.push({ table, values, matchers: [...matchers] })
          resolve({ data: null, error: null })
        }
        return chain
      })
      return q
    }),
  })
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('POST /api/contracts/documents/[id]/hide', () => {
  it('401s without a session', async () => {
    mockAuthedApi(null)
    const res = await POST(jsonRequest(), ctx())
    expect(res.status).toBe(401)
  })

  it('404s when no vault_documents row with this id and user_id exists', async () => {
    const recorded: Recorded = { deletes: [], updates: [] }
    mockApiClientRead(null, recorded)
    mockServiceClient(recorded)

    const res = await POST(jsonRequest(), ctx())
    expect(res.status).toBe(404)
  })

  it('sets a hidden marker via UPDATE, scoped by the caller user_id, with no delete on any path', async () => {
    const recorded: Recorded = { deletes: [], updates: [] }
    mockApiClientRead(
      { id: DOC_ID, document_data: { split_sheet_id: 'sheet-1', esign: { completedAt: '2026-07-20T00:00:00.000Z' } } },
      recorded
    )
    mockServiceClient(recorded)

    const res = await POST(jsonRequest({ hidden: true }), ctx())
    expect(res.status).toBe(200)

    expect(recorded.deletes).toHaveLength(0)

    const update = recorded.updates.find(u => u.table === 'vault_documents')
    expect(update).toBeDefined()
    expect(update!.matchers).toContainEqual(['user_id', USER_ID])
    // Pre-existing keys survive the merge — the evidence guard's inputs are
    // never dropped by this write.
    expect(update!.values.document_data).toMatchObject({
      split_sheet_id: 'sheet-1',
      esign: { completedAt: '2026-07-20T00:00:00.000Z' },
      hidden: true,
    })
  })

  it('clears the marker on an unhide request (hidden: false)', async () => {
    const recorded: Recorded = { deletes: [], updates: [] }
    mockApiClientRead({ id: DOC_ID, document_data: { hidden: true, split_sheet_id: 'sheet-1' } }, recorded)
    mockServiceClient(recorded)

    const res = await POST(jsonRequest({ hidden: false }), ctx())
    expect(res.status).toBe(200)

    const update = recorded.updates.find(u => u.table === 'vault_documents')
    expect(update!.values.document_data).toMatchObject({ split_sheet_id: 'sheet-1', hidden: false })
    expect(recorded.deletes).toHaveLength(0)
  })

  it('handles a null document_data on the existing row without dropping the write', async () => {
    const recorded: Recorded = { deletes: [], updates: [] }
    mockApiClientRead({ id: DOC_ID, document_data: null }, recorded)
    mockServiceClient(recorded)

    const res = await POST(jsonRequest({ hidden: true }), ctx())
    expect(res.status).toBe(200)
    const update = recorded.updates.find(u => u.table === 'vault_documents')
    expect(update!.values.document_data).toMatchObject({ hidden: true })
  })
})
