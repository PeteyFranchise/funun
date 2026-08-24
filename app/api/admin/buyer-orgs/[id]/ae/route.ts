import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff, getStaffRole } from '@/lib/admin/gate'
import { logStaffAction } from '@/lib/staff/audit'
import { createNotification } from '@/lib/notifications'
import { buildAeAssignedNotification, buildAeUnassignedNotification } from '@/lib/staff/notifications'
import { appendRelationshipLog } from '@/lib/client-partners/contacts'
import { insertOnboardingTask } from '@/lib/client-partners/onboarding'

// Canonical RFC-4122 UUID shape, mirrors lib/social/dm.ts's isUuid — the
// body value is interpolated into a service-role update, so any non-UUID
// value must be rejected before it reaches the write.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ─── PATCH /api/admin/buyer-orgs/[id]/ae ───────────────────────────────────
// Leadership-only AE (re)assignment — now the FULL D-07 structural handoff
// (31.1 plan 06, D-31.1-05): a required handoff note, leadership self-assign
// (the target-role check now also admits 'leadership', so a leader can
// route a client into their own My tab; an AE can still never self-assign —
// this route stays requireStaff(['leadership'])), an auto-created
// onboarding_tasks row landing directly in the AE's queue, a kind:
// 'assignment' relationship-log audit entry, and the existing best-effort
// notification (now with a Resend intro-email copy). Every write is audited
// (D-04). Reassignment-aware (25-09): the prior ae_user_id is read BEFORE
// the update, so both the newly-assigned AE (gained) and the previous AE
// (lost) can be notified when the assignment actually changes hands.
//
// D-07: the ae_user_id write is the ONE authority action here — it commits
// first. Everything after it (relationship log, onboarding task,
// notifications, the intro email) is a best-effort side effect wrapped in
// .catch(() => {}), mirroring lib/social/activity-emit.ts's convention — a
// Resend/DB failure in any one of them must never fail this response or
// block another side effect from running.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(['leadership'])
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { id } = await params
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>

  if (!('ae_user_id' in body)) {
    return NextResponse.json({ error: 'ae_user_id is required' }, { status: 400 })
  }
  const rawAeUserId = body.ae_user_id
  const aeUserId: string | null =
    rawAeUserId === null ? null : typeof rawAeUserId === 'string' ? rawAeUserId : ''
  if (aeUserId !== null && !UUID_RE.test(aeUserId)) {
    return NextResponse.json({ error: 'ae_user_id must be a UUID or null' }, { status: 400 })
  }

  // D-31.1-05: every handoff carries context — required only when actually
  // assigning (not on unassign), trimmed, non-empty.
  const rawNote = body.note
  const note = typeof rawNote === 'string' ? rawNote.trim() : ''
  if (aeUserId !== null && !note) {
    return NextResponse.json(
      { error: 'A handoff note is required to assign an AE.' },
      { status: 400 }
    )
  }

  const service = createServiceClient()

  // Verify the assignment target is a real, ACTIVE staff member who can hold
  // a Client Partner — an AE, BD, or (D-31.1-05) leadership self-assigning.
  // getStaffRole reads the authoritative app_metadata.staff_role, so a
  // deactivated account (staff_role cleared) is rejected too. The same
  // getUserById call also resolves the target's email for the best-effort
  // intro email below, avoiding a second Auth Admin API round trip.
  let targetEmail: string | null = null
  if (aeUserId !== null) {
    const { data: target } = await service.auth.admin.getUserById(aeUserId)
    const targetRole = target?.user ? getStaffRole(target.user) : null
    if (targetRole !== 'ae' && targetRole !== 'bd' && targetRole !== 'leadership') {
      return NextResponse.json(
        { error: 'ae_user_id must be an active Account Executive, BD, or leadership team member.' },
        { status: 400 }
      )
    }
    targetEmail = (target?.user as { email?: string } | undefined)?.email ?? null
  }

  // Read the PRIOR assignment before writing — required to know whether
  // this is a fresh assignment, a no-op re-assignment, an unassign, or a
  // genuine reassignment away from a different AE (25-09).
  const { data: priorRow } = await service
    .from('buyer_orgs')
    .select('ae_user_id')
    .eq('id', id)
    .maybeSingle()
  const prevAeUserId = (priorRow as { ae_user_id?: string | null } | null)?.ae_user_id ?? null

  const { data, error } = await service
    .from('buyer_orgs')
    .update({ ae_user_id: aeUserId })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ─── The authority write has committed. Everything below is best-effort
  // (D-07) — a failure here must never fail this response. ───────────────

  await logStaffAction(service, {
    actorId: auth.user.id,
    action: 'assign_ae',
    targetType: 'buyer_org',
    targetId: id,
    changes: { ae_user_id: aeUserId },
  })

  const orgName = (data as { name?: string } | null)?.name ?? 'this Client Partner'

  if (aeUserId && aeUserId !== prevAeUserId) {
    // D-07 structural handoff — fires only when the client actually
    // changes hands to this AE (a fresh assignment or a genuine
    // reassignment away from a different AE). A same-AE re-submit
    // (aeUserId === prevAeUserId) must not re-create the onboarding task
    // or re-send the intro email/notification (WR-02). The audit-trail
    // log entry, an onboarding task landing directly in the AE's queue,
    // and the notification (+ best-effort intro email) are each wrapped
    // independently so a failure in one never blocks another or the
    // response.
    await appendRelationshipLog(service, {
      orgId: id,
      kind: 'assignment',
      body: note,
      authorUserId: auth.user.id,
      meta: { ae_user_id: aeUserId, prior_ae_user_id: prevAeUserId },
    }).catch(() => {})

    await insertOnboardingTask(service, {
      orgId: id,
      assigneeId: aeUserId,
      createdBy: auth.user.id,
      title: `Welcome ${orgName} to your book`,
      handoffNote: note,
    }).catch(() => {})

    await createNotification(service, {
      ...buildAeAssignedNotification({
        recipientId: aeUserId,
        orgId: id,
        orgName,
        actorId: auth.user.id,
      }),
      email: targetEmail,
      sendEmailCopy: true,
    }).catch(() => {})
  }

  // The assignment changed away from a previous, different AE — notify
  // them too, whether the new value is a different AE or unassigned.
  const changedAwayFromPrevAe = prevAeUserId !== null && prevAeUserId !== aeUserId
  if (changedAwayFromPrevAe) {
    await createNotification(
      service,
      buildAeUnassignedNotification({
        recipientId: prevAeUserId as string,
        orgId: id,
        orgName,
        actorId: auth.user.id,
      })
    ).catch(() => {})
  }

  return NextResponse.json({ data })
}
