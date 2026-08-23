import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

const BATCH_SIZE = 10_000
const MAX_BATCHES = 10

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const service = createServiceClient()
  let deleted = 0
  let batches = 0

  while (batches < MAX_BATCHES) {
    const { data, error } = await service.rpc('cleanup_rate_limit_hits', {
      p_batch_size: BATCH_SIZE,
    })
    if (error) {
      return NextResponse.json({ error: 'Rate-limit cleanup failed' }, { status: 500 })
    }

    const batchDeleted = typeof data === 'number' ? data : 0
    deleted += batchDeleted
    batches += 1
    if (batchDeleted < BATCH_SIZE) break
  }

  return NextResponse.json({ ok: true, deleted, batches })
}
