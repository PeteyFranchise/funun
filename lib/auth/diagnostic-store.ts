import type { SupabaseClient } from '@supabase/supabase-js'
import {
  AUTH_DIAGNOSTIC_STAGE,
  AuthDiagnosticSchema,
  type AuthDiagnosticEvent,
} from '@/lib/auth/diagnostics'

export async function recordAuthDiagnosticEvent(
  service: SupabaseClient,
  input: AuthDiagnosticEvent
): Promise<boolean> {
  const parsed = AuthDiagnosticSchema.safeParse(input)
  if (!parsed.success) return false

  try {
    const { error } = await service.from('auth_diagnostic_events').insert({
      correlation_id: parsed.data.correlationId,
      event_code: parsed.data.eventCode,
      stage: AUTH_DIAGNOSTIC_STAGE[parsed.data.eventCode],
      surface: parsed.data.surface,
      workspace_intent: parsed.data.workspaceIntent,
      runtime: parsed.data.runtime,
    })
    if (error) return false

    // Bounded retention is best-effort and never allowed to interfere with the
    // authentication flow this telemetry exists to observe.
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    await service.from('auth_diagnostic_events').delete().lt('created_at', cutoff)
    return true
  } catch {
    return false
  }
}
