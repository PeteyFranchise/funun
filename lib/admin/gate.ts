import { createApiClient } from '@/lib/supabase/server'

// ─── Admin auth gate ────────────────────────────────────────────────────
// Must run on every /api/admin/* handler before createServiceClient() is
// invoked. Returns { error, status } if the caller is not an admin, { user }
// if the gate passes.
//
// T-05-02: verifyAdmin() provides the per-route auth check so that the
// layout redirect alone is not relied upon as the authority decision.
type VerifyAdminResult =
  | { error: 'Unauthorized'; status: 401 }
  | { error: 'Forbidden'; status: 403 }
  | {
      user: NonNullable<
        Awaited<ReturnType<Awaited<ReturnType<typeof createApiClient>>['auth']['getUser']>>['data']['user']
      >
    }

export async function verifyAdmin(): Promise<VerifyAdminResult> {
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401 }
  const isAdmin = (user.app_metadata as { is_admin?: boolean })?.is_admin === true
  if (!isAdmin) return { error: 'Forbidden', status: 403 }
  return { user }
}

// ─── Shared constants ────────────────────────────────────────────────────

// Mass-assignment protection: only these fields may be written via PATCH.
export const EDITABLE_FIELDS = [
  'label',
  'section',
  'action_type',
  'action_href',
  'action_label',
  'sort_order',
] as const

export type EditableField = (typeof EDITABLE_FIELDS)[number]

export const SECTION_VALUES = [
  'before_release',
  'week_1',
  'week_2',
  'weeks_3_4',
] as const

export const ACTION_TYPE_VALUES = ['internal_tool', 'external_url'] as const

// itemKey is used directly in a WHERE clause — must be constrained.
// T-05-08: regex prevents SQL injection via the key path param.
export const KEY_REGEX = /^[a-z0-9_]+$/
