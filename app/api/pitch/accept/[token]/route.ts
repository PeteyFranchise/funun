import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { createNotification } from '@/lib/notifications'

type PitchRow = {
  id: string
  status: string
  project_id: string
  curator_id: string
  artist_id: string
  response_token_expires_at: string | null
  vault_projects: { user_id: string; title: string } | { user_id: string; title: string }[] | null
}

// POST /api/pitch/accept/[token] — public, token-authenticated (no session,
// D-11). Reads a response_token generated at send time by /api/pitches
// (06-04) — this route never generates one. One-time-use via the
// status !== 'pending' guard (T-06-03).
export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const service = createServiceClient()
  const now = new Date().toISOString()

  const { data: pitch, error: updateError } = await service
    .from('pitch_history')
    .update({ status: 'accepted', responded_at: now })
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
    type: 'pitch_accepted',
    title: `A curator accepted your pitch for "${project.title}"`,
    link: `/launchpad/${pitch.project_id}`,
    sendEmailCopy: true,
    email: authUser.user?.email ?? null,
  })

  return NextResponse.json({ ok: true })
}
