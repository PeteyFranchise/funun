import type { SupabaseClient } from '@supabase/supabase-js'
import { createNotification } from '@/lib/notifications'
import type { StaffRole } from '@/lib/admin/staff-role'

// ─── Team-tier lead staff fan-out notification (quick task 261004-ttq) ────
// Notifies EVERY staff member holding 'bd' or 'leadership' when a /team-fit
// submission routes to BD — never a single arbitrary pick. This is the
// fan-out fix for the exact bug lib/staff/leadershipFallback.ts's
// resolveLeadershipFallback() has (an un-ordered .limit(1) that picks one
// arbitrary leadership row); this module is independent of that helper and
// does not call it.
//
// funun_staff is REVOKE-ALL from authenticated/anon (migration 089/091) —
// every caller must pass a SERVICE-ROLE client.

type NotificationPayload = {
  userId: string
  type: string
  title: string
  body?: string | null
  link?: string | null
  data?: Record<string, unknown>
  actorId?: string | null
}

const BD_LEAD_STAFF_ROLES: StaffRole[] = ['bd', 'leadership']

type FununStaffRow = { user_id: string; staff_role: string | null; staff_roles: string[] | null }

// Pure, mirrors lib/staff/notifications.ts's buildAeAssignedNotification()
// shape exactly. link points at the list page — no detail page exists, and
// inventing one is out of scope for this plan.
export function buildTeamTierLeadNotification(args: {
  recipientId: string
  leadId: string
  seatAnswerLabel: string
}): NotificationPayload {
  return {
    userId: args.recipientId,
    type: 'team_tier_lead',
    title: `New Team-tier lead: ${args.seatAnswerLabel}`,
    link: '/admin/team-tier-leads',
    data: { leadId: args.leadId },
  }
}

// Queries funun_staff, computes each row's effective role set using the
// same multi-role-then-legacy precedence lib/admin/staff-role.ts applies to
// app_metadata (staff_roles array wins when present and non-empty, else the
// legacy single staff_role), filters to rows whose effective set
// intersects ['bd','leadership'], dedupes by user_id. Fail-closed to []
// on any query error — never throws.
export async function resolveTeamTierBdStaff(
  service: SupabaseClient
): Promise<{ userId: string }[]> {
  try {
    const { data, error } = await service
      .from('funun_staff')
      .select('user_id, staff_role, staff_roles')
    if (error || !data) return []

    const seen = new Set<string>()
    const recipients: { userId: string }[] = []
    for (const row of data as FununStaffRow[]) {
      const effectiveRoles =
        Array.isArray(row.staff_roles) && row.staff_roles.length > 0
          ? row.staff_roles
          : row.staff_role
            ? [row.staff_role]
            : []
      const isBdOrLeadership = effectiveRoles.some(role =>
        (BD_LEAD_STAFF_ROLES as string[]).includes(role)
      )
      if (!isBdOrLeadership) continue
      if (seen.has(row.user_id)) continue
      seen.add(row.user_id)
      recipients.push({ userId: row.user_id })
    }
    return recipients
  } catch {
    return []
  }
}

// Orchestrator: resolves every bd/leadership staff member, then notifies
// EACH ONE (never just the first) — each recipient's email lookup +
// notification insert is wrapped in its OWN try/catch so one bad lookup or
// one failed insert never blocks the others. The whole function never
// throws (best-effort, called after the lead row is already durably
// inserted — a notification failure must never undo or appear to undo the
// submission).
export async function notifyTeamTierLeadStaff(
  service: SupabaseClient,
  lead: { id: string; seatAnswerLabel: string }
): Promise<void> {
  const recipients = await resolveTeamTierBdStaff(service)

  for (const recipient of recipients) {
    try {
      let email: string | null = null
      try {
        const { data } = await service.auth.admin.getUserById(recipient.userId)
        email = data?.user?.email ?? null
      } catch {
        email = null
      }

      const notification = buildTeamTierLeadNotification({
        recipientId: recipient.userId,
        leadId: lead.id,
        seatAnswerLabel: lead.seatAnswerLabel,
      })

      await createNotification(service, {
        ...notification,
        email,
        sendEmailCopy: !!email,
      })
    } catch {
      // Best-effort — swallow. One recipient's failure must never drop the
      // others, and the fan-out must never fail the caller's response.
    }
  }
}
