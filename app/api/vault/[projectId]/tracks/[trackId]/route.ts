import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'
import { sanitizeComposers, sanitizeLyrics, sanitizePerformers, sanitizeRecordingInfo } from '@/lib/metadata/schema'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

type RouteCtx = { params: Promise<{ projectId: string; trackId: string }> }

type TrackUpdate = {
  title?: string
  isrc?: string | null
  iswc?: string | null
  language?: string | null
  writers?: string[]
  producers?: string[]
  mixing_engineer?: string | null
  mastering_engineer?: string | null
  has_sample?: boolean
  sample_details?: string | null
  metadata?: Record<string, unknown>
}

function asStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined
  return v.map(x => String(x).trim()).filter(Boolean)
}

function sanitize(body: Record<string, unknown>): TrackUpdate {
  const update: TrackUpdate = {}
  if ('title' in body && typeof body.title === 'string' && body.title.trim()) {
    update.title = body.title.trim()
  }
  if ('has_sample' in body && typeof body.has_sample === 'boolean') {
    update.has_sample = body.has_sample
  }
  for (const key of [
    'isrc',
    'iswc',
    'language',
    'mixing_engineer',
    'mastering_engineer',
    'sample_details',
  ] as const) {
    if (!(key in body)) continue
    const value = body[key]
    if (value === null) update[key] = null
    else if (typeof value === 'string') {
      const t = value.trim()
      update[key] = t === '' ? null : t
    }
  }
  for (const key of ['writers', 'producers'] as const) {
    const arr = asStringArray(body[key])
    if (arr) update[key] = arr
  }
  // Metadata Studio: composer rows live under metadata.composers. The
  // PATCH handler merges this into the existing JSONB so other keys survive.
  if ('metadata' in body && body.metadata && typeof body.metadata === 'object') {
    const incoming = body.metadata as Record<string, unknown>
    const next: Record<string, unknown> = {}
    if ('composers' in incoming) {
      next.composers = sanitizeComposers(incoming.composers)
    }
    if ('lyrics' in incoming) {
      next.lyrics = sanitizeLyrics(incoming.lyrics) // null clears them
    }
    if ('performers' in incoming) {
      next.performers = sanitizePerformers(incoming.performers)
    }
    if ('recording' in incoming) {
      next.recording = sanitizeRecordingInfo(incoming.recording) // null clears
    }
    if (Object.keys(next).length > 0) update.metadata = next
  }
  return update
}

// PATCH /api/vault/[projectId]/tracks/[trackId] — update track metadata,
// including the Stage 3 sample flag (has_sample / sample_details).
export async function PATCH(request: Request, { params }: RouteCtx) {
  const { projectId, trackId } = await params

  if (DEMO) {
    return NextResponse.json(
      { error: 'Editing tracks is not available in demo mode' },
      { status: 400 }
    )
  }

  const body = (await request.json()) as Record<string, unknown>
  const update = sanitize(body)
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Merge the metadata JSONB so we don't clobber keys we didn't touch.
  if (update.metadata) {
    const { data: existing } = await supabase
      .from('tracks')
      .select('metadata')
      .eq('id', trackId)
      .eq('project_id', projectId)
      .eq('user_id', user.id)
      .maybeSingle()
    update.metadata = {
      ...((existing?.metadata as Record<string, unknown> | null) ?? {}),
      ...update.metadata,
    }
  }

  const { data, error } = await supabase
    .from('tracks')
    .update(update)
    .eq('id', trackId)
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .select()
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Track not found' }, { status: 404 })
  return NextResponse.json({ data })
}
