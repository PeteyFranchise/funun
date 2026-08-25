import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/admin/gate'
import { logStaffAction } from '@/lib/staff/audit'
import { POST } from './route'

// ─── POST /api/admin/health-rules/prospect-image (31.1 plan 05, Task 2) ───
// Mirrors app/api/admin/staff/[id]/avatar/route.ts's shape exactly, but
// leadership-only and writing health_rules_config.prospect_image_url on the
// id=1 row instead of funun_staff.avatar_url (D-31.1-08).

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: jest.fn(),
}))

jest.mock('@/lib/admin/gate', () => {
  const actual = jest.requireActual('@/lib/admin/gate')
  return { ...actual, requireStaff: jest.fn() }
})

jest.mock('@/lib/staff/audit', () => ({
  logStaffAction: jest.fn(),
}))

const LEADERSHIP_UUID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const PUBLIC_URL = 'https://storage.example/vault-assets/health-rules/prospect-123.png'

function makeFile(name: string, type: string, size: number): File {
  const bytes = new Uint8Array(size)
  return new File([bytes], name, { type })
}

// A genuine minimal PNG (8-byte signature + a tiny IHDR/IEND-less tail) —
// only the leading magic bytes matter for sniffImageType, so the tail is
// padding to reach the requested size.
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function makeRealPngFile(name: string, size: number): File {
  const bytes = new Uint8Array(size)
  bytes.set(PNG_MAGIC, 0)
  return new File([bytes], name, { type: 'image/png' })
}

function multipartRequest(file: File | null) {
  const form = new FormData()
  if (file) form.set('file', file)
  return new Request('http://t.local/api/admin/health-rules/prospect-image', {
    method: 'POST',
    body: form,
  })
}

function mockService(
  options: { uploadError?: { message: string } | null; updateError?: { message: string } | null } = {}
) {
  const { uploadError = null, updateError = null } = options

  const uploadSpy = jest.fn(async () => ({ error: uploadError }))
  const getPublicUrlSpy = jest.fn(() => ({ data: { publicUrl: PUBLIC_URL } }))
  const storageFrom = jest.fn(() => ({ upload: uploadSpy, getPublicUrl: getPublicUrlSpy }))

  const updateSpy = jest.fn((patch: Record<string, unknown>) => ({
    eq: jest.fn(async () => ({ error: updateError, data: updateError ? null : [{ id: 1, ...patch }] })),
  }))

  const auditInsert = jest.fn(async () => ({ error: null }))

  const from = jest.fn((table: string) => {
    if (table === 'staff_audit_log') return { insert: auditInsert }
    return { update: updateSpy }
  })

  return { from, storage: { from: storageFrom }, uploadSpy, updateSpy, auditInsert, storageFrom }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(logStaffAction as jest.Mock).mockResolvedValue({ ok: true })
})

describe('POST /api/admin/health-rules/prospect-image', () => {
  it('returns 403 for a non-leadership caller', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ error: 'Forbidden', status: 403 })
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(multipartRequest(makeFile('lion.png', 'image/png', 1000)))
    expect(res.status).toBe(403)
    expect(service.uploadSpy).not.toHaveBeenCalled()
  })

  it('uploads a valid PNG and sets health_rules_config.prospect_image_url to the public URL', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({
      user: { id: LEADERSHIP_UUID },
      staffRole: 'leadership',
    })
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(multipartRequest(makeRealPngFile('lion.png', 1000)))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.prospect_image_url).toBe(PUBLIC_URL)
    expect(service.uploadSpy).toHaveBeenCalledTimes(1)
    expect(service.updateSpy).toHaveBeenCalledWith({ prospect_image_url: PUBLIC_URL })
    expect(logStaffAction).toHaveBeenCalledTimes(1)
  })

  it('rejects a spoofed "image/png" whose bytes are not actually PNG (WR-03) and never uploads', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({
      user: { id: LEADERSHIP_UUID },
      staffRole: 'leadership',
    })
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    // Content-Type claims image/png but the bytes are all zeros — not a
    // real PNG signature.
    const res = await POST(multipartRequest(makeFile('lion.png', 'image/png', 1000)))

    expect(res.status).toBe(400)
    expect(service.uploadSpy).not.toHaveBeenCalled()
  })

  it('rejects a non-image mime with 400 and never uploads', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({
      user: { id: LEADERSHIP_UUID },
      staffRole: 'leadership',
    })
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(multipartRequest(makeFile('malware.exe', 'application/x-msdownload', 1000)))
    expect(res.status).toBe(400)
    expect(service.uploadSpy).not.toHaveBeenCalled()
  })

  it('rejects an oversized file with 400 and never uploads', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({
      user: { id: LEADERSHIP_UUID },
      staffRole: 'leadership',
    })
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(multipartRequest(makeFile('huge.png', 'image/png', 11 * 1024 * 1024)))
    expect(res.status).toBe(400)
    expect(service.uploadSpy).not.toHaveBeenCalled()
  })

  it('returns 400 when no file is provided', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({
      user: { id: LEADERSHIP_UUID },
      staffRole: 'leadership',
    })
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(multipartRequest(null))
    expect(res.status).toBe(400)
  })
})
