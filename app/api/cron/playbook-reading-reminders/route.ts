import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const service = createServiceClient()
  const { data, error } = await service.rpc('enqueue_playbook_reading_reminders', { p_limit: 200 })
  if (error) {
    return NextResponse.json({ ok: false, error: 'Could not enqueue Playbook reading reminders.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, queued: Number(data ?? 0) })
}
