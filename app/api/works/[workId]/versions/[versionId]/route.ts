import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { resolveWorkAccess, createWorkAccessDeps } from '@/lib/catalogue/access'
import { normalizeTakeLabel } from '@/lib/catalogue/take-workflow'
import { PEAKS_BAR_COUNT } from '@/lib/catalogue/waveform'

type RouteCtx = { params: Promise<{ workId: string; versionId: string }> }

const PeaksSchema = z.array(z.number().int().min(0).max(100)).length(PEAKS_BAR_COUNT)

const PatchVersionSchema = z.union([
  z.object({ archived: z.boolean() }).strict(),
  z.object({ label: z.string().max(200).nullable() }).strict(),
  z.object({ working: z.literal(true) }).strict(),
  z.object({ peaks: PeaksSchema }).strict(),
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
    if (error) return NextResponse.json({ error: 'Request could not be completed.' }, { status: 409 })
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
    if (error) return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
    return NextResponse.json({ data })
  }

  if ('peaks' in body) {
    // Self-heal only. `.is('peaks', null)` is the whole point of this branch:
    // a take's waveform is computed once at creation, and this endpoint exists
    // solely so a take that predates the column can fill in its own shape. Any
    // contribute-tier member could otherwise replace an already-correct
    // waveform for the whole room at any time -- a stale tab, a buggy future
    // caller, or someone doing it on purpose -- and the column comment in
    // migration 224 is explicit that NULL means "not extracted yet", never
    // "draw whatever arrives next".
    //
    // Migration 224's CHECK validates the shape and range of what is written.
    // It cannot speak to provenance, which is what this filter covers.
    //
    // maybeSingle, not single: zero rows is the EXPECTED outcome when a
    // waveform already exists, and must read as a no-op rather than a 500.
    const { data, error } = await supabase
      .from('work_versions')
      .update({ peaks: body.peaks })
      .eq('id', versionId)
      .eq('work_id', workId)
      .is('peaks', null)
      .select('id')
      .maybeSingle()
    if (error) return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
    // Already had a waveform. Nothing was overwritten and nothing is wrong --
    // the caller simply raced another client that got there first.
    if (!data) return NextResponse.json({ data: { id: versionId, alreadyComputed: true } })
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
  if (error) return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
  return NextResponse.json({ data })
}
