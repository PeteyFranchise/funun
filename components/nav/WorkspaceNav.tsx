import Link from 'next/link'
import { AccountContextSwitch } from '@/components/auth/AccountContextSwitch'
import { SignOutButton } from '@/components/auth/SignOutButton'
import { ReportProblemLink } from '@/components/nav/ReportProblemLink'
import { WorkspaceContextSwitcher } from '@/components/nav/WorkspaceContextSwitcher'
import { WorkspaceSectionLinks } from '@/components/nav/WorkspaceSectionLinks'
import type { ActiveWorkspaceContext } from '@/lib/workspaces/active-context'
import {
  workspaceRoleLabel,
  type WorkspaceSwitcherOption,
} from '@/lib/workspaces/navigation'

export function WorkspaceNav({
  workspace,
  workspaces,
  memberName,
}: {
  workspace: ActiveWorkspaceContext
  workspaces: readonly WorkspaceSwitcherOption[]
  memberName: string
}) {
  const initials = memberName
    .replace(/^@/, '')
    .split(/[\s\-_.]+/)
    .filter(Boolean)
    .map(word => word[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <nav className="relative flex min-h-screen w-[252px] min-w-[252px] flex-none flex-col border-r border-hair bg-nav-rail px-[18px] pb-6 pt-[30px]">
      <Link href="/vault" className="mb-8 px-3">
        <div className="gtext text-[25px] font-black tracking-[.04em]">FUNŪN</div>
        <div className="mt-[3px] text-[10px] font-bold tracking-[.32em] text-lavdim">THE ARTS</div>
      </Link>

      <WorkspaceContextSwitcher
        workspaces={workspaces}
        currentWorkspaceId={workspace.id}
      />

      <div className="mb-3 mt-1 px-[14px] text-[11px] font-bold uppercase tracking-[.18em] text-lavdim">
        Workspace
      </div>
      <WorkspaceSectionLinks
        workspaceId={workspace.id}
        rosterEnabled={workspace.rosterEnabled}
        showMasterClaims={workspace.type === 'label'}
      />

      <div className="mt-4 rounded-[12px] border border-hair bg-white/[.025] px-3 py-3">
        <div className="truncate text-[12px] font-bold text-white">{workspace.name}</div>
        <div className="mt-1 text-[10px] text-lavdim">
          {workspace.typeLabel} · {workspaceRoleLabel(workspace.role)}
        </div>
      </div>

      <div className="flex-1" />

      <Link
        href="/profile"
        className="mt-2 flex items-center gap-3 border-t border-hair px-3 py-3 transition hover:opacity-90"
      >
        <span className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-full bg-grad text-[15px] font-extrabold text-white">
          {initials || 'M'}
        </span>
        <span className="min-w-0 leading-tight">
          <span className="mb-0.5 block text-[9px] font-bold uppercase tracking-[.14em] text-brandindigo">
            Signed in as
          </span>
          <span className="block truncate text-[14px] font-bold text-white">{memberName}</span>
          <span className="block text-[11px] text-lavdim">Member Account</span>
        </span>
      </Link>

      <div className="px-3 pb-2">
        <AccountContextSwitch currentContext="personal" />
      </div>
      <div className="px-3">
        <ReportProblemLink collapsed={false} />
      </div>
      <div className="px-3 pb-3">
        <SignOutButton appearance="nav" />
      </div>
    </nav>
  )
}
