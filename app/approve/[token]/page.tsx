import { createServiceClient } from '@/lib/supabase/server'
import { SplitApprovalView } from '@/components/split-sheets/SplitApprovalView'
import { resolvePartyPhase } from '@/lib/split-sheets/phase'
import type { PartyPhase, SplitSheetStatus } from '@/lib/split-sheets/phase'

// Public page — no auth required. /approve is intentionally absent from
// middleware isProtected (D-15, Plan 01 comment). Force-dynamic because
// the token lookup must happen per-request.
export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ token: string }>
}

export default async function ApprovePage({ params }: Props) {
  const { token } = await params
  const service = createServiceClient()
  const now = new Date().toISOString()

  // ── Token lookup — select sheet.status so phase resolution has it
  // available (RESEARCH Pitfall 1 / gap fix 1). ────────────────────────
  const { data: party } = await service
    .from('split_sheet_parties')
    .select('*, split_sheets(id, song_name, status, initiator_user_id)')
    .eq('approval_token', token)
    .maybeSingle()

  const sheet = (party?.split_sheets ?? null) as {
    id: string
    song_name: string
    status: SplitSheetStatus
    initiator_user_id: string
  } | null

  // ── Two-question gating (RESEARCH Pitfall 1): token validity vs party
  // lifecycle phase — replaces the old single isExpired boolean that
  // treated any non-'pending' approval_status as an expired link. ─────
  const phase: PartyPhase = resolvePartyPhase({
    party: party
      ? {
          approval_status: party.approval_status as 'pending' | 'approved' | 'countered',
          token_expires_at: (party.token_expires_at as string | null) ?? null,
        }
      : null,
    sheet: sheet ? { status: sheet.status } : null,
    nowIso: now,
  })

  if (phase === 'token_invalid') {
    // Attempt to surface the initiator name for the expired copy
    let artistName = 'the initiating artist'

    if (sheet?.initiator_user_id) {
      const { data: profile } = await service
        .from('artist_profiles')
        .select('artist_name, display_name')
        .eq('user_id', sheet.initiator_user_id)
        .maybeSingle()
      if (profile) {
        artistName = (profile.artist_name || profile.display_name || artistName) as string
      }
    }

    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-ink px-4 py-16">
        <div className="mb-8 text-2xl font-extrabold tracking-tight">
          <span className="gtext">Funūn</span>
        </div>
        <div className="w-full max-w-[480px] rounded-[18px] border border-white/10 bg-card p-8 text-center">
          <p className="text-lg font-extrabold text-white">This link has expired</p>
          <p className="mt-2 text-sm text-white/50">
            Ask {artistName} to send a new approval link.
          </p>
        </div>
      </div>
    )
  }

  // ── Stamp the page-visit signal once (P17-04 nudge tracking) ─────────
  // Idempotent — only the first visit with a valid token sets it. This is
  // a page-visit stamp only (no email-open tracking, T-17-10). Done here
  // rather than in the POST-only approve/[token] API route, since that
  // route only ever fires on the client's approve/counter submission and
  // never runs on the GET page load this signal is meant to capture.
  if (!party!.first_viewed_at) {
    await service
      .from('split_sheet_parties')
      .update({ first_viewed_at: now })
      .eq('id', party!.id as string)
      .is('first_viewed_at', null)
  }

  const resolvedSheet = sheet as {
    id: string
    song_name: string
    status: SplitSheetStatus
    initiator_user_id: string
  }

  // ── Fetch all sibling parties (names + splits only, T-01-14) ─────────
  const { data: allParties } = await service
    .from('split_sheet_parties')
    .select('id, name, role, split_percentage')
    .eq('split_sheet_id', resolvedSheet.id)

  // ── Fetch initiator name for the header ──────────────────────────────
  const { data: initiatorProfile } = await service
    .from('artist_profiles')
    .select('artist_name, display_name')
    .eq('user_id', resolvedSheet.initiator_user_id)
    .maybeSingle()

  const artistName =
    (initiatorProfile?.artist_name || initiatorProfile?.display_name || 'An artist') as string

  return (
    <SplitApprovalView
      token={token}
      partyId={party!.id as string}
      partyName={party!.name as string}
      partyRole={(party!.role ?? null) as string | null}
      songName={resolvedSheet.song_name}
      artistName={artistName}
      phase={phase}
      parties={(allParties ?? []) as { id: string; name: string; role: string | null; split_percentage: number }[]}
    />
  )
}
