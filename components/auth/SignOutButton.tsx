'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function SignOutButton() {
  const router = useRouter()
  const supabase = createClient()

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/signin')
    router.refresh()
  }

  return (
    <button onClick={signOut} className="text-sm text-white/60 transition hover:text-white">
      Sign out
    </button>
  )
}
