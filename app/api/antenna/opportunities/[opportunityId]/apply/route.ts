import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { createNotification } from '@/lib/notifications'
import { emitActivity } from '@/lib/social/activity-emit'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

// POST /api/antenna/opportunities/[id]/apply — artist applies with a project.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ opportunityId: string }> }
) {
  if (DEMO) return NextResponse.json({ error: 'Applying is disabled in demo mode' }, { status: 400 })
  const { opportunityId } = await params

  const supabase = createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const b = (await request.json().catch(() => ({}))) as { projectId?: string; note?: string }
  if (!b.projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 })

  // Atomically validates ownership/match state, reserves a slot, marks the
  // match applied, and creates the submissions row. The Postgres function
  // locks the opportunity row, so concurrent applies cannot overfill slots.
  const service = createServiceClient()
  const { data: applyResult, error: applyError } = await service
    .rpc('apply_to_opportunity_atomic', {
      p_opportunity_id: opportunityId,
      p_project_id: b.projectId,
      p_user_id: user.id,
      p_note: b.note ?? null,
    })
    .single()

  if (applyError) return NextResponse.json({ error: applyError.message }, { status: 500 })

  const result = applyResult as {
    result: string
    opportunity_title: string | null
    opportunity_created_by: string | null
    project_title: string | null
    submission_id: string | null
  } | null

  if (!result || result.result !== 'applied') {
    const messages: Record<string, { error: string; status: number }> = {
      project_not_found: { error: 'Project not found', status: 404 },
      opportunity_closed: { error: 'This opportunity is no longer open', status: 404 },
      full: { error: 'All slots have been filled', status: 400 },
      no_match: { error: 'This project isn’t matched to this opportunity', status: 400 },
      already_applied: { error: 'You’ve already applied with this project', status: 400 },
    }
    const fallback = { error: 'Could not apply to this opportunity', status: 400 }
    const response = messages[result?.result ?? ''] ?? fallback
    return NextResponse.json({ error: response.error }, { status: response.status })
  }

  const opportunityTitle = result.opportunity_title ?? 'this opportunity'
  const projectTitle = result.project_title ?? 'your project'

  // Cross-user side effect via service client: notify owner.
  try {
    if (result.opportunity_created_by) {
      await createNotification(service, {
        userId: result.opportunity_created_by,
        type: 'application_received',
        title: 'New application on your opportunity',
        body: `"${projectTitle}" applied to ${opportunityTitle}.`,
        link: `/opportunities/${opportunityId}`,
        data: { opportunityId, projectId: b.projectId },
      })
    }
  } catch {
    // Non-fatal: the application already succeeded.
  }

  // Activity feed: record the pitch as a placement-track milestone.
  await emitActivity(supabase, {
    profileId: user.id,
    kind: 'placement',
    body: `Pitched “${projectTitle}” to ${opportunityTitle}.`,
    data: { opportunityId, projectId: b.projectId },
  })

  return NextResponse.json({ data: { submission: { id: result.submission_id }, applied: true } })
}
