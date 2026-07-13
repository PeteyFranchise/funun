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
  response_token_expires_at: string | null
  vault_projects: { user_id: string; title: string } | { user_id: string; title: string }[] | null
}

type DeclineBody = { reason?: string }

// POST /api/pitch/decline/[token] — public, token-authenticated (D-11/D-12).
// Same one-time-use guard as accept; the optional reason is skippable
// (empty textarea + Decline IS the skip, per the UI contract).
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const service = createServiceClient()
  const now = new Date().toISOString()

  const body = (await request.json().catch(() => ({}))) as DeclineBody
  const reason =
    typeof body.reason === 'string' && body.reason.trim().length > 0
      ? body.reason.trim().slice(0, DECLINE_REASON_MAX_LENGTH)
      : null

  const { data: pitch, error: updateError } = await service
    .from('pitch_history')
    .update({ status: 'declined', responded_at: now, decline_reason: reason })
    .eq('response_token', token)
    .eq('status', 'pending')
    .gt('response_token_expires_at', now)
    .select('id, status, project_id, curator_id, artist_id, response_token_expires_at, vault_projects(user_id, title)')
    .maybeSingle<PitchRow>()
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }
  if (!pitch) {
    const { data: existing } = await service
      .from('pitch_history')
      .select('id, status, response_token_expires_at')
      .eq('response_token', token)
      .maybeSingle()
    const expired =
      existing?.response_token_expires_at &&
      existing.response_token_expires_at <= now
    return NextResponse.json(
      {
        error: expired
          ? 'This pitch link has expired'
          : existing
            ? 'This pitch was already responded to'
            : 'Invalid or expired link',
      },
      { status: existing ? 410 : 404 }
    )
  }

  const project = Array.isArray(pitch.vault_projects) ? pitch.vault_projects[0] : pitch.vault_projects
  if (!project) {
    return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 })
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
