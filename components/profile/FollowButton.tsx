'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const ghostClass = 'border border-hairstrong bg-card text-white'

export function FollowButton({
  profileUserId,
  initialFollowing,
  canFollow,
}: {
  profileUserId: string
  initialFollowing: boolean
  canFollow: boolean
}) {
  const router = useRouter()
  const [following, setFollowing] = useState(initialFollowing)
  const [busy, setBusy] = useState(false)

  async function toggle() {
    if (!canFollow || busy) return
    setBusy(true)
    const next = !following
    setFollowing(next) // optimistic
    const res = await fetch('/api/follows', {
      method: next ? 'POST' : 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ followeeId: profileUserId }),
    })
    setBusy(false)
    if (!res.ok) {
      setFollowing(!next) // revert
      return
    }
    router.refresh()
  }

  if (!canFollow) {
    // Not signed in (or own profile) — show a sign-in nudge.
    return (
      <a
        href="/signin"
        className={`inline-flex items-center gap-[9px] rounded-[11px] px-[22px] py-[13px] text-[15px] font-bold ${ghostClass}`}
      >
        Follow
      </a>
    )
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={[
        'inline-flex items-center gap-[9px] rounded-[11px] px-[22px] py-[13px] text-[15px] font-bold transition disabled:opacity-60',
        ghostClass,
      ].join(' ')}
    >
      {following ? 'Following' : 'Follow'}
    </button>
  )
}
