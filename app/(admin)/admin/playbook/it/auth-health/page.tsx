import { AuthHealthPanel } from '@/components/playbook/AuthHealthPanel'
import { ItRoomTopBar } from '@/components/playbook/ItRoomTopBar'
import { loadAuthHealth } from '@/lib/auth/health'
import { IT_SUBPAGES } from '@/lib/playbook/nav'
import { requireRoomAccessPage } from '@/lib/playbook/rooms'
import { createServiceClient } from '@/lib/supabase/server'

const CRUMB = IT_SUBPAGES.find(page => page.slug === 'auth-health')!.label

export const dynamic = 'force-dynamic'

export default async function AuthHealthPage() {
  await requireRoomAccessPage('it-team')
  const data = await loadAuthHealth(createServiceClient())

  return (
    <div>
      <ItRoomTopBar crumb={CRUMB} showLiveChip />
      <div className="px-[28px] py-[20px]">
        <p className="mb-[18px] max-w-[780px] text-[12.5px] leading-relaxed text-[color:var(--ink-3)]">
          Authentication failure patterns with user-facing reference codes. This system never stores
          email addresses, user IDs, IP addresses, user agents, credentials, tokens, URLs, or raw
          provider errors. Events expire after 30 days.
        </p>
        <AuthHealthPanel data={data} />
      </div>
    </div>
  )
}
