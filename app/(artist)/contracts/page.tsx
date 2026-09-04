import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'
import { getDemoProjects } from '@/lib/vault/demo-store'
import { Topbar } from '@/components/layout/Topbar'
import { ContractLocker } from '@/components/contracts/ContractLocker'
import { ContractUpload } from '@/components/contracts/ContractUpload'
// Row derivation lives in lib/ because a Next.js page module may only
// export a fixed set of names — exporting these from here fails the build.
import { fetchContractRows, rowsFromProjects, type Proj } from '@/lib/contracts/locker-rows'
import { fetchSplitSheetsForUser, type SplitSheetRow } from '@/lib/split-sheets/list'
import { SplitSheetList, type SplitSheetListItem } from '@/components/split-sheets/SplitSheetList'
import {
  buildAttentionSections,
  type AttentionSheetInput,
  type AttentionProjectInput,
} from '@/lib/contracts/locker-attention'

export const dynamic = 'force-dynamic'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

/**
 * Maps the initiated+party-of split_sheets rows (lib/split-sheets/list.ts's
 * fetchSplitSheetsForUser, already built for the /split-sheets list surface
 * — 18-01) into buildAttentionSections' plain input shape.
 *
 * P18-12 (17-DUAL-ENTRY-DESIGN.md section 10c — BLOCK EXCEPTION): this read
 * reaches split_sheet_parties rows for every party on a sheet the caller
 * shares, which may include a party who has blocked (or been blocked by)
 * the caller. Block enforcement deliberately does NOT apply here — two
 * co-writers who later block each other still co-own the composition, and
 * neither may lose the record of what they signed. This is a decision, not
 * an oversight: cite section 10c if a future block-enforcement audit
 * proposes "fixing" this by adding a filter. Scope is narrow — this
 * agreement and its parties' details on THIS agreement, and no other Phase
 * 13 surface reopens.
 */
function toAttentionSheets(sheets: SplitSheetRow[]): AttentionSheetInput[] {
  return sheets.map(s => ({
    id: s.id,
    songName: s.song_name,
    status: s.status,
    initiatorUserId: s.initiator_user_id,
    vaultProjectId: (s.vault_project_id as string | null) ?? null,
    trackId: (s.track_id as string | null) ?? null,
    // Additional coverage via split_sheet_attachments (WR-01) — a track
    // reached ONLY through this join table (e.g. the same sheet attached
    // to a second release) still counts as covered, not just the sheet's
    // own origin trackId/vaultProjectId above.
    attachments: (s.split_sheet_attachments ?? []).map(a => ({
      vaultProjectId: a.vault_project_id,
      trackId: a.track_id,
    })),
    parties: (s.split_sheet_parties ?? []).map(p => ({
      userId: p.user_id,
      name: p.name,
      approvalStatus: p.approval_status,
      // first_viewed_at (migration 062) — the second of the two columns
      // the 3-state per-party label is derived from (research §4).
      firstViewedAt: (p.first_viewed_at as string | null) ?? null,
      splitPercentage: p.split_percentage,
      // R4 (19-SPEC.md D-05): the viewer's own party id, so the Locker's
      // "this info is wrong" flag entry can target it directly.
      partyId: p.id,
    })),
  }))
}

function toAttentionProjects(projects: Proj[]): AttentionProjectInput[] {
  return projects.map(p => ({
    id: p.id,
    title: p.title,
    tracks: (p.tracks ?? []).map(t => ({ id: t.id, title: t.title ?? 'Untitled' })),
  }))
}

type LockerView = 'overview' | 'split-sheets' | 'documents'

function readLockerView(value: string | undefined): LockerView {
  return value === 'split-sheets' || value === 'documents' ? value : 'overview'
}

export default async function ContractsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>
}) {
  const view = readLockerView((await searchParams).view)
  let projects: Proj[] = []
  let rows: ReturnType<typeof rowsFromProjects> = []
  let splitSheetRows: SplitSheetRow[] = []
  let attentionSheets: AttentionSheetInput[] = []
  let viewerUserId = ''
  let hiddenDocumentIds: string[] = []

  if (DEMO) {
    projects = (await getDemoProjects()) as Proj[]
    rows = rowsFromProjects(projects)
    viewerUserId = projects[0]?.user_id ?? 'demo-user'
    // DEMO mode behavior is unchanged: no split_sheets emulation exists in
    // the demo store, so the attention module simply has nothing in-flight
    // to bucket beyond what the demo projects' tracks already surface.
  } else {
    const supabase = await createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    viewerUserId = user?.id ?? ''

    const result = await fetchContractRows(supabase, viewerUserId)
    projects = result.projects
    rows = result.rows

    // Reads split_sheets rows (in-flight sheets, not yet documents) via the
    // SAME initiated+party-of merge already built for /split-sheets (18-01)
    // — the query change that makes the Locker attention-first (18-CONTEXT
    // finding 3): drafts and pending sheets live in split_sheets, a table
    // the Locker had never read before this plan.
    splitSheetRows = await fetchSplitSheetsForUser(supabase, viewerUserId)
    attentionSheets = toAttentionSheets(splitSheetRows)

    // A flat, non-nested read of the caller's OWN vault_documents rows
    // (covers both project-nested and standalone documents, since every
    // row carries user_id regardless of project_id) — used only to resolve
    // which documents THIS viewer has hidden from THEIR OWN Locker (P18-11:
    // soft-hide, never hard-delete, and never visible to any other party).
    const { data: hiddenFlagsData } = await supabase
      .from('vault_documents')
      .select('id, document_data')
      .eq('user_id', viewerUserId)
    hiddenDocumentIds = (
      (hiddenFlagsData ?? []) as { id: string; document_data: Record<string, unknown> | null }[]
    )
      .filter(d => d.document_data?.hidden === true)
      .map(d => d.id)

    // R4 (19-SPEC.md D-05): resolve the viewer's own split_sheet_parties.id
    // for every split-sheet document row already reachable here — today
    // that's rows carrying a splitSheetId (standalone/unattached executed
    // sheets; an ATTACHED sheet's document row is reachable in this query
    // only when the viewer also owns the parent project — a pre-existing
    // Locker visibility gap for non-owner parties, not introduced or fixed
    // by this plan). Powers ContractLocker's executed-sheet "this info is
    // wrong" flag entry.
    const splitSheetIds = Array.from(
      new Set(rows.filter(r => r.type === 'split_sheet' && r.splitSheetId).map(r => r.splitSheetId as string))
    )
    if (splitSheetIds.length > 0 && viewerUserId) {
      const { data: ownPartyRows } = await supabase
        .from('split_sheet_parties')
        .select('id, split_sheet_id')
        .in('split_sheet_id', splitSheetIds)
        .eq('user_id', viewerUserId)
      const ownPartyBySheetId = new Map<string, string>()
      for (const row of (ownPartyRows ?? []) as { id: string; split_sheet_id: string }[]) {
        ownPartyBySheetId.set(row.split_sheet_id, row.id)
      }
      rows = rows.map(r =>
        r.type === 'split_sheet' && r.splitSheetId
          ? { ...r, ownPartyId: ownPartyBySheetId.get(r.splitSheetId) ?? null }
          : r
      )
    }
  }

  // Hidden documents never render in the browse list either — the hide
  // action removes a shared agreement from THIS view only (P18-11).
  const hiddenSet = new Set(hiddenDocumentIds)
  const visibleRows = rows.filter(r => !hiddenSet.has(r.id))

  const attention = buildAttentionSections({
    viewerUserId,
    sheets: attentionSheets,
    documents: rows.map(r => ({ id: r.id, status: r.status })),
    projects: toAttentionProjects(projects),
    hiddenDocumentIds,
  })

  // Verified first, then signed, then pending; needs-fixing floats to top.
  const order = { verified: 1, signed: 2, pending: 3 } as const
  visibleRows.sort((a, b) => (a.needsFixing === b.needsFixing ? order[a.status] - order[b.status] : a.needsFixing ? -1 : 1))

  const verified = visibleRows.filter(r => r.status === 'verified' && !r.needsFixing).length
  const projectOptions = projects.map(p => ({ id: p.id, title: p.title }))
  const splitSheets: SplitSheetListItem[] = splitSheetRows.map(row => ({
    id: row.id,
    song_name: row.song_name,
    status: row.status as SplitSheetListItem['status'],
    created_at: row.created_at,
    canDelete: row.initiator_user_id === viewerUserId,
    parties: (row.split_sheet_parties ?? []).map(party => ({
      id: party.id,
      name: party.name,
      approval_status: party.approval_status,
    })),
  }))
  const documentRows = visibleRows.filter(row => row.type !== 'split_sheet')
  const tabs: { view: LockerView; label: string; count?: number }[] = [
    { view: 'overview', label: 'Overview' },
    { view: 'split-sheets', label: 'Split Sheets', count: splitSheets.length },
    { view: 'documents', label: 'Documents', count: documentRows.length },
  ]

  return (
    <>
      <Topbar
        title="Contract Locker"
        subtitle={`${visibleRows.length} document${visibleRows.length === 1 ? '' : 's'} · ${verified} verified — the paperwork behind your money`}
      >
        {view !== 'split-sheets' && <ContractUpload projects={projectOptions} />}
      </Topbar>
      <div className="flex-1 px-9 py-[30px]">
        <div className="mb-7 flex flex-wrap gap-2 border-b border-hair pb-4" aria-label="Contract Locker sections">
          {tabs.map(tab => {
            const active = tab.view === view
            return (
              <Link
                key={tab.view}
                href={tab.view === 'overview' ? '/contracts' : `/contracts?view=${tab.view}`}
                aria-current={active ? 'page' : undefined}
                className={[
                  'rounded-[10px] border px-4 py-2 text-[13.5px] font-bold transition',
                  active
                    ? 'border-brandindigo/60 bg-brandindigo/15 text-white'
                    : 'border-hair bg-card text-lav hover:border-hairstrong hover:text-white',
                ].join(' ')}
              >
                {tab.label}
                {tab.count != null && (
                  <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-lavdim">
                    {tab.count}
                  </span>
                )}
              </Link>
            )
          })}
        </div>

        {view === 'split-sheets' ? (
          <div className="mx-auto max-w-3xl">
            <header className="mb-8">
              <h2 className="text-[22px] font-extrabold text-white">Split Sheets</h2>
              <p className="mt-1 text-sm text-lavdim">
                Every split sheet you&rsquo;ve started, sent, or signed — song by song.
              </p>
            </header>
            <SplitSheetList sheets={splitSheets} />
          </div>
        ) : view === 'documents' ? (
          <ContractLocker
            key="documents"
            rows={documentRows}
            projects={projectOptions}
            showCreate={false}
            showAsk={false}
            emptyMessage="No other agreements yet — upload a contract when you’re ready."
          />
        ) : (
          <ContractLocker
            key="overview"
            rows={visibleRows}
            projects={projectOptions}
            attention={attention}
          />
        )}
      </div>
    </>
  )
}
