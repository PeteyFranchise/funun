import { readFileSync, readdirSync } from 'fs'
import path from 'path'
import { THRESHOLDS, classifyThreshold } from '@/lib/observability/config'

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

describe('migration 227 — storage usage reporting function', () => {
  // The reason this reads storage.objects rather than application tables: a
  // file uploaded directly, bypassing admission, is precisely the file the app
  // does not know about. Only the bucket sees everything.
  it('sums from storage.objects, not from application tables', () => {
    expect(sql).toContain('FROM storage.objects')
    expect(sql).not.toMatch(/FROM\s+public\.tracks/)
  })

  it('groups by the owning path segment and filters at the threshold', () => {
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

describe('the storage usage cron route', () => {
  // Without this check FIRST the route is a quota-burning DoS vector reachable
  // by anyone on the public internet — the same guard every other cron here has.
  it('rejects a request without the cron secret before doing any work', () => {
    expect(route).toContain("request.headers.get('authorization')")
    expect(route).toContain('process.env.CRON_SECRET')
    expect(route).toContain("new NextResponse('Unauthorized', { status: 401 })")
    const guardIndex = route.indexOf('CRON_SECRET')
    const workIndex = route.indexOf('storage_usage_over_threshold')
    expect(guardIndex).toBeLessThan(workIndex)
  })

  it('uses the service client, since the function is service_role only', () => {
    expect(route).toContain('createServiceClient()')
  })

  // T-32-06: alert content is a summary status only, never raw user or
  // Supabase records. Counts and aggregates are fine; an account id is not.
  it('reports counts and aggregates, never an account id or file path', () => {
    expect(route).not.toMatch(/owner_segment\s*\}/)
    expect(route).not.toMatch(/\$\{[^}]*owner_segment[^}]*\}/)
    expect(route).toContain('attributed.length')
    expect(route).toContain('worstGb')
  })

  // No-data is never silently healthy. A failed check that returned quietly
  // would be indistinguishable from "nobody is over threshold" — the one
  // reading this job must never produce by accident.
  it('alerts when the check itself fails, rather than failing silently', () => {
    expect(route).toContain('storage usage check FAILED')
    const errBranch = route.slice(route.indexOf('if (error)'), route.indexOf('const rows'))
    expect(errBranch).toContain('fanOutAlert')
  })

  it('reads its band from the shared threshold config, not a local constant', () => {
    expect(route).toContain('THRESHOLDS.account_storage_gb')
    expect(route).toContain('classifyThreshold')
  })
})

describe('threshold registration', () => {
  it('registers account_storage_gb with warning below critical', () => {
    const band = THRESHOLDS.account_storage_gb
    expect(band.warning).toBeLessThan(band.critical)
    expect(band.provisional).toBe(true)
  })

  // Generous on purpose: a twelve-track album with stems is legitimately
  // several GB, so this must catch abuse without nagging a real artist.
  it('classifies a prolific-but-legitimate footprint as healthy', () => {
    expect(classifyThreshold('account_storage_gb', 12)).toBe('healthy')
    expect(classifyThreshold('account_storage_gb', THRESHOLDS.account_storage_gb.warning)).toBe('warning')
    expect(classifyThreshold('account_storage_gb', THRESHOLDS.account_storage_gb.critical)).toBe('critical')
  })

  it('is registered as a daily Vercel cron', () => {
    const entry = vercelJson.crons.find(c => c.path === '/api/cron/storage-usage-check')
    expect(entry).toBeDefined()
    // Daily, not more often: this scans every object in every bucket.
    expect(entry?.schedule).toMatch(/^\d+ \d+ \* \* \*$/)
  })
})
