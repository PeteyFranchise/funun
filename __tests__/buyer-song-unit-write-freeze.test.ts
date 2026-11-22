import fs from 'node:fs'
import path from 'node:path'
import {
  BUYER_SONG_UNIT_WRITES_WITHHELD,
  buyerSongUnitWriteWithholdingResponse,
} from '@/lib/deals/buyer-song-unit-withholding'

type GuardedRoute = {
  file: string
  handler: string
  authorization: string
  mutation: string
}

const GUARDED_ROUTES: GuardedRoute[] = [
  {
    file: 'app/api/buyer/requests/route.ts',
    handler: 'export async function POST',
    authorization: 'if (!member || !canSubmitRequest(member))',
    mutation: ".from('license_requests')",
  },
  {
    file: 'app/api/buyer/shortlists/route.ts',
    handler: 'export async function POST',
    authorization: "if (!member) return NextResponse.json({ error: 'Forbidden' }",
    mutation: '.upsert(',
  },
  {
    file: 'app/api/admin/deals/route.ts',
    handler: 'export async function POST',
    authorization: "if ('error' in auth) return NextResponse.json",
    mutation: ".from('license_requests')",
  },
  {
    file: 'app/api/admin/deals/[id]/route.ts',
    handler: 'export async function PATCH',
    authorization: "if ('error' in auth) return NextResponse.json",
    mutation: '.update(update)',
  },
  {
    file: 'app/api/admin/deals/[id]/pay/route.ts',
    handler: 'export async function POST',
    authorization: "if ('error' in auth) return NextResponse.json",
    mutation: ".rpc('claim_license_checkout'",
  },
  {
    file: 'app/api/admin/deals/[id]/executed/route.ts',
    handler: 'export async function POST',
    authorization: "if ('error' in auth) return NextResponse.json",
    mutation: 'stampLicenseExecuted(',
  },
  {
    file: 'app/api/vault/[projectId]/licensing/route.ts',
    handler: 'export async function PATCH',
    authorization: "if (!project) return NextResponse.json({ error: 'Not found' }",
    mutation: '.upsert(',
  },
  {
    file: 'app/api/admin/selects/[id]/send/route.ts',
    handler: 'export async function POST',
    authorization: "if (!selects) return NextResponse.json({ error: 'Not found' }",
    mutation: '.update(update)',
  },
]

describe('buyer song unit write freeze', () => {
  it('returns one fail-closed response with natural copy, no timing promise, and no dash characters', async () => {
    expect(BUYER_SONG_UNIT_WRITES_WITHHELD).toBe(true)

    const response = buyerSongUnitWriteWithholdingResponse()
    expect(response).not.toBeNull()
    expect(response?.status).toBe(503)
    expect(response?.headers.get('retry-after')).toBeNull()

    const body = (await response?.json()) as { error: string; code: string }
    expect(body.code).toBe('buyer_song_unit_withheld')
    expect(body.error).toMatch(/song licensing/i)
    expect(body.error).not.toMatch(/\b(temporarily|soon|shortly|for now|try again|within \d)\b/i)
    expect(body.error).not.toMatch(/[\u002D\u2010-\u2015]/)
  })

  it.each(GUARDED_ROUTES)(
    'guards $file after authorization and before its first commercial mutation',
    ({ file, handler, authorization, mutation }) => {
      const source = fs.readFileSync(path.join(process.cwd(), file), 'utf8')
      const handlerStart = source.indexOf(handler)
      const handlerSource = source.slice(handlerStart)
      const authorizationIndex = handlerSource.indexOf(authorization)
      const guardIndex = handlerSource.indexOf('buyerSongUnitWriteWithholdingResponse()')
      const mutationIndex = handlerSource.indexOf(mutation)

      expect(handlerStart).toBeGreaterThanOrEqual(0)
      expect(authorizationIndex).toBeGreaterThanOrEqual(0)
      expect(guardIndex).toBeGreaterThan(authorizationIndex)
      expect(mutationIndex).toBeGreaterThan(guardIndex)
    }
  )
})
