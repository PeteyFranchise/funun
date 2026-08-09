import type { SupabaseClient } from '@supabase/supabase-js'
import { generateApprovalToken, APPROVAL_TOKEN_EXPIRY_DAYS } from '@/lib/split-sheets/approval'
import type { ArtistInviteSource } from '@/lib/invites/schema'

// ─── Shared artist-invite mint/rotate/reuse claim ─────────────────────────
// (27-CODEX-REVIEW.md B3/H1/M5) Single source of truth for "get me a valid,
// authorized invite token for this email" — used by the admin "issue
// invite" route, the waitlist "convert" route, and the Leadership-only
// reopen broadcast so all three claim/rotate an artist_invites row
// identically instead of three divergent copies of the same insert/dup-
// check logic.
//
// Outcomes:
//   - 'reused'  — an active (non-expired) pending row already exists for
//                 this email; returned as-is, no write. Preserves the
//                 pre-fix duplicate-idempotency behavior (no re-send).
//   - 'rotated' — a pending row exists but its token_expires_at has
//                 passed; token + expiry are rotated in place instead of
//                 reporting a stale duplicate (H1 fix — expired invites
//                 can now be re-issued).
//   - 'created' — no pending row existed; a new one is inserted. Migration
//                 099's partial UNIQUE index on LOWER(email) WHERE
//                 status='pending' makes this the atomic claim: a
//                 concurrent insert for the same email loses with a 23505
//                 unique violation, and this function falls back to
//                 reusing/rotating the row the other caller just won
//                 instead of erroring (B3 concurrency safety for the
//                 per-recipient broadcast mint).

export type MintInviteResult =
  | { ok: true; id: string; token: string; state: 'created' | 'rotated' | 'reused' }
  | { ok: false; error: string }

type PendingRow = { id: string; invite_token: string | null; token_expires_at: string | null }

function isExpired(row: PendingRow): boolean {
  return !!row.token_expires_at && new Date(row.token_expires_at).getTime() <= Date.now()
}

function newExpiry(): string {
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + APPROVAL_TOKEN_EXPIRY_DAYS)
  return expiresAt.toISOString()
}

async function rotateRow(service: SupabaseClient, row: PendingRow): Promise<MintInviteResult> {
  const token = generateApprovalToken()

  const { error } = await service
    .from('artist_invites')
    .update({ invite_token: token, token_expires_at: newExpiry(), updated_at: new Date().toISOString() })
    .eq('id', row.id)
    .eq('status', 'pending')

  if (error) return { ok: false, error: error.message }
  return { ok: true, id: row.id, token, state: 'rotated' }
}

export async function mintOrRotateInvite(
  service: SupabaseClient,
  args: { email: string; source: ArtistInviteSource; invitedByUserId: string | null }
): Promise<MintInviteResult> {
  const { email, source, invitedByUserId } = args

  const { data: existing, error: selectError } = await service
    .from('artist_invites')
    .select('id, invite_token, token_expires_at')
    .ilike('email', email)
    .eq('status', 'pending')
    .maybeSingle()

  if (selectError) return { ok: false, error: selectError.message }

  if (existing) {
    const row = existing as PendingRow
    if (!isExpired(row) && row.invite_token) {
      return { ok: true, id: row.id, token: row.invite_token, state: 'reused' }
    }
    return rotateRow(service, row)
  }

  const token = generateApprovalToken()

  const { data: inserted, error: insertError } = await service
    .from('artist_invites')
    .insert({
      email,
      status: 'pending',
      source,
      invite_token: token,
      token_expires_at: newExpiry(),
      invited_by_user_id: invitedByUserId,
    })
    .select('id')
    .maybeSingle()

  if (insertError) {
    if (insertError.code === '23505') {
      // Lost the race for the pending slot (migration 099's partial unique
      // index on LOWER(email) WHERE status='pending') — another caller
      // just claimed it. Reuse/rotate the winner's row instead of failing.
      const { data: winner, error: winnerError } = await service
        .from('artist_invites')
        .select('id, invite_token, token_expires_at')
        .ilike('email', email)
        .eq('status', 'pending')
        .maybeSingle()

      if (winnerError || !winner) {
        return { ok: false, error: winnerError?.message ?? 'Failed to create invite.' }
      }
      const row = winner as PendingRow
      if (!isExpired(row) && row.invite_token) {
        return { ok: true, id: row.id, token: row.invite_token, state: 'reused' }
      }
      return rotateRow(service, row)
    }
    return { ok: false, error: insertError.message }
  }

  if (!inserted) return { ok: false, error: 'Failed to create invite.' }
  return { ok: true, id: (inserted as { id: string }).id, token, state: 'created' }
}
