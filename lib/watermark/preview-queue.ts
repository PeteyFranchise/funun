import { after } from 'next/server'
import { enqueueJob } from '@/lib/jobs/queue'
import { processPendingJobs } from '@/lib/jobs/run'

// ─── Preview render, queued (audit #5) ─────────────────────────────────────
// Replaces the old fire-and-forget `void renderPreviewIfAbsent(...)`, which a
// frozen serverless instance could silently drop and which let two concurrent
// viewers trigger two renders.
//
// - Enqueues an idempotent per-track job. The dedup index collapses concurrent
//   viewers of the same track to ONE active job (the atomic per-track claim),
//   and the Vercel Cron worker is the durable backstop once Pro is live.
// - Also drains it inline via Next's after() so the render still happens within
//   the request's invocation lifetime PRE-Pro — reliable, unlike a bare
//   unawaited promise. after() and the worker share claim_next_job's SKIP
//   LOCKED, so the single job renders exactly once regardless of which runs.
export async function queuePreviewRender(trackId: string): Promise<void> {
  await enqueueJob({
    type: 'watermark_preview',
    dedupKey: `watermark_preview:${trackId}`,
    payload: { trackId },
  })

  try {
    after(() => processPendingJobs({ type: 'watermark_preview', max: 1 }))
  } catch {
    // after() throws outside a request scope (e.g. a script). The job is still
    // enqueued for the worker, so this is safe to ignore.
  }
}
