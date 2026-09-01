import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { resolveWorkAccess, createWorkAccessDeps } from '@/lib/catalogue/access'
import { BUCKET, MAX_BYTES, buildVersionPath, resolveAudioType } from '@/lib/catalogue/audio'
import { checkRateLimit } from '@/lib/security/rate-limit'
import type { PerformerRef, WorkVersionSource } from '@/types/catalogue'

// ─── POST /api/works/[workId]/versions — hum and upload, one route ──────
// Modelled directly on app/api/vault/[projectId]/tracks/[trackId]/audio/
// route.ts. The whole point of S-01: a hummed take and a dragged-in file
// are both just an audio blob by the time they reach this route — the
// route does not care which capture path produced the multipart body, it
// validates and stores either one identically and writes the same kind of
// `work_versions` row. What differs is only the `source` field the client
// tells the truth about, for the diary's own record.
//
// This route does NOT write a diary row. Migration 138's
// trg_capture_work_version trigger fires the `version` diary entry on
// AFTER INSERT — a route-side insert into work_diary_events here would
// double it.

type RouteCtx = { params: Promise<{ workId: string }> }

function sourceOf(value: FormDataEntryValue | null): WorkVersionSource | null {
  return value === 'hum' || value === 'upload' ? value : null
}

export async function POST(request: Request, { params }: RouteCtx) {
  const { workId } = await params

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Own keyspace, separate from every other rate-limited surface in this
  // codebase (lib/security/rate-limit.ts's shared, durable, per-key
  // limiter). An audio upload is materially more expensive than a JSON
  // POST — storage writes plus a DB insert — so T-37-36's size ceiling is
  // paired with a per-user request cap, not relied on alone.
  if (await checkRateLimit(`work-version:${user.id}`, { maxAttempts: 40, windowMs: 15 * 60 * 1000 })) {
    return NextResponse.json({ error: 'Too many uploads. Please slow down.' }, { status: 429 })
  }

  // Access is resolved BEFORE the multipart body is even parsed. Both
  // tiers may add iterations — that is precisely what CONTRIBUTE means in
  // the doctrine: play versions, add their own uploads and hum takes, edit
  // the pad, annotate.
  const access = await resolveWorkAccess(createWorkAccessDeps(supabase), workId, user.id, 'contribute')
  if (!access.granted) {
    return NextResponse.json({ error: access.reason }, { status: access.status })
  }

  const form = await request.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })

  const file = form.get('file')
  const source = sourceOf(form.get('source'))
  const durationRaw = form.get('duration')
  const labelRaw = form.get('label')

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }
  if (!source) {
    return NextResponse.json({ error: 'source must be "hum" or "upload"' }, { status: 400 })
  }
  if (file.size <= 0) {
    return NextResponse.json({ error: 'No audio was captured.' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `Audio exceeds the ${MAX_BYTES / (1024 * 1024)}MB limit` },
      { status: 400 }
    )
  }
  const audioType = resolveAudioType(file.type, file.name)
  if (!audioType) {
    return NextResponse.json(
      { error: 'Unsupported audio format — use WebM, MP4/AAC, MP3, WAV, FLAC or OGG' },
      { status: 400 }
    )
  }

  const duration =
    durationRaw != null && !Number.isNaN(Number(durationRaw)) ? Math.round(Number(durationRaw)) : null
  const label = typeof labelRaw === 'string' && labelRaw.trim() ? labelRaw.trim().slice(0, 200) : null

  // Seed the new version's performers from the work's current vocal plan
  // (DEFAULT-PERFORMER RULE): `primary` copies the declared primary
  // performer forward; `varies`/`instrumental` seed nothing. This seeds a
  // PLAN, not a RECORD — the version's performer list stays editable, and
  // the human-take registry behind the Crate vocal rule requires an actual
  // declared take, never an inherited badge.
  const { data: work } = await supabase
    .from('works')
    .select('vocal_state, primary_performer')
    .eq('id', workId)
    .maybeSingle()
  if (!work) return NextResponse.json({ error: 'Work not found' }, { status: 404 })

  const performers: PerformerRef[] =
    work.vocal_state === 'primary' && work.primary_performer
      ? [work.primary_performer as PerformerRef]
      : []

  // The version id is generated here, server-side, before the storage
  // write — the path is built entirely from server-controlled values
  // (T-37-37): the work id, this generated version id, and the extension
  // this route derived from the allow-list, never from the uploaded
  // filename.
  const versionId = randomUUID()
  const path = buildVersionPath(workId, versionId, audioType.ext)

  // Uploads go through the service-role client (RESEARCH Pitfall 2):
  // migration 004's storage.objects policies are folder-owner-scoped to
  // `auth.uid()`, and this path's first segment is the WORK id, not the
  // uploader's — a session-scoped client would be rejected by its own
  // bucket's policies the moment a collaborator (not the work's owner)
  // uploaded. Access is already gated above, by `resolveWorkAccess()`.
  const service = createServiceClient()
  const { error: uploadError } = await service.storage
    .from(BUCKET)
    .upload(path, file, { contentType: audioType.contentType, upsert: false })
  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const { data: inserted, error: insertError } = await supabase
    .from('work_versions')
    .insert({
      id: versionId,
      work_id: workId,
      user_id: user.id, // whoever created THIS version — may differ from the work's owner
      source,
      audio_path: path,
      audio_ext: audioType.ext,
      audio_size: file.size,
      duration_seconds: duration,
      label,
      performers,
    })
    .select()
    .single()

  if (insertError || !inserted) {
    // T-37-40: a failed insert must not leave an orphaned object behind —
    // the same rollback the existing track-audio route performs.
    await service.storage.from(BUCKET).remove([path])
    return NextResponse.json({ error: insertError?.message ?? 'Could not save the version' }, { status: 500 })
  }

  return NextResponse.json({ data: inserted }, { status: 201 })
}
