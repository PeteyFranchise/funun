import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireStaff } from '@/lib/admin/gate'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { logStaffAction } from '@/lib/staff/audit'
import { createServiceClient } from '@/lib/supabase/server'

const AddSchema = z.object({
  action: z.literal('add'),
  accountUserId: z.string().uuid(),
  startsAt: z.string().datetime({ offset: true }).optional(),
  endsAt: z.string().datetime({ offset: true }).nullable().optional(),
}).strict().superRefine((value, context) => {
  if (value.endsAt && value.startsAt && new Date(value.endsAt) <= new Date(value.startsAt)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'End time must be after start time.' })
  }
})

const SetEnabledSchema = z.object({
  action: z.literal('set_enabled'),
  cohortId: z.string().uuid(),
  enabled: z.boolean(),
}).strict()

const BodySchema = z.union([AddSchema, SetEnabledSchema])

export async function POST(request: Request) {
  const auth = await requireStaff(['leadership'])
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  if (await checkRateLimit(`workspace-cohort-control:${auth.user.id}`, {
    windowMs: 60_000,
    maxAttempts: 20,
    failClosed: true,
  })) {
    return NextResponse.json({ error: 'Too many cohort changes. Try again shortly.' }, { status: 429 })
  }

  const parsed = BodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid request.' },
      { status: 400 }
    )
  }

  const service = createServiceClient()

  if (parsed.data.action === 'add') {
    const startsAt = parsed.data.startsAt ?? new Date().toISOString()
    if (parsed.data.endsAt && new Date(parsed.data.endsAt) <= new Date(startsAt)) {
      return NextResponse.json({ error: 'End time must be after start time.' }, { status: 400 })
    }
    const { data, error } = await service
      .from('workspace_cohorts')
      .insert({
        account_user_id: parsed.data.accountUserId,
        stage: 'pilot',
        enabled: true,
        flags: {},
        starts_at: startsAt,
        ends_at: parsed.data.endsAt ?? null,
        created_by: auth.user.id,
      })
      .select('id, account_user_id, stage, enabled, starts_at, ends_at')
      .single()

    if (error) {
      const status = error.code === '23505' ? 409 : error.code === '23503' ? 400 : 500
      const message = status === 409
        ? 'That Member already has a pilot cohort record. Re-enable the existing record instead.'
        : status === 400 ? 'The selected Member account does not exist.' : 'Failed to add cohort member.'
      return NextResponse.json({ error: message }, { status })
    }

    await logStaffAction(service, {
      actorId: auth.user.id,
      action: 'workspace_cohort.add',
      targetType: 'workspace_cohort',
      targetId: data.id,
      changes: {
        accountUserId: data.account_user_id,
        stage: data.stage,
        startsAt: data.starts_at,
        endsAt: data.ends_at,
      },
    })

    return NextResponse.json({ data }, { status: 201 })
  }

  const { data: before, error: readError } = await service
    .from('workspace_cohorts')
    .select('id, account_user_id, stage, enabled')
    .eq('id', parsed.data.cohortId)
    .eq('stage', 'pilot')
    .maybeSingle()
  if (readError) return NextResponse.json({ error: 'Failed to read cohort record.' }, { status: 500 })
  if (!before) return NextResponse.json({ error: 'Cohort record not found.' }, { status: 404 })

  const { data, error } = await service
    .from('workspace_cohorts')
    .update({ enabled: parsed.data.enabled })
    .eq('id', parsed.data.cohortId)
    .eq('stage', 'pilot')
    .eq('enabled', before.enabled)
    .select('id, account_user_id, stage, enabled, starts_at, ends_at')
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'Failed to update cohort record.' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Cohort record changed. Refresh and try again.' }, { status: 409 })

  await logStaffAction(service, {
    actorId: auth.user.id,
    action: parsed.data.enabled ? 'workspace_cohort.enable' : 'workspace_cohort.disable',
    targetType: 'workspace_cohort',
    targetId: data.id,
    changes: { fromEnabled: before.enabled, toEnabled: data.enabled },
  })

  return NextResponse.json({ data })
}
