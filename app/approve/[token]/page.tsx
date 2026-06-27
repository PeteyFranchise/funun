import { createServiceClient } from '@/lib/supabase/server'
import { SplitApprovalView } from '@/components/split-sheets/SplitApprovalView'

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

  // ── Token lookup (T-01-13 expiry guard) ─────────────────────────────
  const { data: party } = await service
    .from('split_sheet_parties')
    .select('*, split_sheets(id, song_name, initiator_user_id)')
    .eq('approval_token', token)
    .maybeSingle()

  // Expired / used / missing token states
  const isExpired =
    !party ||
    (party.token_expires_at && party.token_expires_at < now) ||
    (party.approval_status !== 'pending')

  if (isExpired) {
    // Attempt to surface the initiator name for the expired copy
    const sheetData = party?.split_sheets as { initiator_user_id?: string } | null
    let artistName = 'the initiating artist'

    if (sheetData?.initiator_user_id) {
      const { data: profile } = await service
        .from('artist_profiles')
        .select('artist_name, display_name')
        .eq('user_id', sheetData.initiator_user_id)
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

  const sheet = party.split_sheets as {
    id: string
    song_name: string
    initiator_user_id: string
  }

  // ── Fetch all sibling parties (names + splits only, T-01-14) ─────────
  const { data: allParties } = await service
    .from('split_sheet_parties')
    .select('id, name, role, split_percentage')
    .eq('split_sheet_id', sheet.id)

  // ── Fetch initiator name for the header ──────────────────────────────
  const { data: initiatorProfile } = await service
    .from('artist_profiles')
    .select('artist_name, display_name')
    .eq('user_id', sheet.initiator_user_id)
    .maybeSingle()

  const artistName =
    (initiatorProfile?.artist_name || initiatorProfile?.display_name || 'An artist') as string

  return (
    <SplitApprovalView
      token={token}
      partyId={party.id as string}
      partyName={party.name as string}
      partyRole={(party.role ?? null) as string | null}
      songName={sheet.song_name}
      artistName={artistName}
      parties={(allParties ?? []) as { id: string; name: string; role: string | null; split_percentage: number }[]}
    />
  )
}
