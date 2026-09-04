import { after } from 'next/server'
import { enqueueJob } from '@/lib/jobs/queue'
import { processPendingJobs } from '@/lib/jobs/run'

/** Enqueue first; inline-after is only the low-latency drain, never durability. */
export async function queueLyricLift(liftId: string): Promise<{ id: string } | null> {
  const job = await enqueueJob({
    type: 'lyric_lift',
    payload: { liftId },
    dedupKey: `lyric-lift:${liftId}`,
  })
  if (!job) return null

  try {
    after(() => processPendingJobs({ type: 'lyric_lift', max: 1 }))
  } catch {
    // Outside a request scope the durable cron still owns the queued job.
  }
  return job
}
