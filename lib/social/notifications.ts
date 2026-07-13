// Phase 10 notification-type catalog + per-type payload builders.
//
// Pure functions only — no Supabase client, no I/O. Callers pass the
// returned object's fields into createNotification() (lib/notifications/
// index.ts) as the actual DB write, wrapped in try/catch at the call site
// per this codebase's established best-effort side-effect convention
// (see lib/social/activity-emit.ts).
//
// Suppression note (RESEARCH Open Question #1): accepting a connection
// request auto-seeds two `follows` rows via a DB trigger (migration 044).
// Those trigger-seeded follow rows do NOT get a `new_follower` builder
// call — only `buildConnectionAcceptedNotification()` fires (to the
// original requester). Firing `new_follower` for both auto-seeded follows
// in addition to `connection_accepted` would produce 3 notifications from
// a single accept action, which reads as notification spam.

// ─── Notification type catalog ──────────────────────────────────────────
// Keep `type` a plain string at the DB layer (no enum/CHECK) per RESEARCH
// Pattern 3 — this catalog is the TypeScript-layer safety net, extensible
// by Phase 11 appending message_request/new_dm.
export const NOTIFICATION_TYPES = {
  new_follower: { icon: 'user-plus', inlineAction: null },
  connection_request: { icon: 'link', inlineAction: 'connection_respond' },
  connection_accepted: { icon: 'check', inlineAction: null },
  wall_post: { icon: 'message-square', inlineAction: null },
  endorsement: { icon: 'star', inlineAction: null },
  release_comment: { icon: 'message-circle', inlineAction: null },
  // Pre-existing types (lib/matching/run.ts, opportunity apply flow) — kept
  // in the catalog so the panel can render them too.
  antenna_match: { icon: 'radio', inlineAction: null },
  application_received: { icon: 'inbox', inlineAction: null },
} as const

export type NotificationType = keyof typeof NOTIFICATION_TYPES

// Shape every builder returns — matches createNotification()'s args
// (lib/notifications/index.ts), post actor-snapshot extension (Task 4).
type NotificationPayload = {
  userId: string
  type: NotificationType
  title: string
  body?: string | null
  link?: string | null
  data?: Record<string, unknown>
  actorId: string
  actorName: string
  actorAvatarUrl: string | null
}

// ─── new_follower ────────────────────────────────────────────────────────

export function buildNewFollowerNotification(args: {
  recipientId: string
  actorId: string
  actorName: string
  actorAvatarUrl: string | null
  actorHandle: string
}): NotificationPayload {
  return {
    userId: args.recipientId,
    type: 'new_follower',
    title: `${args.actorName} started following you`,
    link: `/u/${args.actorHandle}`,
    actorId: args.actorId,
    actorName: args.actorName,
    actorAvatarUrl: args.actorAvatarUrl,
  }
}

// ─── connection_request ─────────────────────────────────────────────────

export function buildConnectionRequestNotification(args: {
  recipientId: string
  actorId: string
  actorName: string
  actorAvatarUrl: string | null
  actorHandle: string
  note: string | null
  connectionId: string
}): NotificationPayload {
  return {
    userId: args.recipientId,
    type: 'connection_request',
    title: `${args.actorName} sent you a connection request`,
    body: args.note ?? null,
    link: `/u/${args.actorHandle}`,
    data: { connectionId: args.connectionId },
    actorId: args.actorId,
    actorName: args.actorName,
    actorAvatarUrl: args.actorAvatarUrl,
  }
}

// ─── connection_accepted ─────────────────────────────────────────────────

export function buildConnectionAcceptedNotification(args: {
  recipientId: string
  actorId: string
  actorName: string
  actorAvatarUrl: string | null
  actorHandle: string
}): NotificationPayload {
  return {
    userId: args.recipientId,
    type: 'connection_accepted',
    title: `${args.actorName} accepted your connection request`,
    link: `/u/${args.actorHandle}`,
    actorId: args.actorId,
    actorName: args.actorName,
    actorAvatarUrl: args.actorAvatarUrl,
  }
}

// ─── wall_post ───────────────────────────────────────────────────────────

export function buildWallPostNotification(args: {
  recipientId: string
  actorId: string
  actorName: string
  actorAvatarUrl: string | null
  ownHandle: string
}): NotificationPayload {
  return {
    userId: args.recipientId,
    type: 'wall_post',
    title: `${args.actorName} posted on your wall`,
    link: `/u/${args.ownHandle}#wall`,
    actorId: args.actorId,
    actorName: args.actorName,
    actorAvatarUrl: args.actorAvatarUrl,
  }
}

// ─── endorsement ─────────────────────────────────────────────────────────

export function buildEndorsementNotification(args: {
  recipientId: string
  actorId: string
  actorName: string
  actorAvatarUrl: string | null
  ownHandle: string
}): NotificationPayload {
  return {
    userId: args.recipientId,
    type: 'endorsement',
    title: `${args.actorName} endorsed you`,
    link: `/u/${args.ownHandle}#endorsements`,
    actorId: args.actorId,
    actorName: args.actorName,
    actorAvatarUrl: args.actorAvatarUrl,
  }
}

// ─── release_comment ─────────────────────────────────────────────────────

export function buildReleaseCommentNotification(args: {
  recipientId: string
  actorId: string
  actorName: string
  actorAvatarUrl: string | null
  projectId: string
  trackTitle: string
}): NotificationPayload {
  return {
    userId: args.recipientId,
    type: 'release_comment',
    title: `${args.actorName} commented on "${args.trackTitle}"`,
    link: `/r/${args.projectId}#comments`,
    actorId: args.actorId,
    actorName: args.actorName,
    actorAvatarUrl: args.actorAvatarUrl,
  }
}

// ─── mark-all-read mutation scoping (NOTIF-03) ──────────────────────────
// Pure query-shape helper consumed by Plan 03's PATCH /api/notifications
// route. Kept here (not inline in the route) so it is unit-testable
// without mocking a Supabase client.
export function buildMarkAllReadFilter(userId: string): { user_id: string; read: false } {
  return { user_id: userId, read: false }
}

// ─── notification pagination cursor (NOTIF-03 / D-11) ───────────────────
// `created_at` alone is not unique under burst inserts, so cursor pagination
// must include `id` as a deterministic tiebreaker to avoid skipping siblings
// that share the boundary timestamp.
export type NotificationPageCursor = {
  before: string
  beforeId: string
}

export function buildNotificationCursorPredicate(cursor: NotificationPageCursor): string {
  return `created_at.lt.${cursor.before},and(created_at.eq.${cursor.before},id.lt.${cursor.beforeId})`
}
