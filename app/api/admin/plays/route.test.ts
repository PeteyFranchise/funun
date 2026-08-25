import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff, verifyAdmin } from '@/lib/admin/gate'
import { logStaffAction } from '@/lib/staff/audit'
import { GET, POST } from './route'
import { POST as completeAssignment } from './[id]/assignments/[assignmentId]/complete/route'

// ─── GET/POST /api/admin/plays + .../complete (31.2 plan 06, Task 3) ──────
// Mirrors app/api/admin/health-rules/route.test.ts's fake chainable service
// convention. Covers: any-staff GET, leadership-only publish (403 for
// non-leadership), publish retiring the prior active play (one-active
// invariant, D-31.2-08), a rejected invalid assignment never publishing,
// and a double-complete producing exactly one completion row (D-31.2-11).

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: jest.fn(),
}))

jest.mock('@/lib/admin/gate', () => {
  const actual = jest.requireActual('@/lib/admin/gate')
  return { ...actual, requireStaff: jest.fn(), verifyAdmin: jest.fn() }
})

jest.mock('@/lib/staff/audit', () => ({
  logStaffAction: jest.fn(),
}))

const LEADERSHIP_UUID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const AE_UUID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

function jsonRequest(url: string, body?: unknown, method = 'POST') {
  return new Request(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

type FakeRow = Record<string, unknown>

function mockService(options: { activePlay?: FakeRow | null } = {}) {
  const playsTable: FakeRow[] = options.activePlay ? [{ ...options.activePlay }] : []
  const assignmentsTable: FakeRow[] = []
  const completionsTable: FakeRow[] = []
  let playIdSeq = 1
  let assignmentIdSeq = 1

  const auditInsert = jest.fn(async () => ({ error: null }))

  const from = jest.fn((table: string) => {
    if (table === 'staff_audit_log') return { insert: auditInsert }

    if (table === 'plays') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: playsTable.find(p => p.status === 'active') ?? null,
              error: null,
            }),
          }),
        }),
        update: (patch: FakeRow) => ({
          eq: (_col: string, id: string) => {
            const idx = playsTable.findIndex(p => p.id === id)
            if (idx >= 0) playsTable[idx] = { ...playsTable[idx], ...patch }
            return Promise.resolve({ error: null })
          },
        }),
        insert: (payload: FakeRow) => ({
          select: () => ({
            single: async () => {
              const row: FakeRow = { id: `play-${playIdSeq++}`, created_at: 't', ...payload }
              playsTable.push(row)
              return { data: row, error: null }
            },
          }),
        }),
      }
    }

    if (table === 'play_assignments') {
      return {
        select: () => ({
          eq: (_col: string, playId: string) => ({
            order: async () => ({
              data: assignmentsTable.filter(a => a.play_id === playId),
              error: null,
            }),
          }),
        }),
        insert: (payload: FakeRow[]) => ({
          select: async () => {
            const rows = payload.map(p => ({ id: `assignment-${assignmentIdSeq++}`, created_at: 't', ...p }))
            assignmentsTable.push(...rows)
            return { data: rows, error: null }
          },
        }),
      }
    }

    if (table === 'play_assignment_completions') {
      return {
        upsert: (values: FakeRow) => {
          const existing = completionsTable.find(
            c => c.assignment_id === values.assignment_id && c.ae_user_id === values.ae_user_id
          )
          if (!existing) completionsTable.push({ id: `completion-${completionsTable.length + 1}`, ...values })
          return Promise.resolve({ error: null })
        },
      }
    }

    throw new Error(`Unexpected table: ${table}`)
  })

  return { from, playsTable, assignmentsTable, completionsTable, auditInsert }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(logStaffAction as jest.Mock).mockResolvedValue({ ok: true })
})

describe('GET /api/admin/plays', () => {
  it('returns the active play for any staff caller', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: AE_UUID }, staffRole: 'ae' })
    const service = mockService({
      activePlay: {
        id: 'play-1',
        title: 'Push at-risk',
        note: null,
        status: 'active',
        published_by: LEADERSHIP_UUID,
        published_at: 't',
        created_at: 't',
      },
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data.play.id).toBe('play-1')
  })

  it('returns 403 for a non-staff caller', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ error: 'Forbidden', status: 403 })
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await GET()
    expect(res.status).toBe(403)
  })
})

describe('POST /api/admin/plays (publish)', () => {
  const validBody = {
    title: "This week's push",
    assignments: [{ kind: 'client_targeted', title: 'Chase at-risk', healthBand: 'at_risk' }],
  }

  it('returns 403 for a non-leadership caller and never publishes', async () => {
    ;(verifyAdmin as jest.Mock).mockResolvedValue({ error: 'Forbidden', status: 403 })
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(jsonRequest('http://t.local/api/admin/plays', validBody))
    expect(res.status).toBe(403)
    expect(service.playsTable).toHaveLength(0)
  })

  it('publishing a new play retires the prior active one — exactly one active results (D-31.2-08)', async () => {
    ;(verifyAdmin as jest.Mock).mockResolvedValue({ user: { id: LEADERSHIP_UUID } })
    const service = mockService({
      activePlay: {
        id: 'play-old',
        title: 'Old push',
        note: null,
        status: 'active',
        published_by: LEADERSHIP_UUID,
        published_at: 't',
        created_at: 't',
      },
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(jsonRequest('http://t.local/api/admin/plays', validBody))
    expect(res.status).toBe(201)

    const activeRows = service.playsTable.filter(p => p.status === 'active')
    expect(activeRows).toHaveLength(1)
    expect(activeRows[0].id).not.toBe('play-old')
    expect(service.playsTable.find(p => p.id === 'play-old')?.status).toBe('retired')
    expect(logStaffAction).toHaveBeenCalledWith(
      service,
      expect.objectContaining({ action: 'publish_play', actorId: LEADERSHIP_UUID })
    )
  })

  it('rejects an invalid assignment (client_targeted with no health/stage) with 400 and never publishes', async () => {
    ;(verifyAdmin as jest.Mock).mockResolvedValue({ user: { id: LEADERSHIP_UUID } })
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(
      jsonRequest('http://t.local/api/admin/plays', {
        title: 'Bad play',
        assignments: [{ kind: 'client_targeted', title: 'No target' }],
      })
    )
    expect(res.status).toBe(400)
    expect(service.playsTable).toHaveLength(0)
    expect(logStaffAction).not.toHaveBeenCalled()
  })

  it('rejects a client_targeted assignment carrying directive content with 400 (D-31.2-10)', async () => {
    ;(verifyAdmin as jest.Mock).mockResolvedValue({ user: { id: LEADERSHIP_UUID } })
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(
      jsonRequest('http://t.local/api/admin/plays', {
        title: 'Bad play',
        assignments: [
          { kind: 'client_targeted', title: 'At risk', healthBand: 'at_risk', linkUrl: 'https://example.com' },
        ],
      })
    )
    expect(res.status).toBe(400)
    expect(service.playsTable).toHaveLength(0)
  })
})

describe('POST /api/admin/plays/[id]/assignments/[assignmentId]/complete', () => {
  function paramsFor(assignmentId = 'assignment-1', id = 'play-1') {
    return { params: Promise.resolve({ id, assignmentId }) }
  }

  it('an AE double-clicking complete produces exactly one completion row — every write audits (D-31.2-11)', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: AE_UUID }, staffRole: 'ae' })
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res1 = await completeAssignment(
      jsonRequest('http://t.local/api/admin/plays/play-1/assignments/assignment-1/complete', {}),
      paramsFor()
    )
    const res2 = await completeAssignment(
      jsonRequest('http://t.local/api/admin/plays/play-1/assignments/assignment-1/complete', {}),
      paramsFor()
    )

    expect(res1.status).toBe(200)
    expect(res2.status).toBe(200)
    expect(service.completionsTable).toHaveLength(1)
    expect(logStaffAction).toHaveBeenCalledTimes(2)
  })

  it('returns 403 for a non-staff caller and never writes', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ error: 'Forbidden', status: 403 })
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await completeAssignment(
      jsonRequest('http://t.local/api/admin/plays/play-1/assignments/assignment-1/complete', {}),
      paramsFor()
    )
    expect(res.status).toBe(403)
    expect(service.completionsTable).toHaveLength(0)
  })
})
