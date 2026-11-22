import { verifyAdmin } from '@/lib/admin/gate'
import { createServiceClient } from '@/lib/supabase/server'
import { isReadWithheld } from '@/lib/deals/buyer-song-unit-read-withholding'
import { GET } from './route'

jest.mock('@/lib/admin/gate', () => ({
  verifyAdmin: jest.fn(),
}))

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: jest.fn(),
}))

jest.mock('@/lib/deals/buyer-song-unit-read-withholding', () => ({
  isReadWithheld: jest.fn(),
}))

const REQUEST_MATCHED = {
  id: '11111111-1111-4111-8111-111111111111',
  buyer_org_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  created_by: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  vault_project_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  usage_types: ['film_tv'],
  territories: ['worldwide'],
  term_months: 12,
  exclusivity: false,
  budget_cents: 100000,
  need_by: null,
  buyer_notes: null,
  stage: 'submitted',
  matched_precleared: true,
  gross_fee_cents: null,
  contract_document_id: null,
  owner_id: null,
  admin_notes: null,
  commission_pct: null,
  artist_net_cents: null,
  created_at: '2026-11-21T12:00:00.000Z',
  updated_at: '2026-11-21T12:00:00.000Z',
}

const REQUEST_UNMATCHED = {
  ...REQUEST_MATCHED,
  id: '22222222-2222-4222-8222-222222222222',
  matched_precleared: false,
}

function mockService() {
  let visibleRequests = [REQUEST_MATCHED, REQUEST_UNMATCHED]

  const requestQuery: {
    eq: jest.Mock
    is: jest.Mock
    order: jest.Mock
  } = {
    eq: jest.fn(),
    is: jest.fn(),
    order: jest.fn(),
  }

  requestQuery.eq.mockImplementation((column: string, value: unknown) => {
    if (column === 'matched_precleared') {
      visibleRequests = visibleRequests.filter(row => row.matched_precleared === value)
    }
    return requestQuery
  })
  requestQuery.is.mockReturnValue(requestQuery)
  requestQuery.order.mockImplementation(async () => ({ data: visibleRequests, error: null }))

  const from = jest.fn((table: string) => {
    if (table === 'license_requests') {
      return { select: jest.fn(() => requestQuery) }
    }
    if (table === 'buyer_orgs') {
      return {
        select: jest.fn(() => ({
          in: jest.fn(async () => ({
            data: [{ id: REQUEST_MATCHED.buyer_org_id, name: 'Buyer Co' }],
          })),
        })),
      }
    }
    if (table === 'vault_projects') {
      return {
        select: jest.fn(() => ({
          in: jest.fn(async () => ({
            data: [{ id: REQUEST_MATCHED.vault_project_id, title: 'Project title', vault_readiness_score: 87 }],
          })),
        })),
      }
    }
    throw new Error(`Unexpected table: ${table}`)
  })

  return {
    auth: {
      admin: {
        getUserById: jest.fn(async () => ({ data: { user: { user_metadata: {} } } })),
      },
    },
    from,
    requestQuery,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(verifyAdmin as jest.Mock).mockResolvedValue({ user: { id: 'admin-id' } })
})

describe('GET /api/admin/deals read containment', () => {
  it('ignores the project-derived match filter and omits match and readiness conclusions while withheld', async () => {
    ;(isReadWithheld as jest.Mock).mockImplementation(
      (surface: string) => surface === 'matched_precleared' || surface === 'project_readiness_figure'
    )
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const response = await GET(new Request('http://t.local/api/admin/deals?matched=true'))
    const body = (await response.json()) as {
      data: Array<{ request: Record<string, unknown>; projectReadinessScore: number | null }>
    }

    expect(response.status).toBe(200)
    expect(body.data).toHaveLength(2)
    expect(service.requestQuery.eq).not.toHaveBeenCalledWith('matched_precleared', expect.anything())
    expect(body.data.every(row => !Object.hasOwn(row.request, 'matched_precleared'))).toBe(true)
    expect(body.data.every(row => row.projectReadinessScore === null)).toBe(true)
    expect(JSON.stringify(body)).not.toContain('Pre-cleared match')
  })

  it('preserves the existing filter and response fields when both read flags are open', async () => {
    ;(isReadWithheld as jest.Mock).mockReturnValue(false)
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const response = await GET(new Request('http://t.local/api/admin/deals?matched=true'))
    const body = (await response.json()) as {
      data: Array<{
        request: { matched_precleared: boolean }
        projectReadinessScore: number | null
      }>
    }

    expect(response.status).toBe(200)
    expect(service.requestQuery.eq).toHaveBeenCalledWith('matched_precleared', true)
    expect(body.data).toHaveLength(1)
    expect(body.data[0].request.matched_precleared).toBe(true)
    expect(body.data[0].projectReadinessScore).toBe(87)
  })
})
