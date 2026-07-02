import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { createNotification } from '@/lib/notifications'

const DECLINE_REASON_MAX_LENGTH = 500

type PitchRow = {
  id: string
  status: string
  project_id: string
  curator_id: string
  artist_id: string
  vault_projects: { user_id: string; title: string } | { user_id: string; title: string }[] | null
}

type DeclineBody = { reason?: string }

// POST /api/pitch/decline/[token] — public, token-authenticated (D-11/D-12).
// Same one-time-use guard as accept; the optional reason is skippable
// (empty textarea + Decline IS the skip, per the UI contract).
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const service = createServiceClient()

  const body = (await request.json().catch(() => ({}))) as DeclineBody
  const reason =
    typeof body.reason === 'string' && body.reason.trim().length > 0
      ? body.reason.trim().slice(0, DECLINE_REASON_MAX_LENGTH)
      : null

  const { data: pitch } = await service
    .from('pitch_history')
    .select('id, status, project_id, curator_id, artist_id, vault_projects(user_id, title)')
    .eq('response_token', token)
    .maybeSingle<PitchRow>()

  if (!pitch) {
    return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 })
  }
  if (pitch.status !== 'pending') {
    return NextResponse.json({ error: 'This pitch was already responded to' }, { status: 410 })
  }

  const project = Array.isArray(pitch.vault_projects) ? pitch.vault_projects[0] : pitch.vault_projects
  if (!project) {
    return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 })
  }

  const { error: updateError } = await service
    .from('pitch_history')
    .update({ status: 'declined', responded_at: new Date().toISOString(), decline_reason: reason })
    .eq('id', pitch.id)
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // D-14: notify the artist via in-app + email, reusing the Antenna-match
  // notification pattern verbatim.
  const { data: authUser } = await service.auth.admin.getUserById(project.user_id)
  await createNotification(service, {
    userId: project.user_id,
    type: 'pitch_declined',
    title: `A curator declined your pitch for "${project.title}"`,
    link: `/launchpad/${pitch.project_id}`,
    sendEmailCopy: true,
    email: authUser.user?.email ?? null,
  })

  return NextResponse.json({ ok: true })
}
