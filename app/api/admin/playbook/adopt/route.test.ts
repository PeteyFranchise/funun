import { createServiceClient } from '@/lib/supabase/server'
import { requireRoomAccess } from '@/lib/playbook/rooms'
import { createEntry, editEntry, isRoomLead } from '@/lib/playbook/entries'
import { logStaffAction } from '@/lib/staff/audit'
import { playbookSourceHash } from '@/lib/playbook/adoption'
import { readPublicationSource } from '@/lib/playbook/publication-source'
import { POST } from './route'

jest.mock('@/lib/supabase/server', () => ({ createServiceClient: jest.fn() }))
jest.mock('@/lib/playbook/rooms', () => ({ requireRoomAccess: jest.fn() }))
jest.mock('@/lib/playbook/entries', () => ({
  createEntry: jest.fn(),
  editEntry: jest.fn(),
  isRoomLead: jest.fn(),
}))
jest.mock('@/lib/staff/audit', () => ({ logStaffAction: jest.fn() }))
jest.mock('@/lib/playbook/publication-source', () => ({ readPublicationSource: jest.fn() }))

const ROOM_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

function request(overrides: Record<string, unknown> = {}) {
  return new Request('http://t.local/api/admin/playbook/adopt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'adopt',
      roomKey: 'leadership',
      title: 'Operating Doctrine',
      sourcePath: '.planning/deliberations/organizational-doctrine/operating.md',
      markdown: '# Operating Doctrine\n\nBe clear.',
      ...overrides,
    }),
  })
}

function service(existing: Record<string, unknown> | null = null) {
  return {
    from: jest.fn((table: string) => {
      const data = table === 'playbook_rooms' ? { id: ROOM_ID } : existing
      return {
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            eq: jest.fn(() => ({ maybeSingle: jest.fn(async () => ({ data, error: null })) })),
            maybeSingle: jest.fn(async () => ({ data, error: null })),
          })),
        })),
      }
    }),
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(createServiceClient as jest.Mock).mockReturnValue(service())
  ;(requireRoomAccess as jest.Mock).mockResolvedValue({ user: { id: USER_ID }, staffRole: 'leadership' })
  ;(isRoomLead as jest.Mock).mockResolvedValue(false)
  ;(createEntry as jest.Mock).mockResolvedValue({ data: { id: 'entry-1', status: 'draft_pending' } })
  ;(logStaffAction as jest.Mock).mockResolvedValue({ ok: true })
  ;(readPublicationSource as jest.Mock).mockResolvedValue({ markdown: '# Approved\n\nCanonical.' })
})

describe('POST /api/admin/playbook/adopt', () => {
  it('rejects unsafe paths before checking room access', async () => {
    const response = await POST(request({ sourcePath: '../../secrets.md' }))

    expect(response.status).toBe(400)
    expect(requireRoomAccess).not.toHaveBeenCalled()
  })

  it('requires room-lead or leadership adoption authority', async () => {
    ;(requireRoomAccess as jest.Mock).mockResolvedValue({ user: { id: USER_ID }, staffRole: 'ae' })
    ;(isRoomLead as jest.Mock).mockResolvedValue(false)

    const response = await POST(request())

    expect(response.status).toBe(403)
    expect(createEntry).not.toHaveBeenCalled()
  })

  it('calculates the source hash server-side and always creates an unpublished draft', async () => {
    const markdown = '# Trusted only after review'
    const response = await POST(request({ markdown }))

    expect(response.status).toBe(200)
    expect(createEntry).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        isApprover: true,
        publishRequested: false,
        source: expect.objectContaining({ hash: playbookSourceHash(markdown) }),
      })
    )
    expect(editEntry).not.toHaveBeenCalled()
  })

  it('rejects a guided payload that differs from the canonical manifest source', async () => {
    const response = await POST(request({
      manifestKey: 'leadership-doctrine',
      title: 'Leadership Doctrine',
      sourcePath: '.planning/deliberations/organizational-doctrine/functional-team-doctrines.md#11-leadership-doctrine',
      markdown: 'Browser-modified content',
    }))

    expect(response.status).toBe(409)
    expect(readPublicationSource).toHaveBeenCalledTimes(1)
    expect(createEntry).not.toHaveBeenCalled()
  })
})
