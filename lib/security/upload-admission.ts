import { randomUUID } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type UploadAdmission =
  | { allowed: true; claimId: string }
  | { allowed: false; status: number; error: string }

export async function claimUploadAdmission(
  supabase: SupabaseClient,
  request: Request,
  options: {
    operation: string
    maxBodyBytes: number
    dailyCountLimit: number
    dailyByteLimit: number
  }
): Promise<UploadAdmission> {
  const declaredBytes = Number(request.headers.get('content-length'))
  if (!Number.isSafeInteger(declaredBytes) || declaredBytes <= 0) {
    return { allowed: false, status: 411, error: 'A valid Content-Length header is required.' }
  }
  if (declaredBytes > options.maxBodyBytes) {
    return { allowed: false, status: 413, error: 'Upload body is too large.' }
  }

  return claimDeclaredUploadAdmission(supabase, request, {
    operation: options.operation,
    declaredBytes,
    maxBytes: options.maxBodyBytes,
    dailyCountLimit: options.dailyCountLimit,
    dailyByteLimit: options.dailyByteLimit,
  })
}

export async function claimDeclaredUploadAdmission(
  supabase: SupabaseClient,
  request: Request,
  options: {
    operation: string
    declaredBytes: number
    maxBytes: number
    dailyCountLimit: number
    dailyByteLimit: number
  }
): Promise<UploadAdmission> {
  if (
    !Number.isSafeInteger(options.declaredBytes) ||
    options.declaredBytes <= 0 ||
    options.declaredBytes > options.maxBytes
  ) {
    return { allowed: false, status: 413, error: 'Upload body is too large.' }
  }

  const suppliedKey = request.headers.get('idempotency-key')?.trim()
  const idempotencyKey = suppliedKey && UUID_RE.test(suppliedKey) ? suppliedKey : randomUUID()
  const { data, error } = await supabase.rpc('claim_upload_admission', {
    p_operation: options.operation,
    p_declared_bytes: options.declaredBytes,
    p_daily_count_limit: options.dailyCountLimit,
    p_daily_byte_limit: options.dailyByteLimit,
    p_concurrency_limit: 2,
    p_idempotency_key: idempotencyKey,
  })
  if (error) {
    return { allowed: false, status: 503, error: 'Uploads are temporarily unavailable.' }
  }

  const result = (data ?? {}) as { allowed?: unknown; claimId?: unknown; reason?: unknown }
  if (result.allowed === true && typeof result.claimId === 'string' && UUID_RE.test(result.claimId)) {
    return { allowed: true, claimId: result.claimId }
  }
  if (result.reason === 'duplicate') {
    return { allowed: false, status: 409, error: 'This upload request was already submitted.' }
  }
  if (result.reason === 'daily_limit') {
    return { allowed: false, status: 429, error: 'Your daily upload limit has been reached.' }
  }
  if (result.reason === 'concurrency') {
    return { allowed: false, status: 429, error: 'Another upload is already being received.' }
  }
  return { allowed: false, status: 503, error: 'Uploads are temporarily unavailable.' }
}

export async function finishUploadAdmission(
  supabase: SupabaseClient,
  claimId: string
): Promise<void> {
  await supabase.rpc('finish_upload_admission', { p_claim_id: claimId })
}

export async function parseAdmittedFormData(
  supabase: SupabaseClient,
  request: Request,
  options: Parameters<typeof claimUploadAdmission>[2]
): Promise<{ ok: true; form: FormData } | { ok: false; status: number; error: string }> {
  const admission = await claimUploadAdmission(supabase, request, options)
  if (!admission.allowed) return { ok: false, status: admission.status, error: admission.error }

  try {
    return { ok: true, form: await request.formData() }
  } catch {
    return { ok: false, status: 400, error: 'Invalid multipart upload.' }
  } finally {
    await finishUploadAdmission(supabase, admission.claimId)
  }
}
