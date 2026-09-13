import {
  workspaceBillingStatusLabel,
  workspacePlanLabel,
  type WorkspaceBillingSnapshot,
} from '@/lib/workspaces/billing'
import {
  formatWorkspaceUsage,
  WORKSPACE_USAGE_LABELS,
  WORKSPACE_USAGE_METRICS,
  type WorkspaceUsageSnapshot,
} from '@/lib/workspaces/usage'

export function WorkspacePlanPanel({
  snapshot,
  usage,
}: {
  snapshot: WorkspaceBillingSnapshot | null
  usage: WorkspaceUsageSnapshot | null
}) {
  return (
    <main className="mx-auto w-full max-w-[1180px] px-6 py-8">
      <div className="mb-7">
        <div className="text-[10px] font-bold uppercase tracking-[.2em] text-brandindigo">
          Workspace administration
        </div>
        <h2 className="mt-2 text-3xl font-black tracking-[-.025em]">Plan & usage</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-lavdim">
          This plan belongs to the workspace. Your personal Funūn plan and personal catalogue stay
          separate.
        </p>
      </div>

      {snapshot ? (
        <section className="rounded-2xl border border-hair bg-card p-6" aria-labelledby="workspace-plan-heading">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.18em] text-lavdim">Current plan</p>
              <h3 id="workspace-plan-heading" className="mt-2 text-xl font-black text-white">
                {workspacePlanLabel(snapshot.plan)}
              </h3>
              <p className="mt-2 text-sm text-lavdim">
                Seats, roster activity, storage, AI, and e-sign usage are measured during beta but
                no limits are enforced.
              </p>
            </div>
            <span
              className={`rounded-full border px-3 py-1.5 text-xs font-bold ${
                snapshot.writesAllowed
                  ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
                  : 'border-amber-400/30 bg-amber-400/10 text-amber-200'
              }`}
            >
              {workspaceBillingStatusLabel(snapshot.status)}
            </span>
          </div>

          <div className="mt-6 border-t border-hair pt-5 text-sm leading-6 text-lavdim">
            {snapshot.writesAllowed ? (
              <p>This workspace can currently create and change workspace records.</p>
            ) : (
              <p>
                The workspace is read-only. Its roster, contracts, rights evidence, attachments,
                and history remain available and nothing has been deleted.
              </p>
            )}
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-amber-400/25 bg-amber-400/[.05] p-6" role="status">
          <h3 className="font-bold text-white">Workspace billing is awaiting activation</h3>
          <p className="mt-2 text-sm leading-6 text-lavdim">
            The workspace remains available under its current access controls. Migration 221 must
            be owner-approved before this plan record appears.
          </p>
        </section>
      )}

      <section className="mt-5 rounded-2xl border border-hair bg-card p-6" aria-labelledby="workspace-usage-heading">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 id="workspace-usage-heading" className="font-bold text-white">Last 30 days</h3>
            <p className="mt-1 text-sm leading-6 text-lavdim">
              Beta usage is tracked to help Funūn learn. These numbers do not impose limits or use
              your personal Member credits.
            </p>
          </div>
          <span className="rounded-full border border-brandindigo/30 bg-brandindigo/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[.12em] text-brandindigo">
            Tracked, not enforced
          </span>
        </div>

        {usage ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <UsageCard label="Active workspace seats" value={String(usage.activeSeats)} />
            <UsageCard label="Accepted roster relationships" value={String(usage.acceptedRosterRelationships)} />
            {WORKSPACE_USAGE_METRICS.map(metric => (
              <UsageCard
                key={metric}
                label={WORKSPACE_USAGE_LABELS[metric]}
                value={formatWorkspaceUsage(metric, usage.totals[metric])}
              />
            ))}
          </div>
        ) : (
          <p className="mt-5 rounded-xl border border-dashed border-hair px-4 py-5 text-sm text-lavdim" role="status">
            Usage metering is awaiting owner-approved migration 222. Nothing is being limited.
          </p>
        )}
      </section>

      <section className="mt-5 rounded-2xl border border-hair bg-white/[.02] p-6">
        <h3 className="font-bold text-white">What never changes with this plan</h3>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-lavdim">
          <li>• Your personal catalogue and personal subscription remain yours.</li>
          <li>• Billing status never changes credits, splits, ownership, or royalty entitlement.</li>
          <li>• A lapse never deletes contracts, rights evidence, roster history, or audit records.</li>
        </ul>
      </section>
    </main>
  )
}

function UsageCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-hair bg-white/[.025] p-4">
      <p className="text-xs leading-5 text-lavdim">{label}</p>
      <p className="mt-2 text-xl font-black text-white">{value}</p>
    </div>
  )
}
