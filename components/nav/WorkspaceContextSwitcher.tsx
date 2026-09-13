import Link from 'next/link'
import {
  workspaceHomeHref,
  workspaceRoleLabel,
  type WorkspaceSwitcherOption,
} from '@/lib/workspaces/navigation'

export function WorkspaceContextSwitcher({
  workspaces,
  currentWorkspaceId = null,
  collapsed = false,
}: {
  workspaces: readonly WorkspaceSwitcherOption[]
  currentWorkspaceId?: string | null
  collapsed?: boolean
}) {
  if (workspaces.length === 0) return null

  const current = workspaces.find(workspace => workspace.id === currentWorkspaceId) ?? null
  const currentName = current?.name ?? 'Personal workspace'
  const initial = current ? current.name.trim().charAt(0).toUpperCase() : 'P'

  return (
    <details className="group/context relative mb-4">
      <summary
        title={collapsed ? `Working in ${currentName}` : undefined}
        className={[
          'flex cursor-pointer list-none items-center rounded-[11px] border border-hairstrong bg-white/[.035] transition hover:border-brandindigo/50 hover:bg-white/[.06] [&::-webkit-details-marker]:hidden',
          collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5',
        ].join(' ')}
      >
        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] bg-card2 text-xs font-black text-brandindigo">
          {initial}
        </span>
        {!collapsed && (
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block text-[9px] font-bold uppercase tracking-[.16em] text-lavdim">
              Working in
            </span>
            <span className="mt-1 block truncate text-[13px] font-bold text-white">{currentName}</span>
          </span>
        )}
        {!collapsed && (
          <svg
            viewBox="0 0 20 20"
            className="h-4 w-4 flex-none text-lavdim transition-transform group-open/context:rotate-180"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden
          >
            <path d="m5 7.5 5 5 5-5" />
          </svg>
        )}
      </summary>

      <div
        className={[
          'absolute z-[80] mt-2 overflow-hidden rounded-[14px] border border-hairstrong bg-[#121120] p-2 shadow-2xl',
          collapsed ? 'left-0 w-[250px]' : 'left-0 right-0',
        ].join(' ')}
      >
        <div className="px-2 pb-2 pt-1 text-[9px] font-bold uppercase tracking-[.17em] text-lavdim">
          Switch workspace
        </div>
        <Link
          href="/vault"
          aria-current={current ? undefined : 'page'}
          className={[
            'flex items-center gap-3 rounded-[10px] px-3 py-2.5 transition hover:bg-white/[.06]',
            current ? 'text-lav' : 'bg-card2 text-white',
          ].join(' ')}
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-[8px] border border-hair text-[11px] font-black">
            P
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[12px] font-bold">Personal workspace</span>
            <span className="block text-[10px] text-lavdim">Your own catalogue and tools</span>
          </span>
          {!current && <span className="text-xs text-brandindigo">✓</span>}
        </Link>

        <div className="my-2 border-t border-hair" />

        {workspaces.map(workspace => {
          const active = workspace.id === currentWorkspaceId
          return (
            <Link
              key={workspace.id}
              href={workspaceHomeHref(workspace.id)}
              aria-current={active ? 'page' : undefined}
              className={[
                'flex items-center gap-3 rounded-[10px] px-3 py-2.5 transition hover:bg-white/[.06]',
                active ? 'bg-card2 text-white' : 'text-lav',
              ].join(' ')}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-[8px] border border-brandindigo/30 bg-brandindigo/10 text-[11px] font-black text-brandindigo">
                {workspace.name.charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-[12px] font-bold">{workspace.name}</span>
                <span className="mt-0.5 block truncate text-[10px] text-lavdim">
                  {workspace.typeLabel} · {workspaceRoleLabel(workspace.role)}
                </span>
              </span>
              {active && <span className="text-xs text-brandindigo">✓</span>}
            </Link>
          )
        })}
      </div>
    </details>
  )
}
