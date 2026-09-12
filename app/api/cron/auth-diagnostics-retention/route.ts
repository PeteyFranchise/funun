import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const { data, error } = await createServiceClient().rpc('prune_auth_diagnostic_events')
  if (error) {
    // Application deploys are allowed to precede the human-gated migration.
    // PostgREST reports a missing function as PGRST202 until activation.
    if (error.code === 'PGRST202') {
      return NextResponse.json({ ok: true, activated: false, deleted: 0 })
    }
    return NextResponse.json({ error: 'Auth diagnostics retention failed' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    activated: true,
    deleted: typeof data === 'number' ? data : 0,
  })
}
