import { randomBytes, createHash } from 'crypto'
import { isTimeBoxedRole } from '@/lib/workspaces/membership'
import type { WorkspaceInvitationState, WorkspaceRole } from '@/lib/workspaces/types'

// ─── Pure workspace invitation token, expiry and eligibility logic (D-12, D-51) ─
// Pure, zero-I/O module — Node's `crypto` is the only import outside this
// domain's own types. No Supabase client, no network call, no side effects
// (style precedent: lib/workspaces/membership.ts, lib/staff/scope.ts).
//
// The raw invitation token is NEVER persisted — only its sha256 digest
// reaches `workspace_invitations.token_hash` (migration 182 section (c)).
// The route that inserts a row calls hashInvitationToken() to compute what
// it stores, and calls createInvitationToken() to mint what it emails; the
// two calls exist so the raw token only ever passes through memory and the
// outbound email, never a SELECT.
//
// A pending invitation grants NOTHING and binds only on acceptance by the
// recipient's own authenticated session (D-12) — this module has no notion
// of "who accepted", that binding lives entirely in the accept route
// (plan 38-06 Task 3), keyed off `auth.getUser()`, never a body value.
//
// Funūn never auto-provisions an account from an invitation, because that
// collides with the Phase 27 invite-only gate and the `handle_new_user()`
// signup trigger — neither is touched by this phase. An unregistered
// address simply leaves its invitation pending until that person signs up
// themselves through the ordinary Phase 27 flow.

// ─── Token minting + hashing ────────────────────────────────────────────

/**
 * Mints a fresh invitation token and its paired sha256 digest. The raw
 * `token` is what goes in the emailed accept link; only `tokenHash` is
 * ever written to a database row.
 */
export function createInvitationToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url')
  return { token, tokenHash: hashInvitationToken(token) }
}

/**
 * Stable sha256 hex digest of a raw invitation token, so the accept route
 * can look up `workspace_invitations` by `token_hash` without ever storing
 * or re-deriving the raw token itself.
 */
export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

// ─── Redemption eligibility ─────────────────────────────────────────────

/**
 * True only for a `pending` invitation whose `expiresAt` is strictly after
 * `now`. Every other status (`accepted`, `refused`, `revoked`, `expired`)
 * is false, and a `pending` invitation whose expiry has already passed is
 * also false — expiry is evaluated on read, not by a scheduled sweep.
 */
export function isInvitationRedeemable(args: {
  status: WorkspaceInvitationState
  expiresAt: Date | string | number
  now: Date | string | number
}): boolean {
  if (args.status !== 'pending') return false
  const expiresAtMs = new Date(args.expiresAt).getTime()
  const nowMs = new Date(args.now).getTime()
  if (!Number.isFinite(expiresAtMs) || !Number.isFinite(nowMs)) return false
  return expiresAtMs > nowMs
}

// ─── Expiry window (D-51) ───────────────────────────────────────────────

const TIME_BOXED_ROLE_EXPIRY_DAYS = 7
const STANDING_ROLE_EXPIRY_DAYS = 14
const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Returns the finite expiry timestamp an invitation for `role` should
 * carry, measured from `now`. A time-boxed role (contractor, D-11) gets a
 * shorter window than a standing role — 7 and 14 days respectively. Both
 * numbers are Claude's-discretion values under D-51's "expire if
 * unaccepted" requirement and are tuned in beta; nothing is ever issued
 * without SOME finite expiry.
 */
export function resolveInvitationExpiry(args: { role: WorkspaceRole; now: Date | string | number }): Date {
  const days = isTimeBoxedRole(args.role) ? TIME_BOXED_ROLE_EXPIRY_DAYS : STANDING_ROLE_EXPIRY_DAYS
  const nowMs = new Date(args.now).getTime()
  return new Date(nowMs + days * MS_PER_DAY)
}

// ─── Email normalization ────────────────────────────────────────────────

// Same shape as lib/invites/schema.ts and lib/buyers/register.ts's
// EMAIL_REGEX — the house convention for "good enough, not an RFC 5322
// parser" address validation.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Trims and lowercases an invited address. Returns null for an empty or
 * malformed address — an explicit refusal, so a route never inserts an
 * empty-string invited_email by accident.
 */
export function normalizeInvitedEmail(raw: string): string | null {
  const normalized = raw.trim().toLowerCase()
  if (!normalized || !EMAIL_REGEX.test(normalized)) return null
  return normalized
}

// ─── Rate limiting (D-51) ───────────────────────────────────────────────

/**
 * Per-workspace invitation issuance limit, consumed by the issuance route
 * via `checkRateLimit('workspace-invite:' + workspaceId, INVITATION_RATE_LIMIT)`
 * so the magic numbers live beside the logic that governs them, not inline
 * in the route.
 */
export const INVITATION_RATE_LIMIT = {
  windowMs: 60 * 60 * 1000,
  maxAttempts: 20,
} as const
