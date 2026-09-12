import { GET } from '@/app/api/admin/auth-health/route'
import { requireRoomAccess } from '@/lib/playbook/rooms'
import { loadAuthHealth } from '@/lib/auth/health'

jest.mock('@/lib/playbook/rooms', () => ({ requireRoomAccess: jest.fn() }))
jest.mock('@/lib/auth/health', () => ({ loadAuthHealth: jest.fn() }))
jest.mock('@/lib/supabase/server', () => ({ createServiceClient: jest.fn(() => ({})) }))

const mockAccess = requireRoomAccess as jest.MockedFunction<typeof requireRoomAccess>
const mockLoad = loadAuthHealth as jest.MockedFunction<typeof loadAuthHealth>

describe('GET /api/admin/auth-health', () => {
  beforeEach(() => jest.clearAllMocks())

  it('refuses unauthorized callers before reading diagnostics', async () => {
    mockAccess.mockResolvedValue({ error: 'Forbidden', status: 403 })
    const response = await GET()
    expect(response.status).toBe(403)
    expect(mockLoad).not.toHaveBeenCalled()
  })

  it('returns only the sanitized health payload for IT-room staff', async () => {
    mockAccess.mockResolvedValue({ user: { id: 'staff' } as never, staffRole: 'it' })
    mockLoad.mockResolvedValue({ activated: true, events: [] })
    const response = await GET()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: { activated: true, events: [] } })
  })
})
