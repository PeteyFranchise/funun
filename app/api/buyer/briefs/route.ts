import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { coerceBrief, deriveBriefTitle, BRIEF_PROSE_MAX } from '@/lib/buyer/brief'
import { buildBriefReceivedNotification } from '@/lib/deals/notifications'
import { createNotification } from '@/lib/notifications'

// ─── POST /api/buyer/briefs — persist a brief + route it to the AE (v2) ────
// buyer_briefs writes are REVOKEd from authenticated (migration 106) — this
// route is the only path a brief lands in the table. Auth-gated: a logged-in
// buyer (buyer_members row) only; guests register-gate in the UI before they
// reach here. The org comes from the caller's membership (never trusted from
// the body), created_by from the session; the brief is coerced against the
// known vocab. Mirrors app/api/buyer/requests exactly (D-13a dual attribution,
// service-role write, best-effort notification after the primary insert).
export async function POST(request: Request) {
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in to send a brief to your AE.' }, { status: 401 })

  const { data: member } = await supabase
    .from('buyer_members')
    .select('org_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!member) {
    return NextResponse.json({ error: 'You need a buyer account to send a brief.' }, { status: 403 })
  }

  const body = (await request.json().catch(() => null)) as { prose?: unknown; brief?: unknown } | null
  if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })

  const prose = typeof body.prose === 'string' ? body.prose.slice(0, BRIEF_PROSE_MAX * 2) : ''
  const brief = coerceBrief(body.brief)
  const title = deriveBriefTitle(brief, prose)

  const service = createServiceClient()
  const { data: inserted, error: insertError } = await service
    .from('buyer_briefs')
    .insert({
      buyer_org_id: member.org_id,
      created_by: user.id,
      status: 'new',
      title,
      prose: prose || null,
      brief,
    })
    .select('id, status, title, created_at')
    .single()

  if (insertError || !inserted) {
    return NextResponse.json({ error: 'Could not send your brief — please try again.' }, { status: 500 })
  }

  // Best-effort: notify the org's assigned AE (if any). Mirrors the requests
  // route — runs AFTER the primary insert, wrapped in try/catch, and must
  // never fail the send. Unassigned orgs (ae_user_id null) simply skip it.
  try {
    const { data: org } = await service
      .from('buyer_orgs')
      .select('name, ae_user_id')
      .eq('id', member.org_id)
      .maybeSingle()
    const aeId = (org as { ae_user_id?: string | null } | null)?.ae_user_id ?? null
    if (aeId) {
      const { data: authUser } = await service.auth.admin.getUserById(user.id)
      const actorName =
        (authUser?.user?.user_metadata as { display_name?: string } | undefined)?.display_name?.trim() ||
        'A buyer'
      await createNotification(
        service,
        buildBriefReceivedNotification({
          recipientId: aeId,
          actorId: user.id,
          actorName,
          actorAvatarUrl: null,
          buyerCompanyName: org?.name ?? 'A buyer company',
          briefTitle: title,
          briefId: inserted.id,
        })
      )
    }
  } catch {
    // Notification failure must never fail the send.
  }

  return NextResponse.json(
    { data: { id: inserted.id, status: inserted.status, title: inserted.title, created_at: inserted.created_at } },
    { status: 201 }
  )
}
