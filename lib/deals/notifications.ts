// Phase 16 deal-flow notification-payload builders — mirrors
// lib/social/notifications.ts's shape exactly: pure functions only, no
// Supabase client, no I/O. Callers pass the returned object's fields into
// createNotification() (lib/notifications/index.ts) as the actual DB
// write, wrapped in try/catch at the call site as a best-effort side
// effect AFTER the primary mutation (lib/social/activity-emit.ts
// convention referenced in CLAUDE.md).
//
// The notifications table's `type` column is unconstrained TEXT (same
// convention as lib/social/notifications.ts's catalog note) — these two
// new deal notification types need no migration.

import { DEAL_STAGE_LABELS, type DealStage } from './schema'

// Shape every builder returns — identical keys to lib/social/
// notifications.ts's NotificationPayload, matching createNotification()'s
// args (lib/notifications/index.ts) after actor-snapshot extension.
type NotificationPayload = {
  userId: string
  type: string
  title: string
  body?: string | null
  link?: string | null
  data?: Record<string, unknown>
  actorId: string
  actorName: string
  actorAvatarUrl: string | null
}

// ─── license_request ──────────────────────────────────────────────────────
// Fires when a buyer submits a new license request against an artist's
// project (D-15b: requests emit Phase 10 notifications). Title names the
// buyer's COMPANY, not just the individual filing it — artists always see
// which company is behind a request (D-13a). `actorId`/`actorName` are the
// individual buyer (dual-level attribution, D-13a), while `buyerCompanyName`
// drives the headline. Link points at the artist Deals room route plan
// 16-04 creates.

export function buildLicenseRequestNotification(args: {
  recipientId: string
  actorId: string
  actorName: string
  actorAvatarUrl: string | null
  buyerCompanyName: string
  projectTitle: string
  licenseRequestId: string
}): NotificationPayload {
  return {
    userId: args.recipientId,
    type: 'license_request',
    title: `${args.buyerCompanyName} submitted a license request for "${args.projectTitle}"`,
    body: `Filed by ${args.actorName} at ${args.buyerCompanyName}`,
    link: `/deals/${args.licenseRequestId}`,
    data: { licenseRequestId: args.licenseRequestId, buyerCompanyName: args.buyerCompanyName },
    actorId: args.actorId,
    actorName: args.actorName,
    actorAvatarUrl: args.actorAvatarUrl,
  }
}

// ─── deal_stage_changed ────────────────────────────────────────────────────
// Fires when a deal's D-16a pipeline stage transitions (submitted →
// in_negotiation → terms_agreed → contract → closed_won/closed_lost).
// Stage transitions are server-owned admin actions (migration 081's
// REVOKE UPDATE), so `actorId`/`actorName` identify the admin who made the
// change, not a peer the recipient necessarily already knows — mirrored
// here rather than omitted so the payload shape stays identical to every
// other builder in this codebase.

export function buildDealStageChangedNotification(args: {
  recipientId: string
  actorId: string
  actorName: string
  actorAvatarUrl: string | null
  newStage: DealStage
  projectTitle: string
  licenseRequestId: string
}): NotificationPayload {
  return {
    userId: args.recipientId,
    type: 'deal_stage_changed',
    title: `Your license deal for "${args.projectTitle}" moved to ${DEAL_STAGE_LABELS[args.newStage]}`,
    link: `/deals/${args.licenseRequestId}`,
    data: { licenseRequestId: args.licenseRequestId, stage: args.newStage },
    actorId: args.actorId,
    actorName: args.actorName,
    actorAvatarUrl: args.actorAvatarUrl,
  }
}
