import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Topbar } from '@/components/layout/Topbar'
import { LAUNCH_PHASES, PLAYBOOK, type PlaybookStatus } from '@/lib/launchpad/playbook'
import { createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const STATUS_BADGE: Record<PlaybookStatus, { label: string; cls: string }> = {
  built: { label: 'Available now', cls: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30' },
  partial: { label: 'Partial', cls: 'text-money2 bg-money/10 border-money/30' },
  planned: { label: 'Planned', cls: 'text-lavdim bg-white/[.04] border-hairstrong' },
}

export default async function LaunchpadPage() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/signin')

  // Fetch artist's vault projects for the project cards grid
  const { data: projects } = await supabase
    .from('vault_projects')
    .select('id, title')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const vaultProjects = projects ?? []

  const all = Object.values(PLAYBOOK).flat()
  const actionable = all.filter(t => t.status !== 'planned').length

  return (
    <>
      <Topbar
        title="Launchpad"
        subtitle="Your release marketing playbook — what to do before, during, and after launch"
      />
      <div className="flex-1 px-9 py-[30px]">
        {/* ─── Project cards — per-release launchpad rooms ─── */}
        {vaultProjects.length > 0 && (
          <div className="mb-7">
            <div className="mb-3">
              <h2 className="text-[12px] font-bold uppercase tracking-[.16em] text-lavdim">
                Your releases
              </h2>
              <p className="mt-1 text-[13px] text-lavdim">
                Open a release to track your post-release checklist
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {vaultProjects.map(project => (
                <div
                  key={project.id}
                  className="flex items-center justify-between rounded-[14px] border border-hair bg-card px-[18px] py-4"
                >
                  <span className="min-w-0 truncate font-bold text-white">{project.title}</span>
                  <Link
                    href={`/launchpad/${project.id}`}
                    className="ml-4 flex-none whitespace-nowrap rounded-[10px] bg-card2 px-4 py-[10px] text-[13px] font-bold text-white transition hover:bg-white/5"
                  >
                    Open Launchpad →
                  </Link>
                </div>
              ))}
            </div>
            <div className="mt-7 border-b border-hair" />
          </div>
        )}

        {/* ─── Existing playbook content — unchanged ─── */}
        <div className="mb-7 rounded-[16px] border border-brandindigo/30 bg-[linear-gradient(150deg,rgba(129,140,248,.14),rgba(217,70,239,.08))] px-5 py-4">
          <div className="text-[15px] font-semibold text-white">
            {actionable} of {all.length} steps you can act on in Funūn today.
          </div>
          <p className="mt-1 text-[13px] leading-[1.5] text-lav">
            This is your guided playbook with links to the tools that exist. Per-release
            campaign tracking (and native pre-save, Spotify pitch &amp; Canvas) are on the way.
          </p>
        </div>

        <div className="space-y-9">
          {LAUNCH_PHASES.map(phase => (
            <section key={phase.key}>
              <div className="mb-3">
                <h2 className="text-[12px] font-bold uppercase tracking-[.16em] text-lavdim">
                  {phase.title}
                </h2>
                <p className="mt-1 text-[13px] text-lavdim">{phase.blurb}</p>
              </div>

              <div className="space-y-[10px]">
                {PLAYBOOK[phase.key].map(task => {
                  const b = STATUS_BADGE[task.status]
                  return (
                    <div
                      key={task.key}
                      className="flex items-center gap-4 rounded-[14px] border border-hair bg-card px-[18px] py-4"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[15.5px] font-bold text-white">{task.label}</span>
                          <span className={`flex-none rounded-full border px-[9px] py-[2px] text-[11px] font-bold ${b.cls}`}>
                            {b.label}
                          </span>
                        </div>
                        <p className="mt-1 text-[13px] leading-[1.45] text-lav">{task.why}</p>
                      </div>
                      {task.href ? (
                        <Link
                          href={task.href}
                          className="flex-none whitespace-nowrap rounded-[10px] border border-hairstrong bg-card2 px-4 py-[10px] text-[13.5px] font-bold text-white transition hover:bg-white/5"
                        >
                          {task.via ?? 'Open'} →
                        </Link>
                      ) : (
                        <span className="flex-none whitespace-nowrap text-[12.5px] font-semibold text-lavdim">
                          Coming soon
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </>
  )
}
