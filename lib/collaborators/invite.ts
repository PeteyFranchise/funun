import { generateApprovalToken, APPROVAL_TOKEN_EXPIRY_DAYS } from '@/lib/split-sheets/approval'
import { sendEmail } from '@/lib/email'
import { esc } from '@/lib/email/esc'
import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Shared collaborator-invite mechanics ────────────────────────────────
// Extracted out of app/api/collaborators/[id]/invite/route.ts (260825-i4i)
// so a second caller (the quick-invite route) can send the exact same
// educational IPI-invite email and reuse the exact same 60s-cooldown /
// token-insert / best-effort-send logic, rather than a second, drifting
// copy of it.
//
// M6 (27-CODEX-REVIEW.md): collaborator.name is artist-entered, user-
// controlled free text and was previously interpolated into this email's
// HTML body unescaped — an artist could plant markup/script in a
// collaborator's name field that would render in the recipient's mail
// client. Every interpolated value below is escaped via lib/email/esc.ts
// (the same helper the branded artistInvite/artistSpotOpened/
// artistReopened templates use). That escaping rationale moves here with
// the email builder — it now lives at the point where the values are
// actually interpolated.

// ─── URL builders ─────────────────────────────────────────────────────────

/**
 * Strips a trailing slash off NEXT_PUBLIC_APP_URL the same way approveUrl
 * in lib/split-sheets/esign-invite.ts does. A missing base URL yields a
 * relative path rather than the string "undefined/…" — a broken link is
 * recoverable, a link that visibly reads "undefined" destroys the trust
 * signal this message depends on.
 */
function appBase(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/+$/, '')
}

/** Builds the artist-facing signup link a collaborator uses to claim their profile. */
export function buildCollaboratorInviteUrl(token: string): string {
  return `${appBase()}/signup?invite=${token}`
}

/** Builds the read-only "view my collaborator profile" link. */
export function buildCollaboratorJoinUrl(token: string): string {
  return `${appBase()}/join/${token}`
}

// ─── Email builder ─────────────────────────────────────────────────────────

export type CollaboratorInviteEmail = { subject: string; html: string; text: string }

/**
 * Renders the educational IPI-invite email body. Pure — reads only its
 * input, touches no network, and never throws. Moved byte-for-byte from
 * the item route, including every esc() call and the
 * APPROVAL_TOKEN_EXPIRY_DAYS expiry footnote.
 */
export function buildCollaboratorInviteEmail(input: {
  name: string
  token: string
}): CollaboratorInviteEmail {
  const inviteUrl = buildCollaboratorInviteUrl(input.token)

  // M6: escape every interpolated value before it lands in the HTML body —
  // collaborator.name is artist-entered free text; inviteUrl embeds a
  // generated token but is escaped defensively too (esc() is a no-op on an
  // already-safe input).
  const safeName = esc(input.name)
  const safeInviteUrl = esc(inviteUrl)

  return {
    subject: `You've been added as a collaborator on Funūn — claim your profile`,
    html: `
      <h2>Hi ${safeName},</h2>
      <p>An artist has added you as a collaborator on <strong>Funūn</strong>.</p>
      <p>Claim your profile to review your credits, keep your rights information accurate, and collaborate on songs in one place.</p>

      <p><a href="${safeInviteUrl}" style="display:inline-block;padding:12px 22px;background:#818CF8;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Claim my Funūn profile</a></p>

      <p><strong>Why your profile matters:</strong> Your legal name, PRO, and IPI/CAE number help connect your credits and royalties to the right person. You can add or update those details after signing in.</p>

      <p style="color:#888;font-size:12px">This link expires in ${APPROVAL_TOKEN_EXPIRY_DAYS} days.</p>
    `,
    text: [
      `Hi ${input.name},`,
      '',
      'An artist has added you as a collaborator on Funūn.',
      '',
      'Claim your profile to review your credits, keep your rights information accurate, and collaborate on songs in one place.',
      '',
      `Claim my Funūn profile: ${inviteUrl}`,
      '',
      'Your legal name, PRO, and IPI/CAE number help connect your credits and royalties to the right person. You can add or update those details after signing in.',
      '',
      `This link expires in ${APPROVAL_TOKEN_EXPIRY_DAYS} days.`,
    ].join('\n'),
  }
}

// ─── Send helper ─────────────────────────────────────────────────────────

export type CollaboratorInviteResult =
  | { ok: false; status: number; error: string }
  | { ok: true; inviteLink: string; emailSent: boolean; skipped: boolean }

/**
 * Sends (or best-effort re-sends) an educational IPI-invite email for a
 * collaborator, and always hands the caller back a usable
 * /signup?invite=<token> link — because a failed or unconfigured email
 * send must never read as a failed invite (Resend is currently down in
 * prod: invalid API key + unverified sender).
 *
 * `supabase` is the caller's already-authenticated client — ownership of
 * the collaborator row is proven by the caller BEFORE this function runs
 * (the item route filters `.eq('user_id', user.id)`; the quick-invite
 * route creates/reuses a row it already scoped to `user.id`). This
 * function does not re-check ownership; it trusts the caller's query.
 */
export async function sendCollaboratorInvite(
  supabase: SupabaseClient,
  input: {
    collaborator: { id: string; name: string; email: string | null }
    invitingUserId: string
  }
): Promise<CollaboratorInviteResult> {
  const { collaborator, invitingUserId } = input

  // ── 1. Require email — cannot invite without an address ──────────────
  if (!collaborator.email) {
    return {
      ok: false,
      status: 400,
      error: 'A collaborator email address is required to send an invite',
    }
  }

  // ── 2. Short cooldown — a light guard against accidental double-sends only.
  //      A deliberate "Resend invite" (>60s later) DOES re-send: artists
  //      legitimately need to nudge a collaborator who missed the first email
  //      (was a 24h silent block — T-01-15/Pitfall 4 — relaxed for resend UX).
  const since = new Date(Date.now() - 60 * 1000).toISOString()
  const { data: recentInvite } = await supabase
    .from('collaborator_invites')
    .select('id, invite_token')
    .eq('collaborator_id', collaborator.id)
    .eq('inviting_user_id', invitingUserId)
    .gte('sent_at', since)
    .maybeSingle()

  if (recentInvite) {
    return {
      ok: true,
      skipped: true,
      emailSent: false,
      inviteLink: buildCollaboratorInviteUrl(
        (recentInvite as { invite_token: string }).invite_token
      ),
    }
  }

  // ── 3. Generate invite token and insert invite record ─────────────────
  const inviteToken = generateApprovalToken()
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + APPROVAL_TOKEN_EXPIRY_DAYS)

  const { error: insertError } = await supabase.from('collaborator_invites').insert({
    collaborator_id: collaborator.id,
    inviting_user_id: invitingUserId,
    invited_email: collaborator.email,
    invite_token: inviteToken,
    status: 'pending',
    token_expires_at: expiresAt.toISOString(),
  })

  if (insertError) {
    return { ok: false, status: 500, error: insertError.message }
  }

  const inviteLink = buildCollaboratorInviteUrl(inviteToken)

  // ── 4. Send educational IPI invite email (D-04, D-08) — best-effort. ──
  const email = buildCollaboratorInviteEmail({ name: collaborator.name, token: inviteToken })
  const result = await sendEmail({ to: collaborator.email, ...email })

  // A sendEmail failure lowers emailSent and nothing else — it is never
  // promoted to an error status, because a link the artist can
  // hand-deliver is still a working invite.
  return { ok: true, skipped: false, emailSent: result.ok, inviteLink }
}
