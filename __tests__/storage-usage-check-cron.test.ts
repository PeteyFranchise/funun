// M-01 stopgap — the daily Storage inventory job.
//
// The route's job is narrow: sum every object in Storage into ONE number and
// say something only when that number crosses a band. It previously did
// neither. It passed the 25 GB per-account warning band as the RPC's floor, so
// the function returned zero rows and the route reported healthy no matter how
// much storage existed, and when it did fire it described each path segment as
// an "account" — false, since work audio is written to `{workId}/...` and most
// production UUID segments are not people. The behavioural tests below hold
// both of those closed: the floor is 0, and the alert body carries no
// per-account claim.

const mockRpc = jest.fn()
jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({ rpc: (...a: unknown[]) => mockRpc(...a) }),
}))

const mockFanOutAlert = jest.fn()
jest.mock('@/lib/observability/alerts', () => ({
  fanOutAlert: (...a: unknown[]) => mockFanOutAlert(...a),
}))

import { readFileSync, readdirSync } from 'fs'
import path from 'path'
import { THRESHOLDS, classifyThreshold } from '@/lib/observability/config'
import { GET } from '@/app/api/cron/storage-usage-check/route'

const migrationsDir = path.join(process.cwd(), 'supabase/migrations')
const matches = readdirSync(migrationsDir).filter(name =>
  name.endsWith('_storage_usage_by_owner.sql')
)
if (matches.length !== 1) {
  throw new Error(
    `expected exactly one storage-usage migration, found ${matches.length}: ${matches.join(', ')}`
  )
}
const sql = readFileSync(path.join(migrationsDir, matches[0]), 'utf8')

const route = readFileSync(
  path.join(process.cwd(), 'app/api/cron/storage-usage-check/route.ts'),
  'utf8'
)
const vercelJson = JSON.parse(
  readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf8')
) as { crons: { path: string; schedule: string }[] }

const GB = 1024 ** 3
const OLD_ENV = process.env

function req(headers: Record<string, string> = {}) {
  return {
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
  } as unknown as Request
}

const auth = { authorization: 'Bearer test-secret' }

/** One RPC row: the route reads only the two aggregate columns. */
function row(totalBytes: number, objectCount = 1) {
  return {
    owner_segment: '00000000-0000-0000-0000-000000000000',
    is_uuid: true,
    total_bytes: totalBytes,
    object_count: objectCount,
  }
}

function alertCall(): { subject: string; html: string } {
  expect(mockFanOutAlert).toHaveBeenCalledTimes(1)
  const [subject, html] = mockFanOutAlert.mock.calls[0] as [string, string]
  return { subject, html }
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env = { ...OLD_ENV, CRON_SECRET: 'test-secret' }
  mockRpc.mockResolvedValue({ data: [], error: null })
  mockFanOutAlert.mockResolvedValue({ sent: 1, failed: 0 })
})

afterAll(() => {
  process.env = OLD_ENV
})

describe('migration 227 — storage usage reporting function', () => {
  // The reason this reads storage.objects rather than application tables: a
  // file uploaded directly, bypassing admission, is precisely the file the app
  // does not know about. Only the bucket sees everything.
  it('sums from storage.objects, not from application tables', () => {
    expect(sql).toContain('FROM storage.objects')
    expect(sql).not.toMatch(/FROM\s+public\.tracks/)
  })

  it('groups by path segment and filters at the caller-supplied floor', () => {
    expect(sql).toContain("split_part(o.name, '/', 1)")
    expect(sql).toContain('HAVING SUM(COALESCE((o.metadata')
    expect(sql).toContain('>= p_min_bytes')
  })

  // A row mid-upload can carry no size yet. Treating that as zero keeps the
  // total honest; without COALESCE a single such row nulls the whole sum.
  it('treats a missing size as zero rather than nulling the sum', () => {
    expect(sql).toContain("COALESCE((o.metadata ->> 'size')::BIGINT, 0)")
  })

  // This reads every object in every bucket. If a browser client could call
  // it, the stopgap would be a worse leak than the gap it reports on.
  it('is service_role only — never reachable by a browser client', () => {
    expect(sql).toContain('REVOKE EXECUTE ON FUNCTION public.storage_usage_over_threshold(BIGINT)\n  FROM PUBLIC, anon, authenticated')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.storage_usage_over_threshold(BIGINT)\n  TO service_role')
    expect(sql).not.toMatch(/TO authenticated/)
  })

  it('is SECURITY DEFINER with a pinned search_path', () => {
    expect(sql).toContain('SECURITY DEFINER')
    expect(sql).toContain('SET search_path = public, storage, pg_temp')
  })

  it('is read-only', () => {
    expect(sql).toContain('STABLE')
    expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b\s+INTO|\bUPDATE\s+storage|\bDELETE\s+FROM/)
  })
})

describe('the storage usage cron route — auth guard', () => {
  // Without this check FIRST the route is a quota-burning DoS vector reachable
  // by anyone on the public internet — the same guard every other cron here has.
  it('401s on a wrong bearer token, before doing any work', async () => {
    const res = await GET(req({ authorization: 'Bearer nope' }))
    expect(res.status).toBe(401)
    expect(mockRpc).not.toHaveBeenCalled()
    expect(mockFanOutAlert).not.toHaveBeenCalled()
  })

  it('401s when no CRON_SECRET is configured (fail closed)', async () => {
    delete process.env.CRON_SECRET
    const res = await GET(req(auth))
    expect(res.status).toBe(401)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  // Source-order assertion kept from the original suite: the guard must sit
  // above the work in the file, not merely happen to run first today.
  it('places the secret check above the RPC call in the source', () => {
    expect(route).toContain("request.headers.get('authorization')")
    expect(route).toContain("new NextResponse('Unauthorized', { status: 401 })")
    const guardIndex = route.indexOf('CRON_SECRET')
    const workIndex = route.indexOf('storage_usage_over_threshold')
    expect(guardIndex).toBeLessThan(workIndex)
  })
})

describe('the storage usage cron route — inventory feed', () => {
  // The whole defect in one assertion. A threshold-derived floor made the RPC
  // return zero rows unless a SINGLE segment exceeded 25 GB, so the job could
  // not fire at any realistic usage.
  it('calls the RPC with a zero floor, not a threshold-derived one', async () => {
    await GET(req(auth))
    expect(mockRpc).toHaveBeenCalledWith('storage_usage_over_threshold', { p_min_bytes: 0 })
    const [, args] = mockRpc.mock.calls[0] as [string, { p_min_bytes: number }]
    expect(args.p_min_bytes).toBe(0)
    expect(args.p_min_bytes).not.toBe(Math.floor(THRESHOLDS.storage_total_gb.warning * GB))
  })

  it('sums every row into one global total rather than reading the largest', async () => {
    mockRpc.mockResolvedValue({
      data: [row(1 * GB, 10), row(2 * GB, 20), row(0.5 * GB, 5)],
      error: null,
    })
    const res = await GET(req(auth))
    const body = await res.json()
    expect(body.totalGb).toBe(3.5)
    expect(body.totalBytes).toBe(3.5 * GB)
    expect(body.objectCount).toBe(35)
    expect(body.segmentCount).toBe(3)
  })
})

describe('the storage usage cron route — banding', () => {
  it('stays silent and healthy below the band', async () => {
    mockRpc.mockResolvedValue({ data: [row(0.047 * GB, 3)], error: null })
    const res = await GET(req(auth))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.status).toBe('healthy')
    expect(body.alerted).toBeUndefined()
    expect(mockFanOutAlert).not.toHaveBeenCalled()
  })

  // Many small segments, none of them near the old 25 GB per-segment floor,
  // adding up to a total that matters. This is the reading the old shape threw
  // away, and the reason the band is on the total.
  it('alerts once when many small segments together cross the band', async () => {
    const rows = Array.from({ length: 12 }, () => row(0.5 * GB, 4))
    mockRpc.mockResolvedValue({ data: rows, error: null })
    const res = await GET(req(auth))
    const body = await res.json()
    expect(body.status).toBe('warning')
    expect(body.alerted).toBe(true)
    const { html } = alertCall()
    expect(html).toContain('6 GB')
  })

  it('classifies as critical above the critical band', async () => {
    mockRpc.mockResolvedValue({ data: [row(25 * GB, 100)], error: null })
    const body = await (await GET(req(auth))).json()
    expect(body.status).toBe('critical')
    const { subject, html } = alertCall()
    expect(subject).toContain('critical')
    expect(html).toContain('25 GB')
  })

  // Display rounding must not tip a value into a band it is not in.
  it('does not let display rounding promote a just-under total into the band', async () => {
    mockRpc.mockResolvedValue({ data: [row(4.999 * GB, 9)], error: null })
    const body = await (await GET(req(auth))).json()
    expect(body.status).toBe('healthy')
    expect(mockFanOutAlert).not.toHaveBeenCalled()
  })
})

describe('the storage usage cron route — what it may not claim', () => {
  // THE assertion. Of 8 UUID path segments in production, 5 are work ids and
  // only 2 are accounts — work audio is deliberately written to `{workId}/...`
  // (lib/catalogue/audio-mime.ts). Nothing this job emits may call a segment a
  // person, a count of segments a count of accounts, or a byte total someone's
  // footprint. If this fails, the falsehood has come back.
  it('makes no per-account claim anywhere in the alert', async () => {
    mockRpc.mockResolvedValue({ data: [row(6 * GB, 40), row(2 * GB, 9)], error: null })
    await GET(req(auth))
    const { subject, html } = alertCall()
    for (const text of [subject, html]) {
      expect(text).not.toMatch(/account/i)
      expect(text).not.toMatch(/\bowner/i)
      expect(text).not.toMatch(/\buser\(s\)|\bartist\(s\)|per-user/i)
    }
  })

  // The old alert flagged non-UUID prefixes as "unattributed", which was also
  // wrong: `ideas/` is the one path already governed by server-issued upload
  // intents. A non-UUID prefix is not a problem to report.
  it('does not frame any prefix as unattributed', async () => {
    mockRpc.mockResolvedValue({
      data: [
        { owner_segment: 'ideas', is_uuid: false, total_bytes: 6 * GB, object_count: 3 },
        row(1 * GB, 2),
      ],
      error: null,
    })
    await GET(req(auth))
    const { subject, html } = alertCall()
    expect(`${subject} ${html}`).not.toMatch(/unattributed/i)
  })

  it('describes the segment count as path segments, and says they are not people', async () => {
    mockRpc.mockResolvedValue({ data: [row(6 * GB, 40)], error: null })
    await GET(req(auth))
    const { html } = alertCall()
    expect(html).toMatch(/path segment/i)
    expect(html).toMatch(/not a person/i)
  })

  it('returns no per-account fields in the JSON response', async () => {
    mockRpc.mockResolvedValue({ data: [row(0.1 * GB, 2)], error: null })
    const body = await (await GET(req(auth))).json()
    expect(Object.keys(body).join(' ')).not.toMatch(/account|owner|unattributed|worst/i)
    expect(body.overThreshold).toBeUndefined()
  })

  // T-32-06: alert content is a summary status only. A path segment IS a raw
  // id — it must never reach an email even as an aggregate label.
  it('never interpolates a path segment into the alert', () => {
    expect(route).not.toMatch(/\$\{[^}]*owner_segment[^}]*\}/)
  })
})

describe('the storage usage cron route — failure is never silence', () => {
  // No-data is never silently healthy. A failed check that returned quietly
  // would be indistinguishable from "storage is fine" — the one reading this
  // job must never produce by accident.
  it('alerts and 500s when the RPC fails', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const res = await GET(req(auth))
    expect(res.status).toBe(500)
    const { subject, html } = alertCall()
    expect(subject).toContain('FAILED')
    expect(html).toMatch(/unknown/i)
    expect(`${subject} ${html}`).not.toMatch(/account/i)
  })
})

describe('threshold registration', () => {
  it('registers storage_total_gb with warning below critical', () => {
    const band = THRESHOLDS.storage_total_gb
    expect(band.warning).toBeLessThan(band.critical)
    expect(band.provisional).toBe(true)
  })

  // Retired, not renamed-and-kept: nothing can measure a per-account footprint
  // until attribution is repaired, and a live threshold no code can compute
  // truthfully is an invitation to compute it falsely again.
  it('no longer registers the per-account band', () => {
    expect(Object.keys(THRESHOLDS)).not.toContain('account_storage_gb')
  })

  it('classifies observed usage as healthy and the named trigger as warning', () => {
    expect(classifyThreshold('storage_total_gb', 0.047)).toBe('healthy')
    expect(classifyThreshold('storage_total_gb', THRESHOLDS.storage_total_gb.warning)).toBe('warning')
    expect(classifyThreshold('storage_total_gb', THRESHOLDS.storage_total_gb.critical)).toBe('critical')
  })

  it('reads its band from the shared threshold config, not a local constant', () => {
    expect(route).toContain('THRESHOLDS.storage_total_gb')
    expect(route).toContain("classifyThreshold('storage_total_gb'")
  })

  it('is registered as a daily Vercel cron', () => {
    const entry = vercelJson.crons.find(c => c.path === '/api/cron/storage-usage-check')
    expect(entry).toBeDefined()
    // Daily, not more often: this scans every object in every bucket.
    expect(entry?.schedule).toMatch(/^\d+ \d+ \* \* \*$/)
  })
})
