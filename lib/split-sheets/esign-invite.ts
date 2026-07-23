// ─── Funūn signature-invite email ──────────────────────────────────────
// The message a collaborator receives when a split sheet is ready for
// their signature (ESIGN-18, P17-10). It is Funūn's message, not the
// signing provider's: the provider gate confirmed that every collaborator
// touchpoint was provider-branded, and for many collaborators this email
// is their FIRST contact with Funūn at all (P17-06, the stickiness thesis
// applied to collaborators). Handing them a third party's email wastes
// that moment and confuses whose record the document is.
//
// Three properties this module exists to hold, all test-asserted against
// RENDERED output rather than this source file (so this very comment
// cannot break the gate or falsely satisfy it):
//
//   1. No signing-provider host, path, image, or brand mark appears
//      anywhere in the subject, html, or text.
//   2. There is exactly ONE action link, always Funūn's own
//      /approve/[token] page for THIS recipient's token — a single trust
//      signal a suspicious recipient can check, and no other party's
//      token, contact detail, or provider identifier to leak (T-17-31,
//      T-17-32).
//   3. from AND replyTo are both ESIGN_FROM_EMAIL — one real, monitored
//      mailbox. A collaborator being asked to sign a legal document must
//      be able to reach a human by hitting reply; a no-reply void is not
//      an acceptable answer to "is this real?".
//
// Pure and credential-free: it renders strings and delegates delivery to
// the existing lib/email Resend wrapper. Because it passes an explicit
// `from` key, the wrapper's from-override gating turns an unset
// ESIGN_FROM_EMAIL into a structured no-op rather than a silent fallback
// to the generic RESEND_FROM_EMAIL sender (T-17-34) — a signature invite
// comes from the e-sign mailbox or it does not go at all.
//
// Ownership boundary: this module SENDS. It does not mint. 17-06's mint
// route owns calling sendSignatureInvite() per signer (with the provider's
// own invite email disabled) after the envelope and signer rows persist.

import { sendEmail } from '@/lib/email'
import { APPROVAL_TOKEN_EXPIRY_DAYS } from '@/lib/split-sheets/approval'

// ─── Types ──────────────────────────────────────────────────────────────

/**
 * One party as named in the invite's summary table. Deliberately narrow:
 * a name and a share, both of which every party on the sheet can already
 * see through the existing approval flow. No email, no token, no provider
 * identifier — one signer's invite must not expose another party's
 * private data (T-17-32).
 */
export type SignatureInviteParty = {
  name: string
  splitPercentage: number
}

export type SignatureInviteInput = {
  songName: string
  /** Who prepared and sent the sheet. Omitted from the copy when absent. */
  initiatorName?: string | null
  signerName: string
  signerEmail: string
  /** The share this recipient is being asked to sign against. */
  signerSplitPercentage: number
  /** Funūn approve-page token for THIS signer only. */
  token: string
  /** Every party on the sheet, including the recipient. */
  parties: SignatureInviteParty[]
  /** Link validity window in days. Defaults to the approval-token window. */
  expiryDays?: number
}

export type SignatureInviteEmail = {
  subject: string
  html: string
  text: string
}

/**
 * Per-signer delivery outcome. `notConfigured` distinguishes "email isn't
 * set up in this environment" (expected, benign, retryable once the
 * mailbox is live) from "we tried and it failed" (worth surfacing to the
 * initiator as a resend prompt) — a single boolean would conflate them.
 */
export type SignatureInviteResult = {
  email: string
  ok: boolean
  notConfigured?: boolean
  error?: string
}

// ─── Rendering helpers ──────────────────────────────────────────────────

/** Escapes the five HTML-significant characters in interpolated values. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Formats a share for display. Whole numbers print without a decimal tail
 * ("40%", not "40.0%"); fractional even-splits keep their precision
 * ("33.333%") so a signer sees the exact figure they are signing against.
 */
function formatShare(value: number): string {
  if (!Number.isFinite(value)) return '—'
  return `${Number(value.toFixed(3))}%`
}

/**
 * The signer's approve URL. Built from NEXT_PUBLIC_APP_URL exactly as the
 * existing send-for-approval route does. A missing base URL yields a
 * relative path rather than the string "undefined/approve/…" — a broken
 * link is recoverable, a link that visibly reads "undefined" destroys the
 * trust signal this message depends on.
 */
function approveUrl(token: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/+$/, '')
  return `${base}/approve/${token}`
}

// ─── Email builder ──────────────────────────────────────────────────────

/**
 * Renders the Funūn-branded signature invite for one signer. Pure — reads
 * only its input and NEXT_PUBLIC_APP_URL, touches no network, and never
 * throws.
 */
export function buildSignatureInviteEmail(input: SignatureInviteInput): SignatureInviteEmail {
  const song = input.songName.trim()
  const initiator = (input.initiatorName ?? '').trim()
  const signer = input.signerName.trim()
  const share = formatShare(input.signerSplitPercentage)
  const url = approveUrl(input.token)
  const expiryDays = input.expiryDays ?? APPROVAL_TOKEN_EXPIRY_DAYS

  const subject = `Signature requested: split sheet for "${song}"`

  // By this point the terms are already agreed — the approval step
  // settled them. The ask here is narrower and should read that way: not
  // "do you accept these splits?" but "sign the sheet that records them".
  const opening = initiator
    ? `${initiator} has finalised the splits for "${song}" and everyone named below has agreed to them. The last step is your signature.`
    : `The splits for "${song}" have been finalised and everyone named below has agreed to them. The last step is your signature.`

  const yourShare = `You are signing for a ${share} share of "${song}".`

  const partyRows = input.parties
    .map(
      p =>
        `<tr><td style="padding:4px 8px">${escapeHtml(p.name.trim())}</td>` +
        `<td style="padding:4px 8px;text-align:right">${formatShare(p.splitPercentage)}</td></tr>`
    )
    .join('')

  const html = `
    <h2>Sign your split sheet for "${escapeHtml(song)}"</h2>
    <p>${escapeHtml(opening)}</p>
    <p><strong>${escapeHtml(yourShare)}</strong></p>
    <p>The full sheet reads:</p>
    <table style="border-collapse:collapse;width:100%;max-width:400px"><tbody>${partyRows}</tbody></table>
    <p>You sign inside Funūn — no account and no signup required. The link below opens your copy of the sheet, where you can read it in full before signing.</p>
    <p><a href="${url}" style="display:inline-block;padding:10px 20px;background:#818CF8;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Review and sign</a></p>
    <p style="color:#888;font-size:12px">This link is yours alone and expires in ${expiryDays} days.</p>
    <p style="color:#888;font-size:12px">Something look wrong, or not expecting this? Reply to this email — a person at Funūn reads this mailbox.</p>
  `.trim()

  const partyLines = input.parties
    .map(p => `  ${p.name.trim()}: ${formatShare(p.splitPercentage)}`)
    .join('\n')

  const text = [
    `Sign your split sheet for "${song}"`,
    '',
    opening,
    '',
    yourShare,
    '',
    'The full sheet reads:',
    partyLines,
    '',
    'You sign inside Funūn — no account and no signup required.',
    '',
    `Review and sign: ${url}`,
    '',
    `This link is yours alone and expires in ${expiryDays} days.`,
    'Something look wrong, or not expecting this? Reply to this email — a person at Funūn reads this mailbox.',
    '',
    `— Funūn (for ${signer})`,
  ].join('\n')

  return { subject, html, text }
}

// ─── Delivery ───────────────────────────────────────────────────────────

/**
 * Sends one signer's invite. NEVER throws: by the time invites go out the
 * envelope is already spent, so a single bad address must degrade to a
 * reportable per-signer failure rather than aborting a paid mint
 * (T-17-33). Returns `notConfigured` when the e-sign mailbox or the
 * Resend key is unset, so callers can distinguish an unconfigured
 * environment from a real delivery failure.
 */
export async function sendSignatureInvite(
  input: SignatureInviteInput
): Promise<SignatureInviteResult> {
  const to = (input.signerEmail ?? '').trim()
  if (!to) {
    return { email: to, ok: false, error: 'Signer has no email address' }
  }

  // Checked here as well as in the wrapper so the caller gets an explicit
  // notConfigured signal rather than having to string-match the wrapper's
  // generic error. The `from` key is still passed unconditionally below,
  // so the wrapper's own override gating remains the backstop (T-17-34).
  const fromAddress = (process.env.ESIGN_FROM_EMAIL ?? '').trim()
  if (!fromAddress) {
    return {
      email: to,
      ok: false,
      notConfigured: true,
      error: 'ESIGN_FROM_EMAIL is not configured',
    }
  }

  const { subject, html, text } = buildSignatureInviteEmail(input)

  try {
    const result = await sendEmail({
      to,
      subject,
      html,
      text,
      // from and replyTo are the SAME real, monitored mailbox — a
      // collaborator's only route to a human about a document they are
      // being asked to sign.
      from: fromAddress,
      replyTo: fromAddress,
    })

    if (result.ok) return { email: to, ok: true }
    if (result.error === 'Email not configured') {
      return { email: to, ok: false, notConfigured: true, error: result.error }
    }
    return { email: to, ok: false, error: result.error }
  } catch (e) {
    return { email: to, ok: false, error: e instanceof Error ? e.message : 'Invite send failed' }
  }
}

/**
 * Fans out one invite per signer, sequentially, and returns a result per
 * signer. Sequential rather than parallel so a provider rate limit
 * degrades into slower delivery instead of a burst of failures, and so
 * the returned array order matches the input order the caller reports on.
 */
export async function sendSignatureInvites(
  inputs: SignatureInviteInput[]
): Promise<SignatureInviteResult[]> {
  const results: SignatureInviteResult[] = []
  for (const input of inputs) {
    results.push(await sendSignatureInvite(input))
  }
  return results
}
