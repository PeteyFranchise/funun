import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

// POST   /api/network/blocks  { blockedProfileId }  → block a member
// DELETE /api/network/blocks  { blockedProfileId }  → unblock a member
//
// Both actions run on the SESSION client only — blocks_insert_own /
// blocks_delete_own RLS (migration 035) already require blocker_id =
// auth.uid(), so this route can never write a block/unblock on another
// member's behalf. Inserting a block row here immediately activates the
// no_block() enforcement already wired into follows/connections/
// wall_posts/endorsements/dm_threads/dm_messages INSERT policies
// (migrations 038/044) — new writes across the blocked pair start
// failing right away. Retroactively auditing/patching EXISTING read
// surfaces (public profile, search, feed, DM enforcement) is explicitly
// Plan 13-03's scope, not this route's.
async function mutate(request: Request, action: 'block' | 'unblock') {
  if (DEMO) return NextResponse.json({ data: { ok: true } })

  const { blockedProfileId } = (await request.json().catch(() => ({}))) as { blockedProfileId?: string }
  if (!blockedProfileId) return NextResponse.json({ error: 'Missing blockedProfileId' }, { status: 400 })

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.id === blockedProfileId) {
    return NextResponse.json({ error: 'You cannot block yourself' }, { status: 400 })
  }

  if (action === 'block') {
    const { error } = await supabase.from('blocks').insert({ blocker_id: user.id, blocked_id: blockedProfileId })
    // 23505 = unique-violation (already blocked) — idempotent, not an error.
    if (error && error.code !== '23505') {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  } else {
    const { error } = await supabase
      .from('blocks')
      .delete()
      .eq('blocker_id', user.id)
      .eq('blocked_id', blockedProfileId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: { ok: true, blocked: action === 'block' } })
}

export const POST = (request: Request) => mutate(request, 'block')
export const DELETE = (request: Request) => mutate(request, 'unblock')
