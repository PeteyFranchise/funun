import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { handleFormatError, normalizeHandleForCompare } from '@/lib/handles/validate'

// ─── PATCH /api/profile/handle ───────────────────────────────────────────
// Body: { handle: string }
// D-07/D-08/D-14's write path. Deliberately separate from the generic
// app/api/profile/route.ts EDITABLE_FIELDS allowlist — same precedent as
// app/api/profile/visibility/route.ts. This write needs two things a plain
// column update cannot give it: an atomic history write when the identity
// actually changes (D-07), and a rejection that is decided by the database,
// never by an earlier client-side check (D-14). `handle` is public identity,
// not a private setting, but it still needs its own route for the same
// reason `profile_visibility` does — the write carries logic beyond a
// column assignment.
export async function PATCH(request: Request) {
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // D-08: every handle change permanently burns the retired name. An
  // unbounded change loop is therefore a name-exhaustion vector, not just an
  // annoyance-level abuse surface — five changes per 24 hours is far above
  // any legitimate rebranding cadence, so the window is deliberately wider
  // than the default 15-minute/5-attempt shape used elsewhere in this file's
  // sibling routes.
  const limited = await checkRateLimit(`handle-change:${user.id}`, {
    windowMs: 24 * 60 * 60 * 1000,
    maxAttempts: 5,
  })
  if (limited) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429 }
    )
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const raw = typeof body.handle === 'string' ? body.handle.trim() : ''

  // The shared format authority is the only place this rule is written —
  // do not re-implement it here.
  const formatError = handleFormatError(raw)
  if (formatError) {
    return NextResponse.json({ error: formatError }, { status: 400 })
  }

  const service = createServiceClient()
  const { data: current } = await service
    .from('user_profiles')
    .select('handle')
    .eq('id', user.id)
    .maybeSingle()

  const previousHandle = (current?.handle as string | null | undefined) ?? null
  const isCasingOnlyChange =
    previousHandle !== null &&
    normalizeHandleForCompare(previousHandle) === normalizeHandleForCompare(raw)

  // Store exactly what was typed — never lowercased (D-04).
  const { data, error } = await service
    .from('user_profiles')
    .update({ handle: raw })
    .eq('id', user.id)
    .select('id, handle')
    .single()

  if (error) {
    // D-14: the database's rejection is the only authority. A prior
    // availability check (if any ran) is never proof the handle was free.
    // One non-specific message for every rejection class (taken / reserved /
    // retired) — T-36-15 — so the response never confirms which case
    // occurred.
    const status = error.code === '23505' ? 409 : 400
    return NextResponse.json({ error: 'That handle is not available' }, { status })
  }

  // Order matters: the update above ran FIRST, the history write second.
  // The reverse order would close the brief window where the retired handle
  // is claimable, but at the cost of leaving a stray history row if the
  // update then failed — and under migration 133's universal block that row
  // would permanently burn the person's own current handle. The brief
  // window is the cheaper failure (T-36-16, accepted).
  //
  // No history row when there was no previous handle (nothing to retire) or
  // when this was only a casing change (same identity, same URL — D-04).
  if (previousHandle !== null && !isCasingOnlyChange) {
    // Best-effort, swallow-the-secondary-write idiom used throughout this
    // codebase (e.g. handle_new_user()'s subscriptions/claim inserts). A
    // missed history row degrades the old link to a 404 instead of a
    // redirect — degraded, never a failure of the handle change itself.
    try {
      await service.from('handle_history').insert({ profile_id: user.id, old_handle: previousHandle })
    } catch {
      // swallow — see comment above
    }
  }

  return NextResponse.json({ data: { handle: data.handle } })
}
