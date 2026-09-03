import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { resolveWorkAccess, createWorkAccessDeps } from '@/lib/catalogue/access'
import { normalizeTakeLabel } from '@/lib/catalogue/take-workflow'

type RouteCtx = { params: Promise<{ workId: string; versionId: string }> }

const PatchVersionSchema = z.union([
  z.object({ archived: z.boolean() }).strict(),
  z.object({ label: z.string().max(200).nullable() }).strict(),
  z.object({ working: z.literal(true) }).strict(),
])

export async function PATCH(request: Request, { params }: RouteCtx) {
  const { workId, versionId } = await params
  const supabase = await createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const access = await resolveWorkAccess(createWorkAccessDeps(supabase), workId, user.id, 'contribute')
  if (!access.granted) return NextResponse.json({ error: access.reason }, { status: access.status })

  const parsed = PatchVersionSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Choose one valid take action.' }, { status: 400 })
  const body = parsed.data

  const { data: version } = await supabase
    .from('work_versions')
    .select('id, user_id, archived_at, label')
    .eq('id', versionId)
    .eq('work_id', workId)
    .maybeSingle()
  if (!version) return NextResponse.json({ error: 'Take not found.' }, { status: 404 })

  if ('working' in body) {
    if (version.archived_at) return NextResponse.json({ error: 'Restore this take before making it the working take.' }, { status: 409 })
    const { data, error } = await supabase
      .from('works')
      .update({ working_version_id: versionId })
      .eq('id', workId)
      .select('id, working_version_id')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 409 })
    return NextResponse.json({ data })
  }

  if ('label' in body) {
    const label = body.label === null ? null : normalizeTakeLabel(body.label)
    const { data, error } = await supabase
      .from('work_versions')
      .update({ label })
      .eq('id', versionId)
      .eq('work_id', workId)
      .select('id, label')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  }

  if (!access.isOwner && version.user_id !== user.id) {
    return NextResponse.json({ error: 'Only the person who added this take or the room owner can archive it.' }, { status: 403 })
  }

  if (body.archived) {
    const service = createServiceClient()
    const { data: master } = await service
      .from('song_passport_master_designations')
      .select('id')
      .eq('work_version_id', versionId)
      .limit(1)
      .maybeSingle()
    if (master) return NextResponse.json({ error: 'This take is a selected master and must remain visible.' }, { status: 409 })
  }

  const update = body.archived
    ? { archived_at: new Date().toISOString(), archived_by: user.id }
    : { archived_at: null, archived_by: null }
  const { data, error } = await supabase
    .from('work_versions')
    .update(update)
    .eq('id', versionId)
    .eq('work_id', workId)
    .select('id, archived_at')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
