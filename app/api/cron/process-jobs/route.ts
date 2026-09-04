import { NextResponse } from 'next/server'
import { processPendingJobs } from '@/lib/jobs/run'

export const runtime = 'nodejs'
// Vercel Pro (audit #5/#10 mechanism decision): a mixed-song transcription can
// take several minutes. On Hobby this route still works when invoked, but its
// frequent cron trigger requires Pro.
export const maxDuration = 300

// ─── GET /api/cron/process-jobs — durable background-job worker (audit #5/#10) ─
// Invoked by Vercel Cron (add `{ "path": "/api/cron/process-jobs", "schedule":
// "* * * * *" }` to vercel.json ONCE Vercel Pro is active — a sub-daily cron is
// rejected on Hobby). Fail-closed CRON_SECRET guard, identical to the other
// crons. Delegates to the shared runner (processPendingJobs), which claims via
// FOR UPDATE SKIP LOCKED so overlapping invocations never double-process, and
// dispatches by type to JOB_HANDLERS. One job per invocation ensures one long
// audio analysis cannot cause a second claimed job to outlive this function.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const processed = await processPendingJobs({ max: 1 })
  return NextResponse.json({ ok: true, processed })
}
