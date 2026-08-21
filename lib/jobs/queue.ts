import { createServiceClient } from '@/lib/supabase/server'

// ─── Durable background-job queue (audit #5 / #10) ────────────────────────
// Thin helpers over the `jobs` table + claim_next_job RPC (migration 118).
// Everything runs under the service role. Heavy work is enqueued from a request
// and executed off the request path by the Vercel Cron worker route.

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed'

export type Job = {
  id: string
  type: string
  status: JobStatus
  dedup_key: string | null
  payload: Record<string, unknown>
  result: Record<string, unknown> | null
  attempts: number
  max_attempts: number
}

// Enqueue idempotently. With a dedupKey, the partial unique index rejects a
// second ACTIVE (pending/processing) job for the same key — we return the
// existing job's id instead of erroring, so two callers enqueue ONE job.
export async function enqueueJob(input: {
  type: string
  payload?: Record<string, unknown>
  dedupKey?: string
}): Promise<{ id: string } | null> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('jobs')
    .insert({ type: input.type, payload: input.payload ?? {}, dedup_key: input.dedupKey ?? null })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505' && input.dedupKey) {
      const { data: existing } = await service
        .from('jobs')
        .select('id')
        .eq('dedup_key', input.dedupKey)
        .in('status', ['pending', 'processing'])
        .maybeSingle()
      return existing ? { id: (existing as { id: string }).id } : null
    }
    return null
  }
  return data as { id: string }
}

// Atomically claim the next pending job (optionally of one type) — flips it to
// 'processing' and bumps attempts. Returns null when the queue is empty.
export async function claimNextJob(type?: string): Promise<Job | null> {
  const service = createServiceClient()
  const { data, error } = await service.rpc('claim_next_job', { p_type: type ?? null })
  if (error || !data) return null
  const row = Array.isArray(data) ? data[0] : data
  return (row as Job) ?? null
}

export async function completeJob(id: string, result: Record<string, unknown>): Promise<void> {
  const service = createServiceClient()
  await service
    .from('jobs')
    .update({ status: 'completed', result, finished_at: new Date().toISOString() })
    .eq('id', id)
}

// Re-queue for another attempt when under max_attempts (attempts was already
// incremented at claim time), otherwise mark failed. Either way the last error
// is recorded in result.
export async function failJob(id: string, message: string): Promise<void> {
  const service = createServiceClient()
  const { data } = await service.from('jobs').select('attempts, max_attempts').eq('id', id).maybeSingle()
  const row = data as { attempts: number; max_attempts: number } | null

  if (row && row.attempts < row.max_attempts) {
    await service
      .from('jobs')
      .update({ status: 'pending', started_at: null, result: { error: message } })
      .eq('id', id)
    return
  }

  await service
    .from('jobs')
    .update({ status: 'failed', result: { error: message }, finished_at: new Date().toISOString() })
    .eq('id', id)
}

// Read a job's current state (for the ownership-checked client status route).
export async function getJob(id: string): Promise<Job | null> {
  const service = createServiceClient()
  const { data } = await service.from('jobs').select('*').eq('id', id).maybeSingle()
  return (data as Job) ?? null
}
