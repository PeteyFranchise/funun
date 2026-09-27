import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import {
  SplitSheetBuilder,
  type ExistingSheet,
  type ExistingSheetParty,
  type MyProfilePrefill,
} from '@/components/split-sheets/SplitSheetBuilder'
import { StagedFlagPanel } from '@/components/split-sheets/StagedFlagPanel'
import { composeLegalNameFromProfile } from '@/lib/split-sheets/agreement'
import { resolvePartyIdentitiesForSheet } from '@/lib/split-sheets/resolve-party-identities.server'
import type { SplitSheetStatus } from '@/lib/split-sheets/lifecycle'
import type { ComposerRole } from '@/lib/metadata/schema'
import {
  FLAGGABLE_FIELDS,
  FLAGGABLE_FIELD_LABELS,
  currentValueForFlaggedField,
  type FlaggableField,
} from '@/lib/split-sheets/identity-flags'

export const dynamic = 'force-dynamic'

// Deliberately NO identity columns (legal_name/pro/ipi/publishing_designee/
// administrator) — this page reads those exclusively through
// resolvePartyIdentitiesForSheet() below, never from its own query. Pinned
// by __tests__/split-sheet-identity-boundary.test.ts.
type PartyDbRow = {
  id: string
  collaborator_id: string | null
  user_id: string | null
  name: string
  email: string | null
  role: string | null
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
  searchParams,
}: {
  params: Promise<{ id: string }>
  // R4 guided apply (19-SPEC.md D-08): ?stagedFlag=<split_sheet_identity_flags.id>
  // is the deep-link target buildIdentityCorrectionFlagNotification builds
  // (lib/social/notifications.ts) — consumed below, owner-view only.
  searchParams: Promise<{ stagedFlag?: string }>
}) {
  const { id } = await params
  const { stagedFlag } = await searchParams
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
      'id, status, song_name, artist_name, album_project_title, record_label, vault_project_id, initiator_user_id, split_sheet_parties(id, collaborator_id, user_id, name, email, role, split_percentage, created_at)'
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

  // ── The one identity resolver (260926-v1w) — every party's identity for
  // this sheet, resolved exactly once, server-side. Used below for BOTH
  // the staged-flag "current value" display and the builder's party list,
  // so the two can never show different answers for the same party. ────
  const resolution = await resolvePartyIdentitiesForSheet(sheet.id)
  const resolvedByPartyId = new Map(resolution.parties.map(p => [p.partyId, p]))
  const emptyIdentity = {
    legal_name: null,
    pro: null,
    ipi: null,
    publishing_designee: null,
    administrator: null,
  }

  // ── R4 guided apply (§19-SPEC.md D-08), owner-only: resolve the staged
  // flag from the ?stagedFlag= deep-link. Defense in depth beyond the
  // flags table's own RLS ("Flagger or sheet owner can view flag",
  // migration 074): the flag's party must belong to THIS sheet and its
  // field must be in the closed allowlist before anything renders. This
  // NEVER writes split_sheet_parties or any term — read-only display
  // support for the void-first / guided-pointer next step below. The
  // "current value" shown is the RESOLVED identity (the same value the
  // builder displays for this party), not a second independent read. ───
  let stagedFlagView: { fieldLabel: string; currentValue: string | null; suggestedValue: string } | null = null
  if (stagedFlag) {
    const { data: flagRow } = await service
      .from('split_sheet_identity_flags')
      .select('id, split_sheet_party_id, field, suggested_value')
      .eq('id', stagedFlag)
      .maybeSingle()

    const flaggedParty = flagRow ? parties.find(p => p.id === flagRow.split_sheet_party_id) : undefined
    if (flagRow && flaggedParty && (FLAGGABLE_FIELDS as readonly string[]).includes(flagRow.field)) {
      const field = flagRow.field as FlaggableField
      const flaggedIdentity = resolvedByPartyId.get(flaggedParty.id)?.identity ?? emptyIdentity
      stagedFlagView = {
        fieldLabel: FLAGGABLE_FIELD_LABELS[field],
        currentValue: currentValueForFlaggedField(field, flaggedIdentity),
        suggestedValue: flagRow.suggested_value as string,
      }
    }
  }

  // ── Self row seed (§9): the initiator's own CURRENT rights-registry
  // snapshot — same source/shape as create mode, never the frozen party
  // row, so it always reflects what's currently in Settings. ──────────
  const { data: myProfileRow } = await service
    .from('user_profiles')
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

  const otherParties: ExistingSheetParty[] = otherPartiesRaw.map(p => {
    const resolved = resolvedByPartyId.get(p.id)?.identity ?? emptyIdentity
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

      {stagedFlagView && (
        <StagedFlagPanel
          sheetId={sheet.id}
          sheetStatus={sheet.status}
          fieldLabel={stagedFlagView.fieldLabel}
          currentValue={stagedFlagView.currentValue}
          suggestedValue={stagedFlagView.suggestedValue}
        />
      )}

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
