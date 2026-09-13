import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient } from '@/lib/supabase/server'
import { createWorkAccessDeps, resolveWorkAccess } from '@/lib/catalogue/access'
import { checkRateLimit } from '@/lib/security/rate-limit'
import type { WorkVersionPin, WorkVersionPinView } from '@/types/catalogue'

// ─── Private pins — a bookmark, not a letter ────────────────────────────
// A pin marks a position on one take, wordless, visible to nobody but
// whoever dropped it. Migration 224's `work_version_pins_author_only`
// policy is the ONLY thing that hides another author's rows -- this file
// checks room membership at write time and nowhere else. See the comment
// above the GET filter below for why that is deliberate.

type RouteContext = { params: Promise<{ workId: string; versionId: string }> }

const PIN_COLUMNS = 'id, timestamp_ms, created_at'

const MAX_PINS_PER_VERSION = 100

type PinRow = Pick<WorkVersionPin, 'id' | 'timestamp_ms' | 'created_at'>

const PinBodySchema = z.object({
  timestampMs: z.number().int().min(0).max(86400000),
}).strict()

function presentPin(row: PinRow): WorkVersionPinView {
  return { id: row.id, timestampMs: row.timestamp_ms, createdAt: row.created_at }
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { workId, versionId } = await params
  const supabase = await createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const access = await resolveWorkAccess(createWorkAccessDeps(supabase), workId, user.id, 'contribute')
  if (!access.granted) return NextResponse.json({ error: access.reason }, { status: access.status })

  try {
    const { data, error } = await supabase
      .from('work_version_pins')
      .select(PIN_COLUMNS)
      .eq('work_id', workId)
      .eq('version_id', versionId)
      // Redundant narrowing for query planning and readability, never the
      // safeguard. The single author-only row policy on this table is what
      // actually decides which rows come back -- delete this line and the
      // response must still contain only the caller's own pins, because the
      // database, not this filter, is the enforcement point.
      .eq('author_user_id', user.id)
      .order('timestamp_ms', { ascending: true })
      .limit(200)
    if (error) throw new Error(error.message)

    const pins = (data ?? []) as PinRow[]
    return NextResponse.json({ data: pins.map(presentPin) })
  } catch (error) {
    return NextResponse.json({ error: 'Could not load pins' }, { status: 500 })
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  const { workId, versionId } = await params
  const supabase = await createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (await checkRateLimit(`work-version-pin:${user.id}`, { maxAttempts: 300, windowMs: 15 * 60 * 1000 })) {
    return NextResponse.json({ error: 'Too many pins. Please slow down.' }, { status: 429 })
  }
  const access = await resolveWorkAccess(createWorkAccessDeps(supabase), workId, user.id, 'contribute')
  if (!access.granted) return NextResponse.json({ error: access.reason }, { status: access.status })

  const parsed = PinBodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'A pin needs a valid track position.' }, { status: 400 })
  }

  try {
    const { count, error: countError } = await supabase
      .from('work_version_pins')
      .select('id', { count: 'exact', head: true })
      .eq('version_id', versionId)
      .eq('author_user_id', user.id)
    if (countError) throw new Error(countError.message)
    if ((count ?? 0) >= MAX_PINS_PER_VERSION) {
      return NextResponse.json(
        { error: `You can drop up to ${MAX_PINS_PER_VERSION} pins on a take.` },
        { status: 409 }
      )
    }

    const { data, error } = await supabase
      .from('work_version_pins')
      .insert({
        work_id: workId,
        version_id: versionId,
        author_user_id: user.id,
        timestamp_ms: parsed.data.timestampMs,
      })
      .select(PIN_COLUMNS)
      .single()
    if (error || !data) throw new Error(error?.message)

    return NextResponse.json({ data: presentPin(data as PinRow) }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Could not save the pin' }, { status: 500 })
  }
}
