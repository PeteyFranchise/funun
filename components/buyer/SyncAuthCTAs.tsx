'use client'

import { useState } from 'react'
import { LoginRegisterModal } from '@/components/buyer/LoginRegisterModal'

// ─── SyncAuthCTAs (23-07 Task 3) ────────────────────────────────────────
// Small 'use client' island for the /sync landing page's "Log in / Request
// access" CTA. app/sync/page.tsx is a server component (deliberately —
// see its own header comment on staying static-content-safe); Next.js
// requires 'use client' at the top of a whole module, so the modal-holding
// state cannot live inline in that file. This co-located component is the
// entire client boundary: two buttons (Log in / Request access) opening
// the SAME LoginRegisterModal with a different initialTab, per the plan's
// literal instruction. The Browse CTA stays a plain <Link> in page.tsx.
export function SyncAuthCTAs({ className }: { className?: string }) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'login' | 'register'>('login')

  function openWith(nextTab: 'login' | 'register') {
    setTab(nextTab)
    setOpen(true)
  }

  return (
    <>
      <button type="button" className={className ?? 'cta cta-secondary'} onClick={() => openWith('login')}>
        Log in
      </button>
      <button type="button" className={className ?? 'cta cta-secondary'} onClick={() => openWith('register')}>
        Request access
      </button>
      <LoginRegisterModal open={open} onClose={() => setOpen(false)} initialTab={tab} />
    </>
  )
}
