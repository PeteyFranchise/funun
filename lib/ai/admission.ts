import { randomUUID } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const AI_DAILY_UNIT_LIMIT = 50
export const AI_CONCURRENCY_LIMIT = 2
export const AI_PROVIDER_TIMEOUT_MS = 45_000

export type AiAdmissionDeniedReason =
  | 'duplicate'
  | 'daily_limit'
  | 'concurrency'
  | 'global_limit'
  | 'unavailable'

export type AiAdmission =
  | { allowed: true; claimId: string }
  | { allowed: false; reason: AiAdmissionDeniedReason }

type ClaimResponse = {
  allowed?: unknown
  claimId?: unknown
  reason?: unknown
}

/**
 * Claims a short, durable lease before a paid model call. The database uses
 * an advisory lock so parallel requests cannot race past either limit.
 */
export async function claimAiUsage(
  supabase: SupabaseClient,
  request: Request,
  options: {
    operation: string
    units: number
    dailyLimit?: number
    concurrencyLimit?: number
  }
): Promise<AiAdmission> {
  const suppliedKey = request.headers.get('idempotency-key')?.trim()
  const idempotencyKey = suppliedKey && UUID_RE.test(suppliedKey) ? suppliedKey : randomUUID()
  const { data, error } = await supabase.rpc('claim_ai_usage', {
    p_operation: options.operation,
    p_units: options.units,
    p_daily_limit: options.dailyLimit ?? AI_DAILY_UNIT_LIMIT,
    p_concurrency_limit: options.concurrencyLimit ?? AI_CONCURRENCY_LIMIT,
    p_idempotency_key: idempotencyKey,
    p_lease_seconds: 90,
  })

  if (error) return { allowed: false, reason: 'unavailable' }
  const result = (data ?? {}) as ClaimResponse
  if (result.allowed === true && typeof result.claimId === 'string' && UUID_RE.test(result.claimId)) {
    return { allowed: true, claimId: result.claimId }
  }
  if (
    result.reason === 'duplicate' ||
    result.reason === 'daily_limit' ||
    result.reason === 'concurrency' ||
    result.reason === 'global_limit'
  ) {
    return { allowed: false, reason: result.reason }
  }
  return { allowed: false, reason: 'unavailable' }
}

/** Releases an active concurrency lease. Usage remains counted for the day. */
export async function finishAiUsage(
  supabase: SupabaseClient,
  claimId: string,
  succeeded: boolean
): Promise<void> {
  await supabase.rpc('finish_ai_usage', {
    p_claim_id: claimId,
    p_succeeded: succeeded,
  })
}

export function aiAdmissionError(admission: Extract<AiAdmission, { allowed: false }>): {
  status: number
  error: string
} {
  if (admission.reason === 'duplicate') {
    return { status: 409, error: 'This AI request was already submitted.' }
  }
  if (admission.reason === 'daily_limit') {
    return { status: 429, error: 'Your daily AI generation limit has been reached.' }
  }
  if (admission.reason === 'concurrency') {
    return { status: 429, error: 'Another AI generation is already running. Try again shortly.' }
  }
  if (admission.reason === 'global_limit') {
    return { status: 503, error: 'AI generation is paused for the day.' }
  }
  return { status: 503, error: 'AI generation is temporarily unavailable.' }
}

export function aiProviderSignal(timeoutMs = AI_PROVIDER_TIMEOUT_MS): AbortSignal {
  return AbortSignal.timeout(timeoutMs)
}
