import { POST } from '@/app/api/auth/diagnostics/route'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { recordAuthDiagnosticEvent } from '@/lib/auth/diagnostic-store'

jest.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: jest.fn() }))
jest.mock('@/lib/auth/diagnostic-store', () => ({ recordAuthDiagnosticEvent: jest.fn() }))
jest.mock('@/lib/supabase/server', () => ({ createServiceClient: jest.fn(() => ({})) }))

const mockLimit = checkRateLimit as jest.MockedFunction<typeof checkRateLimit>
const mockRecord = recordAuthDiagnosticEvent as jest.MockedFunction<typeof recordAuthDiagnosticEvent>
const payload = {
  correlationId: 'AUTH-A1B2C3D4E5F6',
  eventCode: 'sign_in_failed',
  surface: 'signin',
  workspaceIntent: 'personal',
  runtime: 'browser',
}

function request(body: unknown, contentType = 'application/json') {
  const text = JSON.stringify(body)
  return new Request('https://funun.studio/api/auth/diagnostics', {
    method: 'POST',
    headers: { 'Content-Type': contentType, 'Content-Length': String(text.length) },
    body: text,
  })
}

describe('POST /api/auth/diagnostics', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockLimit.mockResolvedValue(false)
    mockRecord.mockResolvedValue(true)
  })

  it('accepts a sanitized browser event without making auth depend on storage', async () => {
    const response = await POST(request(payload))
    expect(response.status).toBe(202)
    expect(mockRecord).toHaveBeenCalledWith({}, payload)
  })

  it('rejects non-JSON and extra identifying fields', async () => {
    expect((await POST(request(payload, 'text/plain'))).status).toBe(415)
    expect((await POST(request({ ...payload, email: 'person@example.com' }))).status).toBe(400)
    expect(mockRecord).not.toHaveBeenCalled()
  })

  it('silently drops an event when the privacy-safe global budget is exhausted', async () => {
    mockLimit.mockResolvedValue(true)
    expect((await POST(request(payload))).status).toBe(202)
    expect(mockRecord).not.toHaveBeenCalled()
  })

  it('rejects declared oversized payloads before parsing', async () => {
    const oversized = request(payload)
    oversized.headers.set('Content-Length', '1025')
    expect((await POST(oversized)).status).toBe(413)
    expect(mockLimit).not.toHaveBeenCalled()
  })
})
