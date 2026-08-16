import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/admin/gate'

// ─── Selects saved / team-shared Crate searches (D-12) ─────────────────────
// Any AE can save a Crate search privately, and flip one of their own to
// team-shared; every AE can then recall every team-shared search — no
// leadership gate on the READ side (D-12). Staff-gated (no own-book/AE
// assignment scope here — a saved search is a personal or team-wide
// preset, not client data, so there is nothing to own-book-scope against).

const SAVED_SEARCH_COLUMNS = 'id, created_by, name, filters, is_team_shared, created_at'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// The Crate filter shape (lib/deals/catalog.ts's CatalogFilter, plus any
// future filter key) stored as a bounded JSONB object — string/number/
// boolean/string-array values only, capped key count and string/array
// lengths, so `filters` can never smuggle an arbitrarily deep or huge
// payload into the row (T-31-11 adjacent — filters is read-only data, but
// still bounded like every other JSONB write in this codebase).
const savedSearchFiltersSchema = z
  .record(
    z.string().max(60),
    z.union([
      z.string().max(200),
      z.number(),
      z.boolean(),
      z.array(z.string().max(200)).max(20),
    ])
  )
  .refine(obj => Object.keys(obj).length <= 20, 'A saved search may have at most 20 filter fields.')

const createSavedSearchSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(120, 'Name must be 120 characters or fewer.'),
  filters: savedSearchFiltersSchema,
})

// ─── GET /api/admin/selects/saved-searches ─────────────────────────────────
// Returns the caller's own saved searches PLUS every team-shared search —
// any AE can recall a team search, no leadership gate (D-12). A private
// search belonging to another AE is never returned.
export async function GET() {
  const auth = await requireStaff()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const service = createServiceClient()
  const { data, error } = await service
    .from('selects_saved_searches')
    .select(SAVED_SEARCH_COLUMNS)
    .or(`created_by.eq.${auth.user.id},is_team_shared.eq.true`)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

// ─── POST /api/admin/selects/saved-searches ────────────────────────────────
// Creates a PRIVATE saved search (is_team_shared always starts false) owned
// by the caller. Sharing is a separate, explicit PATCH from the owner.
export async function POST(request: Request) {
  const auth = await requireStaff()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const body = await request.json().catch(() => null)
  const parsed = createSavedSearchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid request.' },
      { status: 400 }
    )
  }

  const service = createServiceClient()
  const { data, error } = await service
    .from('selects_saved_searches')
    .insert({
      created_by: auth.user.id,
      name: parsed.data.name,
      filters: parsed.data.filters,
      is_team_shared: false,
    })
    .select(SAVED_SEARCH_COLUMNS)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}

// ─── PATCH /api/admin/selects/saved-searches ───────────────────────────────
// Flips is_team_shared on a search the caller OWNS — only the owner can
// share/unshare their own search (T-31-11). Body: { id, is_team_shared }.
// 404 (not 403) when the search does not exist or is not owned by the
// caller, mirroring the own-book scope-denial convention elsewhere in this
// phase (no existence leak of another AE's private search).
export async function PATCH(request: Request) {
  const auth = await requireStaff()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const id = typeof body.id === 'string' ? body.id : ''
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'id must be a UUID.' }, { status: 400 })
  }
  if (typeof body.is_team_shared !== 'boolean') {
    return NextResponse.json({ error: 'is_team_shared must be a boolean.' }, { status: 400 })
  }

  const service = createServiceClient()

  const { data: existing } = await service
    .from('selects_saved_searches')
    .select('id, created_by')
    .eq('id', id)
    .maybeSingle()
  if (!existing || existing.created_by !== auth.user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { data, error } = await service
    .from('selects_saved_searches')
    .update({ is_team_shared: body.is_team_shared })
    .eq('id', id)
    .select(SAVED_SEARCH_COLUMNS)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
