'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { clearTabIdentity } from '@/lib/auth/session-identity'

type Props = {
  appearance?: 'text' | 'nav'
  collapsed?: boolean
}

function SignOutIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M10 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4" />
      <path d="m15 8 4 4-4 4" />
      <path d="M19 12H9" />
    </svg>
  )
}

export function SignOutButton({ appearance = 'text', collapsed = false }: Props) {
  const router = useRouter()
  const supabase = createClient()

  async function signOut() {
    clearTabIdentity()
    await supabase.auth.signOut({ scope: 'local' })
    router.push('/signin')
    router.refresh()
  }

  if (appearance === 'nav') {
    return (
      <button
        type="button"
        onClick={signOut}
        title={collapsed ? 'Sign out' : undefined}
        aria-label="Sign out"
        className={[
          'group flex min-h-[42px] items-center rounded-[11px] border border-transparent text-lavdim transition',
          'hover:border-hair hover:bg-white/[.045] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brandindigo/70',
          collapsed ? 'w-[42px] justify-center px-2' : 'w-full gap-3 px-3 py-2.5',
        ].join(' ')}
      >
        <SignOutIcon className="h-5 w-5 flex-none transition-transform group-hover:translate-x-0.5" />
        {!collapsed && <span className="text-[13px] font-semibold">Sign out</span>}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={signOut}
      className="text-sm text-white/60 transition hover:text-white"
    >
      Sign out
    </button>
  )
}
