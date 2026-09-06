import type { SupabaseClient } from '@supabase/supabase-js'

// ─── D-56 / WS-31 — the platform-wide workspace-access kill switch ────────
// Read/write layer for public.workspace_access_config (migration 186,
// section (a)) — a true singleton (`id BOOLEAN PRIMARY KEY CHECK (id)`)
// that `workspace_access_enabled()` consults on every workspace RLS branch
// evaluation across `vault_projects` and its four child tables. Mirrors
// lib/client-partners/health-rules-config.ts's singleton-locator shape and
// lib/staff/audit.ts's service-role-only posture: migration 186 REVOKEs
// SELECT/INSERT/UPDATE/DELETE on this table from `authenticated`/`anon`, so
// EVERY function here must be called with a SERVICE-ROLE client — a session
// client cannot reach this table at all, by construction.
//
// `setWorkspaceAccessEnabled` is the ONLY writer, and it never INSERTs a
// second row — the `CHECK (id)` constraint already forbids more than one,
// but this module additionally never attempts an INSERT at all; it only
// ever UPDATEs the single row migration 186 seeds. An UPDATE that touches
// zero rows means the singleton row itself is missing (a state that should
// never occur after that seed insert) and this module THROWS rather than
// silently no-op-ing, so a caller can never mistake "nothing happened" for
// "the flip succeeded."

export type WorkspaceAccessState = {
  enabled: boolean
  disabledReason: string | null
  disabledBy: string | null
  disabledAt: string | null
}

type ConfigRow = {
  enabled: boolean
  disabled_reason: string | null
  disabled_by: string | null
  disabled_at: string | null
}

function toState(row: ConfigRow): WorkspaceAccessState {
  return {
    enabled: row.enabled,
    disabledReason: row.disabled_reason,
    disabledBy: row.disabled_by,
    disabledAt: row.disabled_at,
  }
}

const CONFIG_COLUMNS = 'enabled, disabled_reason, disabled_by, disabled_at'

/**
 * Reads the current state of the platform-wide workspace-access control.
 * Throws if the singleton row cannot be read or is missing — there is no
 * legitimate "empty" state for this table to be in after migration 186 has
 * run, so a missing row is a configuration error, not a normal case for a
 * caller to branch on silently.
 */
export async function readWorkspaceAccessState(
  service: SupabaseClient
): Promise<WorkspaceAccessState> {
  const { data, error } = await service
    .from('workspace_access_config')
    .select(CONFIG_COLUMNS)
    .eq('id', true)
    .maybeSingle()

  if (error) throw new Error(`Failed to read workspace access config: ${error.message}`)
  if (!data) throw new Error('Workspace access config row is missing')

  return toState(data as ConfigRow)
}

/**
 * The single writer for the D-56/WS-31 kill switch. Disabling REQUIRES a
 * non-empty `reason` — this control disables a platform-wide access layer,
 * and a flip with no recorded reason is not acceptable at that severity.
 * Re-enabling clears `disabled_reason`/`disabled_by`/`disabled_at` back to
 * null so the config row never carries stale "why it was off" state while
 * `enabled` reads true.
 */
export async function setWorkspaceAccessEnabled(
  service: SupabaseClient,
  args: { enabled: boolean; reason?: string | null; actorUserId: string }
): Promise<WorkspaceAccessState> {
  const { enabled, actorUserId } = args
  const reason = (args.reason ?? '').trim()

  if (!enabled && reason.length === 0) {
    throw new Error('A reason is required to disable workspace access')
  }

  const now = new Date().toISOString()

  const update = enabled
    ? {
        enabled: true,
        disabled_reason: null,
        disabled_by: null,
        disabled_at: null,
        updated_at: now,
      }
    : {
        enabled: false,
        disabled_reason: reason,
        disabled_by: actorUserId,
        disabled_at: now,
        updated_at: now,
      }

  const { data, error } = await service
    .from('workspace_access_config')
    .update(update)
    .eq('id', true)
    .select(CONFIG_COLUMNS)
    .maybeSingle()

  if (error) throw new Error(`Failed to update workspace access config: ${error.message}`)
  if (!data) throw new Error('Workspace access config row is missing')

  return toState(data as ConfigRow)
}
