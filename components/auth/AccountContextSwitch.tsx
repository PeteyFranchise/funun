'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  accountWorkspaceLabel,
  beginAccountSwitch,
  type AccountWorkspace,
} from '@/lib/auth/session-identity'

function SwitchIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M7 7h11l-3-3" />
      <path d="m18 7-3 3" />
      <path d="M17 17H6l3 3" />
      <path d="m6 17 3-3" />
    </svg>
  )
}

export function AccountContextSwitch({
  currentContext,
  collapsed = false,
  appearance = 'member',
}: {
  currentContext: AccountWorkspace
  collapsed?: boolean
  appearance?: 'member' | 'team'
}) {
  const [switching, setSwitching] = useState(false)
  const targetContext: AccountWorkspace = currentContext === 'team' ? 'personal' : 'team'
  const targetLabel = accountWorkspaceLabel(targetContext)

  async function switchAccount() {
    if (switching) return
    setSwitching(true)
    beginAccountSwitch(targetContext)

    const supabase = createClient()
    await supabase.auth.signOut({ scope: 'local' })
    window.location.assign(`/signin?switchTo=${targetContext}`)
  }

  return (
    <button
      type="button"
      onClick={switchAccount}
      disabled={switching}
      title={collapsed ? `Switch to ${targetLabel}` : undefined}
      aria-label={`Switch to ${targetLabel}`}
      className={[
        'group flex min-h-[38px] items-center rounded-[10px] border transition disabled:cursor-wait disabled:opacity-60',
        collapsed ? 'w-[38px] justify-center px-2' : 'w-full gap-2.5 px-3 py-2',
        appearance === 'team'
          ? 'border-[color:var(--border)] text-[color:var(--ink-2)] hover:bg-[color:var(--border)] hover:text-[color:var(--ink)]'
          : 'border-hair text-lavdim hover:border-hairstrong hover:bg-white/[.045] hover:text-white',
      ].join(' ')}
    >
      <SwitchIcon className="h-[18px] w-[18px] flex-none" />
      {!collapsed && (
        <span className="truncate text-[12px] font-semibold">
          {switching ? 'Switching…' : `Switch to ${targetLabel}`}
        </span>
      )}
    </button>
  )
}
