import { NextResponse } from 'next/server'
import { z } from 'zod'
import { verifyAdmin } from '@/lib/admin/gate'
import { createServiceClient } from '@/lib/supabase/server'
const Create = z
  .object({
    action: z.literal('create'),
    key: z.string().regex(/^[a-z0-9][a-z0-9_-]{1,79}$/),
    label: z.string().trim().min(1).max(180),
    description: z.string().trim().min(1).max(2000),
  })
  .strict()
const Add = z
  .object({
    action: z.literal('add_member'),
    cohortId: z.string().uuid(),
    userId: z.string().uuid(),
    expiresAt: z.string().datetime({ offset: true }).nullable(),
  })
  .strict()
const Grant = z
  .object({
    action: z.literal('grant_feature'),
    cohortId: z.string().uuid(),
    featureKey: z.string().regex(/^[a-z0-9][a-z0-9_-]{1,79}$/),
  })
  .strict()
const RevokeMember = z
  .object({
    action: z.literal('revoke_member'),
    cohortId: z.string().uuid(),
    userId: z.string().uuid(),
  })
  .strict()
const RevokeFeature = z
  .object({
    action: z.literal('revoke_feature'),
    cohortId: z.string().uuid(),
    featureKey: z.string().regex(/^[a-z0-9][a-z0-9_-]{1,79}$/),
  })
  .strict()
const Schema = z.discriminatedUnion('action', [
  Create,
  Add,
  Grant,
  RevokeMember,
  RevokeFeature,
])
export async function POST(request: Request) {
  const parsed = Schema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success)
    return NextResponse.json(
      { error: 'Invalid cohort change' },
      { status: 400 }
    )
  const auth = await verifyAdmin()
  if ('error' in auth)
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  const service = createServiceClient()
  if (parsed.data.action === 'create') {
    const write = await service
      .from('playbook_beta_cohorts')
      .insert({
        cohort_key: parsed.data.key,
        label: parsed.data.label,
        description: parsed.data.description,
        created_by: auth.user.id,
      })
      .select('id')
      .single()
    if (write.error)
      return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
    return NextResponse.json({ data: { id: write.data.id } })
  }
  if (
    parsed.data.action === 'add_member' ||
    parsed.data.action === 'revoke_member'
  ) {
    if (parsed.data.action === 'add_member') {
      const staff = await service
        .from('funun_staff')
        .select('user_id')
        .eq('user_id', parsed.data.userId)
        .maybeSingle()
      if (!staff.data)
        return NextResponse.json(
          { error: 'Only a Funūn Team Member can join a Playbook cohort' },
          { status: 400 }
        )
    }
    const revokedAt =
      parsed.data.action === 'revoke_member' ? new Date().toISOString() : null
    const write =
      parsed.data.action === 'add_member'
        ? await service
            .from('playbook_beta_cohort_members')
            .upsert(
              {
                cohort_id: parsed.data.cohortId,
                user_id: parsed.data.userId,
                added_by: auth.user.id,
                expires_at: parsed.data.expiresAt,
                revoked_at: null,
              },
              { onConflict: 'cohort_id,user_id' }
            )
            .select('cohort_id')
            .single()
        : await service
            .from('playbook_beta_cohort_members')
            .update({ revoked_at: revokedAt })
            .eq('cohort_id', parsed.data.cohortId)
            .eq('user_id', parsed.data.userId)
            .is('revoked_at', null)
            .select('cohort_id')
            .maybeSingle()
    if (write.error)
      return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
    if (!write.data)
      return NextResponse.json({ error: 'Active cohort membership not found' }, { status: 404 })
    const event = await service
      .from('playbook_feature_control_events')
      .insert({
        event_type:
          parsed.data.action === 'add_member'
            ? 'member_added'
            : 'member_revoked',
        actor_id: auth.user.id,
        cohort_id: parsed.data.cohortId,
        subject_user_id: parsed.data.userId,
      })
    if (event.error)
      return NextResponse.json(
        {
          error:
            'Cohort membership changed, but its audit event failed. Contact IT.',
        },
        { status: 500 }
      )
    return NextResponse.json({ data: { saved: true } })
  }
  const revoke = parsed.data.action === 'revoke_feature'
  const write = revoke
    ? await service
        .from('playbook_feature_cohort_grants')
        .update({ revoked_at: new Date().toISOString() })
        .eq('cohort_id', parsed.data.cohortId)
        .eq('feature_key', parsed.data.featureKey)
        .is('revoked_at', null)
        .select('cohort_id')
        .maybeSingle()
    : await service
        .from('playbook_feature_cohort_grants')
        .upsert(
          {
            cohort_id: parsed.data.cohortId,
            feature_key: parsed.data.featureKey,
            granted_by: auth.user.id,
            revoked_at: null,
          },
          { onConflict: 'feature_key,cohort_id' }
        )
        .select('cohort_id')
        .single()
  if (write.error)
    return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
  if (!write.data)
    return NextResponse.json({ error: 'Active cohort capability not found' }, { status: 404 })
  const event = await service
    .from('playbook_feature_control_events')
    .insert({
      feature_key: parsed.data.featureKey,
      event_type: revoke ? 'cohort_revoked' : 'cohort_granted',
      actor_id: auth.user.id,
      cohort_id: parsed.data.cohortId,
    })
  if (event.error)
    return NextResponse.json(
      {
        error:
          'Capability access changed, but its audit event failed. Contact IT.',
      },
      { status: 500 }
    )
  return NextResponse.json({ data: { saved: true } })
}
