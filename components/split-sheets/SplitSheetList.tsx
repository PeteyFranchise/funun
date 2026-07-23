import Link from 'next/link'

// ─── SplitSheetList ──────────────────────────────────────────────────
// The living-draft surface's list view (HOME-01/HOME-02) — closes the
// "drafts are write-only" finding (18-CONTEXT finding 2): every sheet the
// caller can reach (initiated, or a party on) is rendered here, grouped by
// lifecycle state, each row linking to /split-sheets/[id]. An empty list
// gets an explanatory empty state, never a blank page.

export type SplitSheetPartyProgress = {
  id: string
  name: string
  approval_status: 'pending' | 'approved' | 'countered'
}

export type SplitSheetStatusValue =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'countered'
  | 'esign_pending'
  | 'executed'

export type SplitSheetListItem = {
  id: string
  song_name: string
  status: SplitSheetStatusValue
  created_at: string
  parties: SplitSheetPartyProgress[]
}

const STATUS_LABELS: Record<SplitSheetStatusValue, string> = {
  draft: 'Draft',
  pending_approval: 'Awaiting approval',
  approved: 'Approved · preparing to sign',
  countered: 'Counter-proposal received',
  esign_pending: 'Awaiting signature',
  executed: 'Executed',
}

const GROUPS: { key: string; label: string; statuses: SplitSheetStatusValue[] }[] = [
  { key: 'attention', label: 'Needs your attention', statuses: ['countered'] },
  { key: 'draft', label: 'Drafts', statuses: ['draft'] },
  { key: 'pending', label: 'Awaiting approval', statuses: ['pending_approval', 'approved'] },
  { key: 'signing', label: 'Awaiting signature', statuses: ['esign_pending'] },
  { key: 'executed', label: 'Executed', statuses: ['executed'] },
]

function progressLabel(parties: SplitSheetPartyProgress[]): string {
  const approved = parties.filter(p => p.approval_status === 'approved').length
  return `${approved} of ${parties.length} approved`
}

export function SplitSheetList({ sheets }: { sheets: SplitSheetListItem[] }) {
  if (sheets.length === 0) {
    return (
      <div className="rounded-[18px] border border-dashed border-white/15 bg-white/[0.02] px-6 py-12 text-center">
        <p className="text-sm font-semibold text-white">No split sheets yet</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-white/50">
          Create one to lock in who wrote what and their share — before the studio
          session becomes a fuzzy memory.
        </p>
        <Link
          href="/split-sheets/new"
          className="mt-4 inline-block rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90"
        >
          Create split sheet
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-end">
        <Link
          href="/split-sheets/new"
          className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90"
        >
          + New split sheet
        </Link>
      </div>

      {GROUPS.map(group => {
        const rows = sheets.filter(s => group.statuses.includes(s.status))
        if (rows.length === 0) return null
        return (
          <div key={group.key}>
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-white/40">
              {group.label} · {rows.length}
            </h2>
            <div className="space-y-2">
              {rows.map(sheet => (
                <Link
                  key={sheet.id}
                  href={`/split-sheets/${sheet.id}`}
                  className="block rounded-lg border border-white/10 bg-white/[0.02] p-4 transition hover:border-white/25"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-white">{sheet.song_name}</span>
                    <span className="shrink-0 text-xs text-white/40">
                      {STATUS_LABELS[sheet.status]}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-white/40">
                    {sheet.parties.length} {sheet.parties.length === 1 ? 'party' : 'parties'}
                    {sheet.status !== 'draft' && sheet.status !== 'executed'
                      ? ` · ${progressLabel(sheet.parties)}`
                      : ''}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
