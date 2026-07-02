import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { createNotification } from '@/lib/notifications'

type PitchRow = {
  id: string
  status: string
  project_id: string
  curator_id: string
  artist_id: string
  vault_projects: { user_id: string; title: string } | { user_id: string; title: string }[] | null
}

// POST /api/pitch/accept/[token] — public, token-authenticated (no session,
// D-11). Reads a response_token generated at send time by /api/pitches
// (06-04) — this route never generates one. One-time-use via the
// status !== 'pending' guard (T-06-03).
export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const service = createServiceClient()

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
    .update({ status: 'accepted', responded_at: new Date().toISOString() })
    .eq('id', pitch.id)
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
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
