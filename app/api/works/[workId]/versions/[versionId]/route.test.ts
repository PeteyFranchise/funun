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
  let updateIsSpy: jest.Mock
  let updateMaybeSingleSpy: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    ;(resolveWorkAccess as jest.Mock).mockResolvedValue({ granted: true, tier: 'contribute', isOwner: false })
    ;(createWorkAccessDeps as jest.Mock).mockReturnValue({})

    const version = { id: VERSION_ID, user_id: USER_ID, archived_at: null, label: null }
    const maybeSingleSpy = jest.fn(async () => ({ data: version, error: null }))
    const lookupEq2Spy = jest.fn(() => ({ maybeSingle: maybeSingleSpy }))
    const lookupEq1Spy = jest.fn(() => ({ eq: lookupEq2Spy }))
    const selectSpy = jest.fn(() => ({ eq: lookupEq1Spy }))

    // Default: the row still has a NULL waveform, so the self-heal write lands.
    updateMaybeSingleSpy = jest.fn(async () => ({ data: { id: VERSION_ID }, error: null }))
    const updateSelectSpy = jest.fn(() => ({ maybeSingle: updateMaybeSingleSpy }))
    updateIsSpy = jest.fn(() => ({ select: updateSelectSpy }))
    const updateEq2Spy = jest.fn(() => ({ is: updateIsSpy }))
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

  // WR-02. A waveform is computed once; this endpoint exists only so a take
  // that predates the column can fill in its own shape. Without this filter any
  // contribute-tier member could replace an already-correct waveform for the
  // whole room, and migration 224's CHECK cannot help -- it validates the shape
  // of what arrives, never whether it should have been allowed to arrive.
  it('scopes the write to rows whose waveform is still unset', async () => {
    const res = await PATCH(patchRequest({ peaks: validPeaks() }), ctx())
    expect(res.status).toBe(200)
    expect(updateIsSpy).toHaveBeenCalledWith('peaks', null)
  })

  // Zero rows is the EXPECTED outcome when a waveform already exists -- two
  // clients opening the same take will race, and the loser must see a no-op
  // rather than a 500 telling them something broke.
  it('treats an already-computed waveform as a no-op, not an error', async () => {
    updateMaybeSingleSpy.mockResolvedValueOnce({ data: null, error: null })
    const res = await PATCH(patchRequest({ peaks: validPeaks() }), ctx())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: { id: VERSION_ID, alreadyComputed: true } })
  })
})
