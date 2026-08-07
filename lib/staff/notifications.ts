// Phase 25 lead/work-routing notification builders — mirrors
// lib/deals/notifications.ts's shape exactly: pure functions only, no
// Supabase client, no I/O. Callers pass the returned object's fields into
// createNotification() (lib/notifications/index.ts) as the actual DB
// write, wrapped in try/catch at the call site as a best-effort side
// effect AFTER the primary mutation (lib/social/activity-emit.ts
// convention referenced in CLAUDE.md).
//
// The notifications table's `type` column is unconstrained TEXT (same
// convention lib/deals/notifications.ts documents) — the new
// 'ae_assigned'/'lead_routed' types need no migration.
//
// Phase 23 hook (documented per this plan's own instruction, not wired
// here): the buyer-signup lead-routing call site — a new Client Partner
// (buyer_orgs) row created → resolveLeadRecipient(org, leadershipFallbackId)
// → createNotification(service, buildLeadRoutedNotification(...)) as a
// best-effort side effect AFTER the signup mutation — lands in Phase 23
// (buyer onboarding), which has not yet been executed. 25-05 wires
// buildAeAssignedNotification() after an AE (re)assignment write instead,
// since that call site exists in this phase.

// Shape every builder returns — a subset of createNotification()'s args
// (lib/notifications/index.ts): userId/type/title are required, the rest
// optional. Email fan-out (sendEmailCopy/email) is a call-site concern,
// not baked into the pure builder.
type NotificationPayload = {
  userId: string
  type: string
  title: string
  body?: string | null
  link?: string | null
  data?: Record<string, unknown>
  actorId?: string | null
}

type AeAssignmentRow = { ae_user_id: string | null }

/**
 * Resolve who should be notified/routed for a buyer org: the assigned AE
 * if one exists, else the leadership fallback id — an unassigned company
 * still routes somewhere (ROADMAP goal deliverable #4). Pure, fail-closed
 * (a missing/null org resolves to the fallback), never throws.
 */
export function resolveLeadRecipient(
  org: Pick<AeAssignmentRow, 'ae_user_id'> | null | undefined,
  leadershipFallbackId: string
): string {
  return org?.ae_user_id ?? leadershipFallbackId
}

// ─── ae_assigned ────────────────────────────────────────────────────────
// Fires when leadership (re)assigns an AE to a Client Partner (buyer_orgs)
// company (25-05's PATCH .../ae route). Title names the company so the AE
// immediately knows what landed in their queue; link points at the
// company's own admin surface (not the list view) per the behavior spec.

export function buildAeAssignedNotification(args: {
  recipientId: string
  orgId: string
  orgName: string
  actorId: string
}): NotificationPayload {
  return {
    userId: args.recipientId,
    type: 'ae_assigned',
    title: `You've been assigned as AE for ${args.orgName}`,
    body: `${args.orgName} is now in your Client Partners list.`,
    link: `/admin/client-partners/${args.orgId}`,
    data: { orgId: args.orgId, orgName: args.orgName },
    actorId: args.actorId,
  }
}

// ─── ae_unassigned ──────────────────────────────────────────────────────
// Fires alongside buildAeAssignedNotification when leadership REASSIGNS a
// Client Partner away from its current AE (25-09) — the losing AE also
// gets notified, not only the gaining one. Mirrors buildAeAssignedNotification's
// shape exactly; link still points at the company (the losing AE loses read
// access at the same write, so the link will 404/403 for them going
// forward — informational only, matches T-25-17's disposition).

export function buildAeUnassignedNotification(args: {
  recipientId: string
  orgId: string
  orgName: string
  actorId?: string | null
}): NotificationPayload {
  return {
    userId: args.recipientId,
    type: 'ae_unassigned',
    title: `A Client Partner was reassigned away from you`,
    body: `${args.orgName} is no longer in your Client Partners list.`,
    link: `/admin/client-partners/${args.orgId}`,
    data: { orgId: args.orgId, orgName: args.orgName },
    actorId: args.actorId ?? null,
  }
}

// ─── lead_routed ────────────────────────────────────────────────────────
// Fires when a new buyer-company lead lands and is routed to an employee
// (either their assigned AE, or the leadership fallback via
// resolveLeadRecipient — see the Phase 23 hook note above).

export function buildLeadRoutedNotification(args: {
  recipientId: string
  orgId: string
  orgName: string
  actorId?: string | null
}): NotificationPayload {
  return {
    userId: args.recipientId,
    type: 'lead_routed',
    title: `New lead: ${args.orgName}`,
    body: `${args.orgName} signed up and has been routed to you.`,
    link: `/admin/client-partners/${args.orgId}`,
    data: { orgId: args.orgId, orgName: args.orgName },
    actorId: args.actorId ?? null,
  }
}
