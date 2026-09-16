import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'
const BUCKET = 'track-audio'

type RouteCtx = { params: Promise<{ projectId: string; trackId: string }> }

// POST — persist an instrumental audio reference onto the track's metadata
// after the browser has already uploaded the bytes directly to Supabase Storage.
// Body: { path: string; size?: number; ext?: string }
// This route deliberately does NOT accept file bytes — no form-data body parsing.
// The browser completed the direct-to-Storage transfer before calling here
// (D-05 / Pitfall 1 — stays well under Vercel's 4.5MB body ceiling).
export async function POST(request: Request, { params }: RouteCtx) {
  const { projectId, trackId } = await params

  if (DEMO) {
    return NextResponse.json(
      { error: 'Instrumental upload is not available in demo mode' },
      { status: 400 }
    )
  }

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Guarded parse — a malformed/empty body must return a structured 400, not an
  // unhandled 500; a literal JSON `null` body parses fine but has no properties.
  let body: Record<string, unknown>
  try {
    body = ((await request.json()) ?? {}) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.path || typeof body.path !== 'string' || body.path.trim() === '') {
    return NextResponse.json({ error: 'No instrumental path provided' }, { status: 400 })
  }

  const path: string = body.path.trim()
  const size: number = typeof body.size === 'number' && Number.isFinite(body.size) ? body.size : 0
  const ext: string = typeof body.ext === 'string' && body.ext.trim() !== '' ? body.ext.trim() : 'mp3'

  // Owner-prefix gate (confused-deputy defense): downstream consumers act on this
  // path with the service-role client (signed-URL minting, export ZIP assembly,
  // DELETE removal), which bypasses Storage RLS entirely — so the path MUST live
  // under the caller's own `{userId}/{projectId}/` prefix.
  const expectedPrefix = `${user.id}/${projectId}/`
  if (!path.startsWith(expectedPrefix) || path.includes('..')) {
    return NextResponse.json({ error: 'Invalid storage path' }, { status: 400 })
  }

  // M-02: merged in the database, never read-modify-written here. Reading the
  // whole metadata object and writing it back meant a concurrent stems write
  // silently erased this instrumental key (or the reverse) — the file survived
  // in Storage while its only reference vanished, with nothing erroring.
  const { data: updated, error: updateError } = await supabase.rpc('set_track_metadata_asset', {
    p_track_id: trackId,
    p_project_id: projectId,
    p_key: 'instrumental',
    p_value: { path, size, ext },
  })
  if (updateError) {
    if (updateError.message?.includes('track_not_found')) {
      return NextResponse.json({ error: 'Track not found' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
  }

  return NextResponse.json({ data: updated })
}

// DELETE — remove the instrumental audio from Storage and clear the metadata reference.
export async function DELETE(_request: Request, { params }: RouteCtx) {
  const { projectId, trackId } = await params

  if (DEMO) {
    return NextResponse.json(
      { error: 'Instrumental upload is not available in demo mode' },
      { status: 400 }
    )
  }

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: track } = await supabase
    .from('tracks')
    .select('id, metadata')
    .eq('id', trackId)
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!track) return NextResponse.json({ error: 'Track not found' }, { status: 404 })

  const metadata = (track.metadata as Record<string, unknown> | null) ?? {}
  const instrumentalPath = (metadata.instrumental as { path?: string } | undefined)?.path ?? null

  // Defense-in-depth: never let the service-role client (RLS bypass) delete an
  // object outside the caller's own prefix, even if a stale/tampered path was
  // persisted before the POST-side owner-prefix gate existed.
  const expectedPrefix = `${user.id}/${projectId}/`
  const service = createServiceClient()
  if (instrumentalPath && instrumentalPath.startsWith(expectedPrefix) && !instrumentalPath.includes('..')) {
    await service.storage.from(BUCKET).remove([instrumentalPath])
  }

  // M-02: `-` removes exactly this key in the database. The old path rewrote
  // the whole object and could erase a sibling a concurrent request had just
  // added.
  const { error } = await supabase.rpc('clear_track_metadata_asset', {
    p_track_id: trackId,
    p_project_id: projectId,
    p_key: 'instrumental',
  })
  if (error) return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })

  return NextResponse.json({ data: { ok: true } })
}
