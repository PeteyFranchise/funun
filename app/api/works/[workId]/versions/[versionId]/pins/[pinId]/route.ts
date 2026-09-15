import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'
import { createWorkAccessDeps, resolveWorkAccess } from '@/lib/catalogue/access'

// ─── Delete a private pin ────────────────────────────────────────────────
// A pin has no update endpoint -- it is wordless and immutable, so this
// file exports DELETE only.

type RouteContext = { params: Promise<{ workId: string; versionId: string; pinId: string }> }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { workId, versionId, pinId } = await params
  const supabase = await createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const access = await resolveWorkAccess(createWorkAccessDeps(supabase), workId, user.id, 'contribute')
  if (!access.granted) return NextResponse.json({ error: access.reason }, { status: access.status })

  if (!UUID_RE.test(pinId)) {
    return NextResponse.json({ error: 'Invalid pin id.' }, { status: 400 })
  }

  try {
    const { data, error } = await supabase
      .from('work_version_pins')
      .delete()
      .eq('id', pinId)
      .eq('version_id', versionId)
      .select('id')
    if (error) throw new Error(error.message)

    // A pin belonging to someone else is indistinguishable from a pin that
    // does not exist. Both return this same neutral not-found status -- so
    // the status code itself cannot become a disclosure channel about a row
    // this caller cannot read.
    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'Pin not found.' }, { status: 404 })
    }

    return NextResponse.json({ data: { id: pinId } })
  } catch (error) {
    return NextResponse.json({ error: 'Could not delete the pin' }, { status: 500 })
  }
}
