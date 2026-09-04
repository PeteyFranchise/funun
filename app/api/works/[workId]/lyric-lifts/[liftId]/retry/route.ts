import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { createWorkAccessDeps, resolveWorkAccess } from '@/lib/catalogue/access'
import {
  LYRIC_LIFT_NO_VOCALS_MESSAGE,
  LYRIC_LIFT_UNAVAILABLE_MESSAGE,
} from '@/lib/catalogue/lyric-lift'
import { loadLyricLiftView } from '@/lib/catalogue/lyric-lift-service'
import { queueLyricLift } from '@/lib/catalogue/lyric-lift-queue'

export const runtime = 'nodejs'
export const maxDuration = 300

type RouteContext = { params: Promise<{ workId: string; liftId: string }> }

export async function POST(_request: Request, { params }: RouteContext) {
  const { workId, liftId } = await params
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const access = await resolveWorkAccess(createWorkAccessDeps(supabase), workId, user.id, 'contribute')
  if (!access.granted) return NextResponse.json({ error: access.reason }, { status: access.status })
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: LYRIC_LIFT_UNAVAILABLE_MESSAGE }, { status: 503 })
  }

  const service = createServiceClient()
  const { data: lift } = await service
    .from('work_lyric_lifts')
    .select('id, status, error_message')
    .eq('id', liftId)
    .eq('work_id', workId)
    .maybeSingle()
  if (!lift) return NextResponse.json({ error: 'Lyric Lift not found.' }, { status: 404 })
  if (lift.status !== 'failed') return NextResponse.json({ error: 'Only a failed Lyric Lift can be retried.' }, { status: 409 })
  if (lift.error_message === LYRIC_LIFT_NO_VOCALS_MESSAGE) {
    return NextResponse.json({ error: LYRIC_LIFT_NO_VOCALS_MESSAGE }, { status: 409 })
  }

  await service
    .from('work_lyric_lifts')
    .update({ status: 'queued', error_message: null, started_at: null, completed_at: null })
    .eq('id', liftId)
  const job = await queueLyricLift(liftId)
  if (!job) {
    await service.from('work_lyric_lifts').update({ status: 'failed', error_message: 'The transcription queue is unavailable. Try again.' }).eq('id', liftId)
    return NextResponse.json({ error: 'The transcription queue is unavailable. Try again.' }, { status: 503 })
  }
  await service.from('work_lyric_lifts').update({ job_id: job.id }).eq('id', liftId)
  const view = await loadLyricLiftView(service, { workId, liftId })
  return NextResponse.json({ data: view }, { status: 202 })
}
