import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp } from '@/lib/security/rate-limit'
import { sanitizeTeamTierLead, resolveRouting, SEAT_ANSWER_LABELS } from '@/lib/team-tier/qualification'
import { notifyTeamTierLeadStaff } from '@/lib/team-tier/notify-staff'

// ─── POST /api/team-tier-leads — public, unauthenticated (261004-ttq Task 4) ─
// The /team-fit questionnaire's submission route. Public, no session
// required — mirrors app/api/waitlist/route.ts and
// app/api/sync/register/route.ts's "first genuinely public write path"
// shape. This is a fan-out write (a bd-routed submission notifies every
// bd/leadership staff member), which lib/security/rate-limit.ts's own
// documentation names as exactly the case that should fail closed, unlike
// the lower-stakes waitlist route's fail-open default.
//
// routingOutcome is ALWAYS computed server-side via resolveRouting() — a
// client-submitted routingOutcome field, if present in the request body,
// is never read.

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

export async function POST(request: Request) {
  const ip = getClientIp(request)
  if (await checkRateLimit(`ip:${ip}`, { failClosed: true })) {
    return errorResponse('Too many requests. Please try again later.', 429)
  }

  const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>

  const result = sanitizeTeamTierLead(raw)
  if (!result.ok) {
    return errorResponse(result.error, 400)
  }
  const lead = result.value
  const routingOutcome = resolveRouting(lead.seatAnswer)

  // Best-effort, never required — an anonymous caller leaves this null.
  let submittedByUserId: string | null = null
  try {
    const api = await createApiClient()
    const { data } = await api.auth.getUser()
    submittedByUserId = data.user?.id ?? null
  } catch {
    submittedByUserId = null
  }

  const service = createServiceClient()

  const { data: inserted, error: insertError } = await service
    .from('team_tier_leads')
    .insert({
      seat_answer: lead.seatAnswer,
      catalogue_answer: lead.catalogueAnswer,
      pain_points: lead.painPoints,
      pain_points_other: lead.painPointsOther,
      routing_outcome: routingOutcome,
      contact_name: lead.contactName,
      contact_email: lead.contactEmail,
      submitted_by_user_id: submittedByUserId,
    })
    .select('id')
    .single()

  if (insertError || !inserted) {
    return errorResponse('Something went wrong. Please try again.', 500)
  }

  // Best-effort side effect AFTER the insert succeeds — the lead is already
  // durably saved by the time this runs, and its failure must never change
  // the response. A self-serve-routed lead has nobody to notify (no
  // liaison/ownership model to feed), so this only fires on the bd branch.
  if (routingOutcome === 'bd') {
    try {
      await notifyTeamTierLeadStaff(service, {
        id: (inserted as { id: string }).id,
        seatAnswerLabel: SEAT_ANSWER_LABELS[lead.seatAnswer],
      })
    } catch {
      // Best-effort — swallow. The lead is already saved.
    }
  }

  return NextResponse.json({ ok: true, routingOutcome }, { status: 201 })
}
