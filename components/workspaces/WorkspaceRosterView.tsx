import type { WorkspaceRosterRecord } from '@/lib/workspaces/room-data'
import { WorkspaceRightsProposalForm } from '@/components/workspaces/WorkspaceRightsProposalForm'

const STATE_LABELS: Record<WorkspaceRosterRecord['state'], string> = {
  proposed: 'Awaiting member',
  accepted: 'Active',
  refused: 'Declined',
  ended: 'Ended',
}

const TIER_LABELS: Record<WorkspaceRosterRecord['authorityTier'], string> = {
  none: 'No workspace access',
  operational: 'Operational access',
  authority: 'Confirmed supporting evidence on file',
}

const AUTHORITY_REASON_LABELS: Record<WorkspaceRosterRecord['authorityStatus']['reason'], string> = {
  relationship_inactive: 'No workspace access',
  supported: 'Member-confirmed supporting evidence currently supports authority access',
  no_evidence: 'Operational access only · no supporting evidence recorded',
  awaiting_member_confirmation: 'Operational access only · waiting for the Member to confirm',
  document_not_linked: 'Operational access only · supporting document not linked',
  not_yet_effective: 'Operational access only · supporting evidence is not effective yet',
  expired: 'Operational access continues · authority access lapsed when supporting evidence expired',
  superseded: 'Operational access continues · the supporting evidence was superseded',
  scope_not_declared: 'Operational access only · no authority scope has been declared',
  record_issue: 'Operational access only · supporting evidence needs attention',
}

function formatDate(value: string | null): string | null {
  if (!value) return null
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime())) return null
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(parsed)
}

export function WorkspaceRosterView({
  workspaceName,
  rows,
  error,
  workspaceId,
  canProposeRights = false,
}: {
  workspaceName: string
  rows: readonly WorkspaceRosterRecord[]
  error?: string
  workspaceId?: string
  canProposeRights?: boolean
}) {
  const activeCount = rows.filter(row => row.state === 'accepted').length
  const pendingCount = rows.filter(row => row.state === 'proposed').length

  return (
    <main className="flex-1 px-6 py-10">
      <div className="mx-auto max-w-[1180px]">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[.2em] text-brandindigo">People and authority</div>
            <h2 className="mt-2 text-4xl font-black tracking-[-.035em]">Roster</h2>
            <p className="mt-3 max-w-2xl text-[15px] leading-7 text-lavdim">
              The people {workspaceName} works with, their relationship status, and any supporting evidence they have confirmed.
            </p>
          </div>
          <div className="flex gap-2 text-xs font-semibold text-lav">
            <span className="rounded-full border border-hairstrong bg-card px-3 py-2">{activeCount} active</span>
            {pendingCount > 0 ? <span className="rounded-full border border-[#826b2b] bg-[#2a2111] px-3 py-2 text-[#f0ca58]">{pendingCount} awaiting</span> : null}
          </div>
        </div>

        {error ? (
          <section className="mt-8 rounded-[18px] border border-[#784044] bg-[#261416] p-6 text-[#ffb8bd]">
            <h3 className="font-bold">Roster unavailable</h3>
            <p className="mt-2 text-sm">{error}</p>
          </section>
        ) : rows.length === 0 ? (
          <section className="mt-8 rounded-[18px] border border-dashed border-hairstrong bg-card p-10 text-center">
            <h3 className="text-lg font-bold">No roster relationships yet</h3>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-lavdim">
              When this workspace proposes or forms a relationship with a Member, it will appear here. A proposal never grants access until that Member accepts it.
            </p>
          </section>
        ) : (
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {rows.map(row => {
              const start = formatDate(row.effective_from)
              const end = formatDate(row.terminates_on ?? row.ended_at)
              return (
                <article key={row.id} className="rounded-[18px] border border-hairstrong bg-card p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="truncate text-lg font-bold text-white">{row.memberDisplayName}</h3>
                      {row.memberHandle && row.memberDisplayName !== `@${row.memberHandle}` ? (
                        <div className="mt-0.5 truncate text-sm text-lavdim">@{row.memberHandle}</div>
                      ) : null}
                    </div>
                    <span className="flex-none rounded-full border border-hairstrong bg-white/[.035] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.08em] text-lav">
                      {STATE_LABELS[row.state]}
                    </span>
                  </div>
                  <div className="mt-5 border-t border-hair pt-4">
                    <div className="text-sm font-semibold text-white">{row.professional_role || 'Role not specified'}</div>
                    <div className="mt-1 text-xs text-lavdim">
                      {row.authorityStatus.reason === 'supported'
                        ? TIER_LABELS[row.authorityTier]
                        : AUTHORITY_REASON_LABELS[row.authorityStatus.reason]}
                    </div>
                    {start || end ? (
                      <div className="mt-3 text-xs text-lavdim">
                        {start ? `From ${start}` : 'No start date'}{end ? ` · Through ${end}` : ''}
                      </div>
                    ) : null}
                  </div>
                  {canProposeRights && workspaceId && row.state === 'accepted' && row.authorityTier === 'authority' ? (
                    <WorkspaceRightsProposalForm workspaceId={workspaceId} relationshipId={row.id} />
                  ) : null}
                </article>
              )
            })}
          </div>
        )}

        <p className="mt-6 text-xs leading-5 text-lavdim">
          Roster membership and rights authority are different facts. Funūn shows what was declared and confirmed; it does not decide ownership or interpret agreements.
        </p>
      </div>
    </main>
  )
}
