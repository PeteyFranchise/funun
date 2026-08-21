import { NextResponse } from 'next/server'
import { claimNextJob, completeJob, failJob } from '@/lib/jobs/queue'
import { JOB_HANDLERS } from '@/lib/jobs/handlers'

export const runtime = 'nodejs'
// Vercel Pro (audit #5/#10 mechanism decision): 60s lets a claimed render/export
// finish off the request path. On Hobby this route still works when invoked, but
// its frequent cron trigger requires Pro.
export const maxDuration = 60

// ─── GET /api/cron/process-jobs — durable background-job worker (audit #5/#10) ─
// Invoked by Vercel Cron (add `{ "path": "/api/cron/process-jobs", "schedule":
// "* * * * *" }` to vercel.json ONCE Vercel Pro is active — a sub-daily cron is
// rejected on Hobby). Fail-closed CRON_SECRET guard, identical to the other
// crons. Claims pending jobs one at a time (claim_next_job uses FOR UPDATE SKIP
// LOCKED, so overlapping invocations never double-process) and dispatches by
// type to JOB_HANDLERS, bounded per run to stay inside the duration budget.
const MAX_PER_RUN = 5

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const processed: { id: string; type: string; ok: boolean }[] = []

  for (let i = 0; i < MAX_PER_RUN; i++) {
    const job = await claimNextJob()
    if (!job) break

    const handler = JOB_HANDLERS[job.type]
    if (!handler) {
      await failJob(job.id, `No handler registered for job type "${job.type}"`)
      processed.push({ id: job.id, type: job.type, ok: false })
      continue
    }

    try {
      const result = await handler(job.payload)
      await completeJob(job.id, result)
      processed.push({ id: job.id, type: job.type, ok: true })
    } catch (e) {
      // failJob re-queues while under max_attempts, else marks failed — so a
      // transient error retries and a persistent one stops (not an infinite loop).
      await failJob(job.id, e instanceof Error ? e.message : 'unknown error')
      processed.push({ id: job.id, type: job.type, ok: false })
    }
  }

  return NextResponse.json({ ok: true, processed })
}
