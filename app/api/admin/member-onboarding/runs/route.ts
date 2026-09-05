import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireStaff } from '@/lib/admin/gate'
import { createServiceClient } from '@/lib/supabase/server'
import {
  MEMBER_ONBOARDING_STAFF_ROLES,
  StartRunSchema,
  TemplateChecklistItemSchema,
  defaultRunContext,
  instantiateChecklist,
  type MemberGamePlanRun,
} from '@/lib/member-onboarding/game-plan'

const TemplateRowSchema = z.object({
  id: z.string().uuid(),
  key: z.string(),
  title: z.string(),
  version: z.number().int().positive(),
  checklist: z.array(TemplateChecklistItemSchema).max(80),
  active: z.boolean(),
})

export async function POST(request: Request) {
  const auth = await requireStaff([...MEMBER_ONBOARDING_STAFF_ROLES])
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const parsed = StartRunSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid game plan.' }, { status: 400 })
  }

  const service = createServiceClient()
  const [{ data: templateData, error: templateError }, { data: memberProfile }] = await Promise.all([
    service
      .from('member_game_plan_templates')
      .select('id, key, title, version, checklist, active')
      .eq('id', parsed.data.templateId)
      .maybeSingle(),
    service.from('user_profiles').select('id, artist_name').eq('id', parsed.data.memberId).maybeSingle(),
  ])

  const templateParsed = TemplateRowSchema.safeParse(templateData)
  if (templateError || !templateParsed.success || !templateParsed.data.active) {
    return NextResponse.json({ error: 'Game plan template not found.' }, { status: 404 })
  }
  if (!memberProfile) return NextResponse.json({ error: 'Member Account not found.' }, { status: 404 })

  const { data: existing } = await service
    .from('member_game_plan_runs')
    .select('*')
    .eq('member_id', parsed.data.memberId)
    .eq('template_id', parsed.data.templateId)
    .eq('status', 'open')
    .maybeSingle()
  if (existing) {
    return NextResponse.json({ data: existing as MemberGamePlanRun, resumed: true })
  }

  const { data: memberAuth } = await service.auth.admin.getUserById(parsed.data.memberId)
  const memberLabel =
    (memberProfile as { artist_name: string | null }).artist_name?.trim() ||
    memberAuth?.user?.email ||
    'Member'
  const facilitatorLabel = auth.user.email || 'Funūn Team member'
  const template = templateParsed.data

  const { data, error } = await service
    .from('member_game_plan_runs')
    .insert({
      template_id: template.id,
      member_id: parsed.data.memberId,
      member_label: memberLabel,
      facilitator_id: auth.user.id,
      facilitator_label: facilitatorLabel,
      template_key: template.key,
      template_title: template.title,
      template_version: template.version,
      items: instantiateChecklist(template.checklist),
      context: parsed.data.context ?? defaultRunContext(),
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data as MemberGamePlanRun, resumed: false }, { status: 201 })
}
