import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { createSubmission } from '@/lib/submissions'
import { createNotification } from '@/lib/notifications'
import type { Opportunity } from '@/types'

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

  // Opportunity must be active and have an open slot.
  const { data: opp } = await supabase
    .from('opportunities')
    .select('*')
    .eq('id', opportunityId)
    .maybeSingle()
  if (!opp || !opp.active) {
    return NextResponse.json({ error: 'This opportunity is no longer open' }, { status: 404 })
  }
  const opportunity = opp as Opportunity
  if (opportunity.slots_available > 0 && opportunity.slots_filled >= opportunity.slots_available) {
    return NextResponse.json({ error: 'All slots have been filled' }, { status: 400 })
  }

  // The artist must own the project and have a match row for it.
  const { data: project } = await supabase
    .from('vault_projects')
    .select('id, title')
    .eq('id', b.projectId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const { data: match } = await supabase
    .from('opportunity_matches')
    .select('id, applied')
    .eq('opportunity_id', opportunityId)
    .eq('project_id', b.projectId)
    .maybeSingle()
  if (!match) {
    return NextResponse.json({ error: 'This project isn’t matched to this opportunity' }, { status: 400 })
  }
  if (match.applied) {
    return NextResponse.json({ error: 'You’ve already applied with this project' }, { status: 400 })
  }

  // 1. Mark the match applied (artist owns it via RLS).
  await supabase
    .from('opportunity_matches')
    .update({ applied: true, applied_at: new Date().toISOString(), status: 'applied' })
    .eq('id', match.id)

  // 2. Record a submission so it shows in the project's outreach history.
  const { data: submission, error: subErr } = await createSubmission(supabase, {
    projectId: b.projectId,
    userId: user.id,
    type: 'antenna',
    destination: { name: opportunity.title },
    pitchText: b.note ?? null,
    status: 'sent',
  })
  if (subErr) return NextResponse.json({ error: subErr }, { status: 500 })

  // 3. Cross-user writes via service client: increment slots, notify owner.
  try {
    const service = createServiceClient()
    await service
      .from('opportunities')
      .update({ slots_filled: opportunity.slots_filled + 1 })
      .eq('id', opportunityId)

    await createNotification(service, {
      userId: opportunity.created_by,
      type: 'application_received',
      title: 'New application on your opportunity',
      body: `"${project.title}" applied to ${opportunity.title}.`,
      link: `/opportunities/${opportunityId}`,
      data: { opportunityId, projectId: b.projectId },
    })
  } catch {
    // Non-fatal: the application already succeeded.
  }

  return NextResponse.json({ data: { submission, applied: true } })
}
