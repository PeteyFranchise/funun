import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import {
  SplitSheetBuilder,
  type ExistingSheet,
  type ExistingSheetParty,
  type MyProfilePrefill,
} from '@/components/split-sheets/SplitSheetBuilder'
import { composeLegalNameFromProfile } from '@/lib/split-sheets/agreement'
import { resolvePartyIdentity, type LivePartyIdentitySource } from '@/lib/split-sheets/live-identity'
import type { SplitSheetStatus } from '@/lib/split-sheets/lifecycle'
import type { ComposerRole } from '@/lib/metadata/schema'

export const dynamic = 'force-dynamic'

type PartyDbRow = {
  id: string
  collaborator_id: string | null
  user_id: string | null
  name: string
  legal_name: string | null
  email: string | null
  pro: string | null
  ipi: string | null
  role: string | null
  publishing_designee: string | null
  administrator: string | null
  split_percentage: number
  created_at: string
}

type SheetDbRow = {
  id: string
  status: SplitSheetStatus
  song_name: string
  artist_name: string | null
  album_project_title: string | null
  record_label: string | null
  vault_project_id: string | null
  initiator_user_id: string
  split_sheet_parties: PartyDbRow[]
}

const STATUS_COPY: Record<SplitSheetStatus, string> = {
  draft: 'Draft — visible only to you until you share or send it.',
  pending_approval: 'Awaiting approval from one or more parties.',
  approved: 'Everyone has approved — preparing to send for signature.',
  countered: 'A party proposed a different split — review and re-send.',
  esign_pending: 'A signature request is out. Void it first to make further edits.',
  executed: 'Fully executed. Amend with a new split sheet if terms change.',
}

// ─── /split-sheets/[id] — the living-draft detail/edit page (HOME-02) ──
// Authorizes to the initiator or an account-holding party (anything else
// is a 404, not a 403 — matching the no-leak posture of the existing
// cross-user routes, e.g. [id]/attach/page.tsx). Only the INITIATOR gets
// the interactive builder — editing is initiator-only server-side
// regardless (PATCH /api/split-sheets/[id]), so a second interactive
// surface for a viewer who can never save is out of scope; a non-initiator
// party gets a read-only summary of the same data.
export default async function SplitSheetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/signin')

  // Service client for the full cross-user read — authorization is
  // enforced explicitly below (initiator or account-holding party), not
  // delegated to RLS, because a non-initiator party's own RLS grant
  // ("Party sees own row") would otherwise silently truncate the nested
  // party list down to just their own row before we ever get to render
  // anything (migration 018's per-row RLS, not a bug — just the wrong
  // tool for "show me everyone on this sheet").
  const service = createServiceClient()

  const { data: sheetData } = await service
    .from('split_sheets')
    .select(
      'id, status, song_name, artist_name, album_project_title, record_label, vault_project_id, initiator_user_id, split_sheet_parties(id, collaborator_id, user_id, name, legal_name, email, pro, ipi, role, publishing_designee, administrator, split_percentage, created_at)'
    )
    .eq('id', id)
    .maybeSingle()

  const sheet = sheetData as unknown as SheetDbRow | null
  if (!sheet) notFound()

  const isInitiator = sheet.initiator_user_id === user.id
  const isParty = (sheet.split_sheet_parties ?? []).some(p => p.user_id === user.id)
  if (!isInitiator && !isParty) notFound()

  const parties = [...(sheet.split_sheet_parties ?? [])].sort((a, b) =>
    a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0
  )

  if (!isInitiator) {
    return (
      <ReadOnlyPartySummary
        songName={sheet.song_name}
        status={sheet.status}
        parties={parties}
        viewerUserId={user.id}
      />
    )
  }

  // ── Self row seed (§9): the initiator's own CURRENT rights-registry
  // snapshot — same source/shape as create mode, never the frozen party
  // row, so it always reflects what's currently in Settings. ──────────
  const { data: myProfileRow } = await service
    .from('artist_profiles')
    .select(
      'artist_name, pro, ipi, publisher, administrator, legal_first_name, legal_middle_name, legal_last_name, legal_name_suffix'
    )
    .eq('id', user.id)
    .maybeSingle()

  const myProfile: MyProfilePrefill | null = myProfileRow
    ? {
        legalName: composeLegalNameFromProfile(myProfileRow),
        artistName: myProfileRow.artist_name ?? '',
        pro: myProfileRow.pro ?? '',
        ipi: myProfileRow.ipi ?? '',
        publishingDesignee: myProfileRow.publisher ?? '',
        administrator: myProfileRow.administrator ?? '',
      }
    : null

  const [selfParty, ...otherPartiesRaw] = parties

  // ── Live identity for every OTHER claimed party (§1, T-18-01a) ──────
  // Batch: which of the other parties are linked to a CLAIMED
  // collaborator, then a single artist_profiles read for those users —
  // scoped strictly by the server-verified collaborators.claimed_by
  // values, never a client-supplied id.
  const collaboratorIds = otherPartiesRaw
    .map(p => p.collaborator_id)
    .filter((cid): cid is string => Boolean(cid))

  const claimedByByCollaboratorId = new Map<string, string>()
  if (collaboratorIds.length > 0) {
    const { data: collabRows } = await service
      .from('collaborators')
      .select('id, claimed_by')
      .in('id', collaboratorIds)
    for (const row of (collabRows ?? []) as { id: string; claimed_by: string | null }[]) {
      if (row.claimed_by) claimedByByCollaboratorId.set(row.id, row.claimed_by)
    }
  }

  const claimedUserIds = Array.from(new Set(Array.from(claimedByByCollaboratorId.values())))
  const claimedProfileByUserId = new Map<string, LivePartyIdentitySource>()
  if (claimedUserIds.length > 0) {
    const { data: profileRows } = await service
      .from('artist_profiles')
      .select(
        'id, pro, ipi, publisher, administrator, legal_first_name, legal_middle_name, legal_last_name, legal_name_suffix'
      )
      .in('id', claimedUserIds)
    for (const row of (profileRows ?? []) as {
      id: string
      pro: string | null
      ipi: string | null
      publisher: string | null
      administrator: string | null
      legal_first_name: string | null
      legal_middle_name: string | null
      legal_last_name: string | null
      legal_name_suffix: string | null
    }[]) {
      claimedProfileByUserId.set(row.id, {
        pro: row.pro,
        ipi: row.ipi,
        publishing_designee: row.publisher,
        administrator: row.administrator,
        legal_name: composeLegalNameFromProfile(row) || null,
      })
    }
  }

  const otherParties: ExistingSheetParty[] = otherPartiesRaw.map(p => {
    const claimedUserId = p.collaborator_id ? claimedByByCollaboratorId.get(p.collaborator_id) : undefined
    const claimedProfile = claimedUserId ? claimedProfileByUserId.get(claimedUserId) ?? null : null
    const frozen: LivePartyIdentitySource = {
      pro: p.pro,
      ipi: p.ipi,
      publishing_designee: p.publishing_designee,
      administrator: p.administrator,
      legal_name: p.legal_name,
    }
    const resolved = resolvePartyIdentity(frozen, claimedProfile, sheet.status)
    const resolvedLegalName = resolved.legal_name ?? ''
    return {
      partyId: p.id,
      collaboratorId: p.collaborator_id,
      name: p.name,
      legalName: resolvedLegalName,
      email: p.email ?? '',
      pro: resolved.pro ?? '',
      ipi: resolved.ipi ?? '',
      role: (p.role ?? 'composer_lyricist') as ComposerRole,
      publishingDesignee: resolved.publishing_designee ?? '',
      administrator: resolved.administrator ?? '',
      split: p.split_percentage,
      // A not-yet-responded fast-add: linked to a collaborator, but no
      // legal name has landed yet (even after live resolution).
      kind: p.collaborator_id && !resolvedLegalName.trim() ? 'fastAdd' : 'full',
    }
  })

  const existingSheet: ExistingSheet = {
    id: sheet.id,
    status: sheet.status,
    songName: sheet.song_name,
    artistName: sheet.artist_name ?? '',
    albumProjectTitle: sheet.album_project_title ?? '',
    recordLabel: sheet.record_label ?? '',
    vaultProjectId: sheet.vault_project_id,
    selfPartyId: selfParty?.id ?? null,
    selfSplit: selfParty?.split_percentage ?? 100,
    selfRole: (selfParty?.role ?? 'composer_lyricist') as ComposerRole,
    otherParties,
    // The P18-09 "before" snapshot — ALL originally-persisted parties,
    // untouched by live resolution.
    frozenParties: parties.map(p => ({
      id: p.id,
      name: p.name,
      split_percentage: p.split_percentage,
    })),
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8 border-b border-white/10 pb-6">
        <p className="mb-1 text-[11px] font-bold uppercase tracking-[.18em] text-lavdim">
          <Link href="/split-sheets" className="text-lav underline-offset-2 hover:underline">
            Split Sheets
          </Link>{' '}
          / {sheet.song_name}
        </p>
        <h1 className="text-[22px] font-extrabold text-white">{sheet.song_name}</h1>
        <p className="mt-1 text-sm text-white/50">{STATUS_COPY[sheet.status]}</p>
      </header>

      <SplitSheetBuilder myProfile={myProfile} existingSheet={existingSheet} />
    </div>
  )
}

// ─── ReadOnlyPartySummary ─────────────────────────────────────────────
// A non-initiator account-holding party's view of the sheet — read-only,
// since only the initiator can PATCH (server-enforced regardless).
function ReadOnlyPartySummary({
  songName,
  status,
  parties,
  viewerUserId,
}: {
  songName: string
  status: SplitSheetStatus
  parties: PartyDbRow[]
  viewerUserId: string
}) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8 border-b border-white/10 pb-6">
        <p className="mb-1 text-[11px] font-bold uppercase tracking-[.18em] text-lavdim">
          <Link href="/split-sheets" className="text-lav underline-offset-2 hover:underline">
            Split Sheets
          </Link>{' '}
          / {songName}
        </p>
        <h1 className="text-[22px] font-extrabold text-white">{songName}</h1>
        <p className="mt-1 text-sm text-white/50">{STATUS_COPY[status]}</p>
      </header>

      <div className="space-y-2">
        {parties.map(p => (
          <div
            key={p.id}
            className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] p-3 text-sm"
          >
            <div>
              <span className="font-medium text-white">{p.name}</span>
              {p.user_id === viewerUserId && (
                <span className="ml-2 text-xs text-brandindigo">(you)</span>
              )}
            </div>
            <span className="font-semibold text-white/70">{p.split_percentage}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}
