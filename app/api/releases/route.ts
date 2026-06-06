import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'

// GET /api/releases — release schedule: vault projects that have a release date.
// Projects are created/edited through /api/vault; this is the dated, release-bound view.
export async function GET() {
  const supabase = createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('vault_projects')
    .select('id, title, type, status, release_date, vault_readiness_score, cover_art_url')
    .eq('user_id', user.id)
    .not('release_date', 'is', null)
    .order('release_date', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
