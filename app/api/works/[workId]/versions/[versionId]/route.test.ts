import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { resolveWorkAccess, createWorkAccessDeps } from '@/lib/catalogue/access'
import { PEAKS_BAR_COUNT } from '@/lib/catalogue/waveform'
import { PATCH } from './route'

jest.mock('@/lib/supabase/server', () => ({
  createApiClient: jest.fn(),
  createServiceClient: jest.fn(),
}))

jest.mock('@/lib/catalogue/access', () => ({
  resolveWorkAccess: jest.fn(),
  createWorkAccessDeps: jest.fn(() => ({})),
}))

const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const WORK_ID = 'work-1'
const VERSION_ID = 'version-1'

function patchRequest(body: unknown) {
  return new Request(`http://t.local/api/works/${WORK_ID}/versions/${VERSION_ID}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

function ctx() {
  return { params: Promise.resolve({ workId: WORK_ID, versionId: VERSION_ID }) }
}

function auth() {
  return { getUser: jest.fn(async () => ({ data: { user: { id: USER_ID } } })) }
}

const validPeaks = () => Array.from({ length: PEAKS_BAR_COUNT }, () => 50)

describe('PATCH /api/works/[workId]/versions/[versionId] — peaks', () => {
  let updateSpy: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    ;(resolveWorkAccess as jest.Mock).mockResolvedValue({ granted: true, tier: 'contribute', isOwner: false })
    ;(createWorkAccessDeps as jest.Mock).mockReturnValue({})

    const version = { id: VERSION_ID, user_id: USER_ID, archived_at: null, label: null }
    const maybeSingleSpy = jest.fn(async () => ({ data: version, error: null }))
    const lookupEq2Spy = jest.fn(() => ({ maybeSingle: maybeSingleSpy }))
    const lookupEq1Spy = jest.fn(() => ({ eq: lookupEq2Spy }))
    const selectSpy = jest.fn(() => ({ eq: lookupEq1Spy }))

    const singleSpy = jest.fn(async () => ({ data: { id: VERSION_ID }, error: null }))
    const updateSelectSpy = jest.fn(() => ({ single: singleSpy }))
    const updateEq2Spy = jest.fn(() => ({ select: updateSelectSpy }))
    const updateEq1Spy = jest.fn(() => ({ eq: updateEq2Spy }))
    updateSpy = jest.fn(() => ({ eq: updateEq1Spy }))

    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: auth(),
      from: jest.fn(() => ({ select: selectSpy, update: updateSpy })),
    })
    ;(createServiceClient as jest.Mock).mockReturnValue({
      from: jest.fn(),
    })
  })

  it('rejects a peaks array one entry short of PEAKS_BAR_COUNT', async () => {
    const res = await PATCH(patchRequest({ peaks: validPeaks().slice(1) }), ctx())
    expect(res.status).toBe(400)
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it('rejects a peaks array one entry longer than PEAKS_BAR_COUNT', async () => {
    const res = await PATCH(patchRequest({ peaks: [...validPeaks(), 10] }), ctx())
    expect(res.status).toBe(400)
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it('rejects a peaks array containing a value of 101', async () => {
    const peaks = validPeaks()
    peaks[0] = 101
    const res = await PATCH(patchRequest({ peaks }), ctx())
    expect(res.status).toBe(400)
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it('rejects a peaks array containing a value of -1', async () => {
    const peaks = validPeaks()
    peaks[0] = -1
    const res = await PATCH(patchRequest({ peaks }), ctx())
    expect(res.status).toBe(400)
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it('rejects a peaks array containing a fractional value', async () => {
    const peaks = validPeaks()
    peaks[0] = 50.5
    const res = await PATCH(patchRequest({ peaks }), ctx())
    expect(res.status).toBe(400)
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it('accepts a correctly shaped peaks array and writes it back', async () => {
    const peaks = validPeaks()
    const res = await PATCH(patchRequest({ peaks }), ctx())
    expect(res.status).toBe(200)
    expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ peaks }))
  })

  it('rejects a request mixing peaks with another key', async () => {
    const res = await PATCH(patchRequest({ peaks: validPeaks(), label: 'Take 2' }), ctx())
    expect(res.status).toBe(400)
    expect(updateSpy).not.toHaveBeenCalled()
  })
})
