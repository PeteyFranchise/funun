import { WorkspaceActivityExplorer } from '@/components/workspaces/WorkspaceActivityExplorer'
import type { WorkspaceActivityRecord } from '@/lib/workspaces/room-data'

export function WorkspaceActivityView({
  workspaceId,
  rows,
  error,
  offset,
  pageSize,
}: {
  workspaceId: string
  rows: readonly WorkspaceActivityRecord[]
  error?: string
  offset: number
  pageSize: number
}) {
  return (
    <main className="flex-1 px-6 py-10">
      <div className="mx-auto max-w-[1180px]">
        <div className="text-[11px] font-bold uppercase tracking-[.2em] text-brandindigo">Workspace record</div>
        <h2 className="mt-2 text-4xl font-black tracking-[-.035em]">Activity</h2>
        <p className="mt-3 max-w-2xl text-[15px] leading-7 text-lavdim">
          Find important workspace actions by person, category, or date. Sensitive change details stay protected unless your role or direct involvement permits them.
        </p>

        {error ? (
          <section className="mt-8 rounded-[18px] border border-[#784044] bg-[#261416] p-6 text-[#ffb8bd]">
            <h3 className="font-bold">Activity unavailable</h3>
            <p className="mt-2 text-sm">{error}</p>
          </section>
        ) : rows.length === 0 && offset === 0 ? (
          <section className="mt-8 rounded-[18px] border border-dashed border-hairstrong bg-card p-10 text-center">
            <h3 className="text-lg font-bold">No workspace activity yet</h3>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-lavdim">
              Important membership, roster, permission, project, and ownership actions will be recorded here.
            </p>
          </section>
        ) : (
          <WorkspaceActivityExplorer
            workspaceId={workspaceId}
            rows={rows}
            offset={offset}
            pageSize={pageSize}
          />
        )}
      </div>
    </main>
  )
}
