import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

// POST   /api/endorsements  { profileId, body }  → endorse (one per author/profile)
// DELETE /api/endorsements  { profileId }        → withdraw your endorsement
export async function POST(request: Request) {
  if (DEMO) return NextResponse.json({ data: { ok: true } })

  const { profileId, body } = (await request.json().catch(() => ({}))) as {
    profileId?: string
    body?: string
  }
  const text = (body ?? '').trim()
  if (!profileId) return NextResponse.json({ error: 'Missing profileId' }, { status: 400 })
  if (!text) return NextResponse.json({ error: 'Endorsement is empty' }, { status: 400 })
  if (text.length > 1000) return NextResponse.json({ error: 'Endorsement too long' }, { status: 400 })

  const supabase = createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.id === profileId) return NextResponse.json({ error: 'You cannot endorse yourself' }, { status: 400 })

  const { data, error } = await supabase
    .from('endorsements')
    .upsert(
      { profile_id: profileId, author_id: user.id, body: text },
      { onConflict: 'profile_id,author_id' }
    )
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function DELETE(request: Request) {
  if (DEMO) return NextResponse.json({ data: { ok: true } })

  const { profileId } = (await request.json().catch(() => ({}))) as { profileId?: string }
  if (!profileId) return NextResponse.json({ error: 'Missing profileId' }, { status: 400 })

  const supabase = createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase
    .from('endorsements')
    .delete()
    .eq('profile_id', profileId)
    .eq('author_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: { ok: true } })
}
