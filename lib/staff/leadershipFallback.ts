import type { SupabaseClient } from '@supabase/supabase-js'

// ─── resolveLeadershipFallback (23-04 Task 2) ──────────────────────────────
// Resolves the fallback lead-routing recipient for a brand-new buyer org
// that has no assigned AE yet (every org is born with ae_user_id = null,
// migration 090) — supplies the leadershipFallbackId argument
// resolveLeadRecipient(org, fallback) needs (lib/staff/notifications.ts).
//
// Pass a SERVICE-ROLE client — funun_staff is REVOKE-ALL from
// authenticated/anon (migration 089/091), reachable only via the service
// role. Reads the first `staff_role = 'leadership'` row's user_id.
//
// Fail-closed / never throws: mirrors createNotification's/logStaffAction's
// non-throwing convention. If the funun_staff read errors or finds no
// leadership row, resolves to null so the caller's lead-routing side effect
// degrades to a no-op rather than failing the signup it's attached to.
export async function resolveLeadershipFallback(
  service: SupabaseClient
): Promise<string | null> {
  try {
    const { data, error } = await service
      .from('funun_staff')
      .select('user_id')
      .eq('staff_role', 'leadership')
      .limit(1)
      .maybeSingle()

    if (error || !data) return null
    return (data as { user_id: string }).user_id ?? null
  } catch {
    return null
  }
}
