import { createServiceClient } from '@/lib/supabase/server'
import { SplitApprovalView } from '@/components/split-sheets/SplitApprovalView'
import { resolvePartyPhase } from '@/lib/split-sheets/phase'
import type { PartyPhase, SplitSheetStatus } from '@/lib/split-sheets/phase'
import { DOCUSEAL_EMBED_BASE } from '@/lib/esign/docuseal'

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
      // artist_profiles is keyed by `id` (= auth.users.id) and has no
      // user_id or display_name column — display_name lives on
      // industry_profiles. The previous select/filter referenced both and
      // therefore always errored, silently degrading every collaborator's
      // page to the "the initiating artist" fallback.
      const { data: profile } = await service
        .from('artist_profiles')
        .select('artist_name')
        .eq('id', sheet.initiator_user_id)
        .maybeSingle()
      if (profile?.artist_name) {
        artistName = profile.artist_name as string
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
  // Keyed by `id` — see the note on the token_invalid branch above.
  const { data: initiatorProfile } = await service
    .from('artist_profiles')
    .select('artist_name')
    .eq('id', resolvedSheet.initiator_user_id)
    .maybeSingle()

  const artistName = (initiatorProfile?.artist_name || 'An artist') as string

  // ── This party's own signing source (17-06, ESIGN-06) ────────────────
  // Resolved SERVER-SIDE and scoped to this party's signer row on the
  // live envelope: the browser receives one signer's `/s/{slug}` and
  // nothing else — never the API key, never another party's slug
  // (T-17-15, T-17-19). Deliberately NOT derived from the approval token,
  // so possessing one party's link cannot yield another's signing form.
  let signingSrc: string | null = null

  if (phase === 'sign') {
    const { data: signerRow } = await service
      .from('esign_envelope_signers')
      .select('signer_slug, esign_envelopes!inner(split_sheet_id, status)')
      .eq('split_sheet_party_id', party!.id as string)
      .eq('esign_envelopes.split_sheet_id', resolvedSheet.id)
      .eq('esign_envelopes.status', 'pending')
      .maybeSingle()

    const slug = (signerRow?.signer_slug ?? null) as string | null
    signingSrc = slug ? `${DOCUSEAL_EMBED_BASE}/s/${slug}` : null
  }

  return (
    <SplitApprovalView
      token={token}
      partyId={party!.id as string}
      partyName={party!.name as string}
      partyRole={(party!.role ?? null) as string | null}
      partyEmail={(party!.email ?? null) as string | null}
      songName={resolvedSheet.song_name}
      artistName={artistName}
      phase={phase}
      signingSrc={signingSrc}
      parties={(allParties ?? []) as { id: string; name: string; role: string | null; split_percentage: number }[]}
    />
  )
}
