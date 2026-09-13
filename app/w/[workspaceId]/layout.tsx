export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import { SessionIdentityGuard } from '@/components/auth/SessionIdentityGuard'
import { ChooseHandleGate } from '@/components/handles/ChooseHandleGate'
import { MessagesIcon } from '@/components/nav/MessagesIcon'
import { NotificationBell } from '@/components/nav/NotificationBell'
import { PresenceTracker } from '@/components/nav/PresenceTracker'
import { ArtistLayoutClient } from '@/components/nav/ArtistLayoutClient'
import { WorkspaceNav } from '@/components/nav/WorkspaceNav'
import { resolveHandleGate } from '@/lib/handles/gate'
import { profileDisplayTitle } from '@/lib/profile/display-name'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import {
  loadWorkspaceSwitcherOptions,
  resolveActiveWorkspaceContext,
} from '@/lib/workspaces/active-context'
import { workspaceRoleLabel } from '@/lib/workspaces/navigation'

type Props = {
  children: React.ReactNode
  params: Promise<{ workspaceId: string }>
}

export default async function MemberWorkspaceLayout({ children, params }: Props) {
  const { workspaceId } = await params
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/signin?next=${encodeURIComponent(`/w/${workspaceId}`)}`)
  }

  // The path parameter is the acting context. This server gate re-reads the
  // rollout decision and exact live membership on every workspace request;
  // the nav and URL are presentation, never authorization (D-30/D-31).
  const resolved = await resolveActiveWorkspaceContext(supabase, user, workspaceId)
  if (!resolved.ok) {
    // A direct id outside the caller's reach must not reveal whether a
    // workspace exists. The write APIs preserve their more specific 401 /
    // 403 / 404 / 503 contracts independently.
    notFound()
  }

  const service = createServiceClient()
  const { data: profileRow } = await service
    .from('user_profiles')
    .select('handle, artist_name')
    .eq('id', user.id)
    .maybeSingle()

  // Shared workspaces belong to full Member Accounts. A bare auth identity
  // or buyer-only identity cannot become a Member merely by knowing a URL.
  if (!profileRow) notFound()

  const handleGate = await resolveHandleGate({
    user,
    loadProfile: async () => ({ handle: (profileRow.handle as string | null) ?? null }),
    renderGate: userId => <ChooseHandleGate userId={userId} />,
  })
  if (handleGate) return handleGate

  const memberName =
    profileDisplayTitle({
      artistName: (profileRow.artist_name as string | null) ?? null,
      handle: (profileRow.handle as string | null) ?? null,
    }) || 'Member'

  const loadedOptions = await loadWorkspaceSwitcherOptions(supabase, service, user.id)
  const workspaceOptions = loadedOptions.some(option => option.id === resolved.context.id)
    ? loadedOptions
    : [resolved.context, ...loadedOptions]

  const body = (
    <div className="flex min-h-screen bg-ink text-white">
      <WorkspaceNav
        workspace={resolved.context}
        workspaces={workspaceOptions}
        memberName={memberName}
      />
      <div className="flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-40 flex items-center justify-end gap-3 border-b border-hair bg-[rgba(10,10,15,.72)] px-6 py-4 backdrop-blur-[20px]">
          <MessagesIcon userId={user.id} />
          <NotificationBell userId={user.id} />
        </header>
        <div className="border-b border-hair bg-card/30 px-6 py-5">
          <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-5">
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-[.2em] text-brandindigo">
                Active workspace
              </div>
              <h1 className="mt-1 truncate text-2xl font-black tracking-[-.02em]">
                {resolved.context.name}
              </h1>
            </div>
            <div className="flex flex-none items-center gap-2 text-[11px] font-semibold text-lav">
              <span className="rounded-full border border-hairstrong bg-card2 px-3 py-1.5">
                {resolved.context.typeLabel}
              </span>
              <span className="rounded-full border border-hairstrong bg-white/[.035] px-3 py-1.5">
                {workspaceRoleLabel(resolved.context.role)}
              </span>
            </div>
          </div>
        </div>
        {children}
      </div>
      <PresenceTracker userId={user.id} />
    </div>
  )

  return (
    <SessionIdentityGuard
      identity={{ userId: user.id, context: 'personal', label: 'Member Account' }}
    >
      <ArtistLayoutClient userId={user.id} enableGlobalCapture={false}>
        {body}
      </ArtistLayoutClient>
    </SessionIdentityGuard>
  )
}
