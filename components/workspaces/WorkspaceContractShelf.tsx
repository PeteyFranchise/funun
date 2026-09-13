import Link from 'next/link'
import type {
  WorkspaceContractShelfData,
  WorkspaceContractShelfRecord,
  WorkspaceDocumentState,
  WorkspaceEvidenceState,
} from '@/lib/workspaces/contract-shelf'

const EVIDENCE_STATE: Record<WorkspaceEvidenceState, { label: string; className: string }> = {
  awaiting_confirmation: {
    label: 'Awaiting Member confirmation',
    className: 'border-[#826b2b] bg-[#2a2111] text-[#f0ca58]',
  },
  confirmed_record: {
    label: 'Member-confirmed record',
    className: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
  },
  not_yet_effective: {
    label: 'Effective date is upcoming',
    className: 'border-sky-400/30 bg-sky-400/10 text-sky-300',
  },
  expired: {
    label: 'Expired record',
    className: 'border-[#784044] bg-[#261416] text-[#ffb8bd]',
  },
  superseded: {
    label: 'Superseded record',
    className: 'border-hairstrong bg-white/[.035] text-lavdim',
  },
  document_not_linked: {
    label: 'Document not linked',
    className: 'border-[#826b2b] bg-[#2a2111] text-[#f0ca58]',
  },
  record_issue: {
    label: 'Record needs review',
    className: 'border-[#784044] bg-[#261416] text-[#ffb8bd]',
  },
}

const DOCUMENT_STATE: Record<WorkspaceDocumentState, string> = {
  pending: 'Document status: pending',
  signed: 'Document status: signed',
  verified: 'Document status: verified (system record, not legal review)',
  unavailable: 'Document details remain Member-controlled',
}

function formatDate(value: string | null): string | null {
  if (!value) return null
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime())) return null
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed)
}

function groupByProject(records: readonly WorkspaceContractShelfRecord[]) {
  const groups = new Map<string, WorkspaceContractShelfRecord[]>()
  for (const record of records) {
    const current = groups.get(record.projectLabel) ?? []
    current.push(record)
    groups.set(record.projectLabel, current)
  }
  return [...groups.entries()]
}

function RecordCard({ record }: { record: WorkspaceContractShelfRecord }) {
  const state = EVIDENCE_STATE[record.evidenceState]
  const uploadedAt = formatDate(record.uploadedAt)
  const signedAt = formatDate(record.signedAt)
  const confirmedAt = formatDate(record.confirmedAt)
  const effectiveFrom = formatDate(record.effectiveFrom)
  const expiresAt = formatDate(record.expiresAt)
  const supersededAt = formatDate(record.supersededAt)

  return (
    <details className="group rounded-[15px] border border-hair bg-white/[.025] open:border-hairstrong open:bg-white/[.04]">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4 px-4 py-4 marker:hidden">
        <div className="min-w-0">
          <div className="text-[14px] font-bold text-white">{record.documentTypeLabel}</div>
          <div className="mt-1 text-xs text-lavdim">{DOCUMENT_STATE[record.documentState]}</div>
        </div>
        <div className="flex flex-none items-center gap-2">
          <span className={`rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-[.08em] ${state.className}`}>
            {state.label}
          </span>
          <span className="mt-1 text-lavdim transition group-open:rotate-180" aria-hidden>⌄</span>
        </div>
      </summary>
      <div className="border-t border-hair px-4 pb-4 pt-4">
        <dl className="grid gap-x-6 gap-y-4 text-xs sm:grid-cols-2">
          <div>
            <dt className="font-bold uppercase tracking-[.08em] text-lavdim">Declared scope</dt>
            <dd className="mt-1.5 leading-5 text-lav">{record.declaredScope || 'No scope entered'}</dd>
          </div>
          <div>
            <dt className="font-bold uppercase tracking-[.08em] text-lavdim">Provenance</dt>
            <dd className="mt-1.5 leading-5 text-lav">
              Recorded by {record.uploadedByDisplayName}{uploadedAt ? ` on ${uploadedAt}` : ''}
            </dd>
          </div>
          <div>
            <dt className="font-bold uppercase tracking-[.08em] text-lavdim">Member confirmation</dt>
            <dd className="mt-1.5 leading-5 text-lav">
              {confirmedAt ? `Confirmed ${confirmedAt}` : 'Not confirmed yet'}
            </dd>
          </div>
          <div>
            <dt className="font-bold uppercase tracking-[.08em] text-lavdim">Signature observation</dt>
            <dd className="mt-1.5 leading-5 text-lav">
              {record.witnessedBySignature
                ? 'Signature witnessed in Funūn'
                : 'No Funūn-witnessed signature recorded'}
            </dd>
          </div>
          {(effectiveFrom || expiresAt || supersededAt || signedAt) && (
            <div className="sm:col-span-2">
              <dt className="font-bold uppercase tracking-[.08em] text-lavdim">Recorded dates</dt>
              <dd className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 leading-5 text-lav">
                {effectiveFrom ? <span>Effective from {effectiveFrom}</span> : null}
                {expiresAt ? <span>Expires {expiresAt}</span> : null}
                {supersededAt ? <span>Superseded {supersededAt}</span> : null}
                {signedAt ? <span>Marked signed {signedAt}</span> : null}
              </dd>
            </div>
          )}
        </dl>
        {record.canonicalHref ? (
          <Link
            href={record.canonicalHref}
            className="mt-4 inline-flex rounded-[10px] border border-hairstrong bg-card2 px-3 py-2 text-xs font-bold text-lav transition hover:border-brandindigo/60 hover:text-white"
          >
            Open your canonical document record →
          </Link>
        ) : (
          <p className="mt-4 text-[11px] leading-5 text-lavdim">
            The underlying file stays in the controlling Member’s private Contract Locker. This workspace view does not expose it.
          </p>
        )}
      </div>
    </details>
  )
}

export function WorkspaceContractShelf({
  workspaceName,
  data,
  error,
}: {
  workspaceName: string
  data: WorkspaceContractShelfData
  error?: string
}) {
  const actionCount = data.groups
    .flatMap(group => group.records)
    .filter(record =>
      ['awaiting_confirmation', 'expired', 'document_not_linked', 'record_issue'].includes(record.evidenceState)
    ).length

  return (
    <main className="flex-1 px-6 py-10">
      <div className="mx-auto max-w-[1180px]">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[.2em] text-brandindigo">Agreement records</div>
            <h2 className="mt-2 text-4xl font-black tracking-[-.035em]">Contract Locker</h2>
            <p className="mt-3 max-w-2xl text-[15px] leading-7 text-lavdim">
              Supporting agreement records connected to people {workspaceName} works with. Files remain controlled by the Member who owns them.
            </p>
          </div>
          <div className="flex gap-2 text-xs font-semibold text-lav">
            <span className="rounded-full border border-hairstrong bg-card px-3 py-2">
              {data.recordCount} record{data.recordCount === 1 ? '' : 's'}
            </span>
            {actionCount > 0 ? (
              <span className="rounded-full border border-[#826b2b] bg-[#2a2111] px-3 py-2 text-[#f0ca58]">
                {actionCount} need attention
              </span>
            ) : null}
          </div>
        </div>

        <section className="mt-7 rounded-[16px] border border-brandindigo/30 bg-brandindigo/[.08] px-5 py-4 text-sm leading-6 text-lav">
          <strong className="text-white">What this view means:</strong> Funūn records what was uploaded, declared, confirmed, and witnessed in its own signing flow. It does not interpret an agreement, determine its legal effect, or turn a stored record into legal verification.
        </section>

        {error ? (
          <section className="mt-8 rounded-[18px] border border-[#784044] bg-[#261416] p-6 text-[#ffb8bd]">
            <h3 className="font-bold">Contract records unavailable</h3>
            <p className="mt-2 text-sm">{error}</p>
          </section>
        ) : data.groups.length === 0 ? (
          <section className="mt-8 rounded-[18px] border border-dashed border-hairstrong bg-card p-10 text-center">
            <h3 className="text-lg font-bold">No workspace agreement records yet</h3>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-lavdim">
              When supporting evidence is attached to a roster relationship, the people who are permitted to see it will find its provenance and lifecycle here. Private Contract Locker files are never copied into the workspace.
            </p>
          </section>
        ) : (
          <div className="mt-8 space-y-6">
            {data.groups.map(group => (
              <section key={group.memberUserId} className="overflow-hidden rounded-[20px] border border-hairstrong bg-card">
                <header className="flex items-center gap-3 border-b border-hair px-5 py-4">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-grad text-sm font-extrabold text-white">
                    {group.memberDisplayName.replace(/^@/, '').slice(0, 1).toUpperCase() || 'M'}
                  </span>
                  <div className="min-w-0">
                    <h3 className="truncate text-lg font-bold text-white">{group.memberDisplayName}</h3>
                    {group.memberHandle && group.memberDisplayName !== `@${group.memberHandle}` ? (
                      <div className="truncate text-xs text-lavdim">@{group.memberHandle}</div>
                    ) : null}
                  </div>
                </header>
                <div className="space-y-5 p-5">
                  {groupByProject(group.records).map(([projectLabel, records]) => (
                    <div key={projectLabel}>
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <h4 className="text-[11px] font-bold uppercase tracking-[.14em] text-lavdim">{projectLabel}</h4>
                        <span className="text-[10px] text-lavdim">{records.length} item{records.length === 1 ? '' : 's'}</span>
                      </div>
                      <div className="space-y-2">
                        {records.map(record => <RecordCard key={record.evidenceId} record={record} />)}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {data.limited ? (
          <p className="mt-6 text-xs leading-5 text-lavdim">
            Showing the latest {data.recordCount} visible records. A paginated archive will be added if a workspace reaches this beta limit.
          </p>
        ) : null}
        <p className="mt-6 text-xs leading-5 text-lavdim">
          Status wording is provisional for beta and remains subject to counsel review. Document status and relationship authority are separate facts.
        </p>
      </div>
    </main>
  )
}
