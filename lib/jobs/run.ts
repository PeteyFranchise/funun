import { claimNextJob, completeJob, failJob } from '@/lib/jobs/queue'
import { JOB_HANDLERS } from '@/lib/jobs/handlers'

// ─── Shared job runner (audit #5/#10) ─────────────────────────────────────
// Claim + run pending jobs until the queue (optionally filtered to one type) is
// empty or `max` is reached. Used by BOTH the Vercel Cron worker route and the
// inline after() drains that keep features working pre-Pro. claim_next_job uses
// FOR UPDATE SKIP LOCKED, so a cron run and an inline drain never claim the same
// job — each job renders/assembles exactly once.

export type JobOutcome = { id: string; type: string; ok: boolean }

export async function processPendingJobs(opts?: {
  type?: string
  max?: number
}): Promise<JobOutcome[]> {
  const max = opts?.max ?? 5
  const processed: JobOutcome[] = []

  for (let i = 0; i < max; i++) {
    const job = await claimNextJob(opts?.type)
    if (!job) break

    const handler = JOB_HANDLERS[job.type]
    if (!job.claim_token) {
      throw new Error(`Claimed job ${job.id} has no claim token`)
    }
    if (!handler) {
      await failJob(job.id, job.claim_token, `No handler registered for job type "${job.type}"`)
      processed.push({ id: job.id, type: job.type, ok: false })
      continue
    }

    try {
      const result = await handler(job.payload)
      await completeJob(job.id, job.claim_token, result)
      processed.push({ id: job.id, type: job.type, ok: true })
    } catch (e) {
      // failJob re-queues while under max_attempts, else marks failed — a
      // transient error retries, a persistent one stops (no infinite loop).
      await failJob(job.id, job.claim_token, e instanceof Error ? e.message : 'unknown error')
      processed.push({ id: job.id, type: job.type, ok: false })
    }
  }

  return processed
}
