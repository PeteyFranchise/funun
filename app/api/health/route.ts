import { NextResponse } from 'next/server'
import { SUPABASE_CHECK_TIMEOUT_MS } from './constants'
import { createServiceClient } from '@/lib/supabase/server'

// ─── GET /api/health — public, unauthenticated, read-only (32-03 Task 1) ──
// middleware.ts's config.matcher excludes /api entirely, so this route is
// its OWN complete security boundary: never call auth.getUser() or read a
// session here. Compensating controls: exactly ONE cheap read-only Supabase
// query (select id, limit 1) per request, bounded by SUPABASE_CHECK_TIMEOUT_MS
// via AbortController so a hung DB can never hang this route, and a body
// that never echoes the Supabase error/message/stack, env vars, tokens, or
// schema/table details beyond the fixed status fields below.
//
// Status-code contract (Better Stack Plan 07 + the daily cron Plan 05 both
// depend on this): 200 = healthy, 503 = degraded. This route NEVER returns
// an unhandled 500 or crashes — any failure (timeout, network, unexpected
// exception) is caught and reported as a deliberate, handled 503 degraded
// response instead.
type CheckOutcome = { error: { message: string } | null }

export async function GET() {
  const startedAt = Date.now()
  let supabaseOk = false

  try {
    const service = createServiceClient()
    const controller = new AbortController()

    // Belt-and-suspenders timeout: aborting the underlying fetch (via
    // AbortController) is the primary mechanism, but we also race against a
    // plain timer promise so the route provably resolves within the budget
    // even if a given transport/mock never observes the abort signal.
    let timeoutId: ReturnType<typeof setTimeout>
    const timeoutPromise = new Promise<CheckOutcome>((resolve) => {
      timeoutId = setTimeout(() => {
        controller.abort()
        resolve({ error: { message: 'timeout' } })
      }, SUPABASE_CHECK_TIMEOUT_MS)
    })

    // Single cheap read-only check — no writes, no retries, no amplification.
    // Promise.resolve() normalizes the PostgREST builder's thenable into a
    // real Promise so it can be raced against timeoutPromise below.
    const queryPromise: Promise<CheckOutcome> = Promise.resolve(
      service.from('artist_invites').select('id').abortSignal(controller.signal).limit(1)
    )

    const { error } = await Promise.race([queryPromise, timeoutPromise])
    clearTimeout(timeoutId!)
    supabaseOk = !error
  } catch {
    // Never throw — a timeout, network failure, or any unexpected error is
    // reported as degraded, not a crash.
    supabaseOk = false
  }

  const status = supabaseOk ? 'healthy' : 'degraded'
  const httpStatus = supabaseOk ? 200 : 503

  return NextResponse.json(
    {
      status,
      checkedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
    },
    { status: httpStatus }
  )
}
