// Asserts the split-sheet approval email escapes user-supplied song and party
// names in its HTML, keeps the subject on one line, and leaves the text part raw.

const mockGetUser = jest.fn()
const mockSheetResult = jest.fn()

jest.mock('@/lib/supabase/server', () => ({
  createApiClient: async () => ({
    auth: { getUser: () => mockGetUser() },
    from: () => {
      const q: Record<string, unknown> = {}
      q.select = jest.fn(() => q)
      q.eq = jest.fn(() => q)
      q.maybeSingle = jest.fn(() => Promise.resolve(mockSheetResult()))
      return q
    },
  }),
  createServiceClient: () => ({
    from: () => ({
      update: () => ({
        eq: () => Promise.resolve({ data: null, error: null }),
      }),
    }),
  }),
}))

jest.mock('@/lib/email', () => ({ sendEmail: jest.fn() }))

import { POST } from '@/app/api/split-sheets/[id]/send-for-approval/route'
import { sendEmail } from '@/lib/email'

const sendEmailMock = sendEmail as jest.Mock

function makeSheet(songName: string, nameA: string, nameB: string) {
  return {
    id: 'sheet-1',
    song_name: songName,
    split_sheet_parties: [
      { id: 'p1', name: nameA, email: 'a@example.com', role: 'writer', split_percentage: 50 },
      { id: 'p2', name: nameB, email: 'b@example.com', role: 'writer', split_percentage: 50 },
    ],
  }
}

async function callPost() {
  return POST(
    new Request('http://test.local/api/split-sheets/sheet-1/send-for-approval', {
      method: 'POST',
    }),
    { params: Promise.resolve({ id: 'sheet-1' }) }
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  sendEmailMock.mockResolvedValue({ ok: true })
  mockGetUser.mockResolvedValue({ data: { user: { id: 'initiator-1' } } })
})

describe('split-sheet send-for-approval email', () => {
  it('escapes song and party names in the html body', async () => {
    mockSheetResult.mockReturnValue({
      data: makeSheet('Tom & Jerry <b>"Live"</b>', 'A<script>', 'B "Q" & Co'),
      error: null,
    })

    const res = await callPost()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, sent: 2 })
    expect(sendEmailMock).toHaveBeenCalledTimes(2)

    for (const [args] of sendEmailMock.mock.calls) {
      const html = args.html as string
      expect(html).toContain('Tom &amp; Jerry &lt;b&gt;&quot;Live&quot;&lt;/b&gt;')
      expect(html).toContain('A&lt;script&gt;')
      expect(html).toContain('B &quot;Q&quot; &amp; Co')
      expect(html).not.toContain('<b>"Live"')
      expect(html).not.toContain('A<script>')
      expect(html).not.toContain('B "Q" & Co')
    }
  })

  it('escapes the approve link in the href', async () => {
    const previous = process.env.NEXT_PUBLIC_APP_URL
    process.env.NEXT_PUBLIC_APP_URL = 'https://x.test/?a=1&b="2"'
    try {
      mockSheetResult.mockReturnValue({ data: makeSheet('Song', 'Alice', 'Bob'), error: null })
      await callPost()
      expect(sendEmailMock).toHaveBeenCalled()
      for (const [args] of sendEmailMock.mock.calls) {
        const html = args.html as string
        expect(html).toContain('href="https://x.test/?a=1&amp;b=&quot;2&quot;/approve/')
        expect(html).not.toContain('b="2"')
      }
    } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_APP_URL
      else process.env.NEXT_PUBLIC_APP_URL = previous
    }
  })

  it('keeps the subject on a single line', async () => {
    mockSheetResult.mockReturnValue({
      data: makeSheet('Song\r\nBcc: x@y.z', 'Alice', 'Bob'),
      error: null,
    })

    await callPost()

    expect(sendEmailMock).toHaveBeenCalled()
    for (const [args] of sendEmailMock.mock.calls) {
      expect(args.subject).not.toMatch(/[\r\n]/)
    }
  })

  it('leaves the plain-text part unescaped', async () => {
    mockSheetResult.mockReturnValue({
      data: makeSheet('Tom & Jerry', 'A<script>', 'Bob'),
      error: null,
    })

    await callPost()

    for (const [args] of sendEmailMock.mock.calls) {
      expect(args.text).toContain('"Tom & Jerry"')
      expect(args.text).toContain('A<script>: 50%')
    }
  })

  it('returns 401 and sends nothing when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    const res = await callPost()

    expect(res.status).toBe(401)
    expect(sendEmailMock).not.toHaveBeenCalled()
  })
})
