import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'
import type { Release } from '@/types'

// GET /api/releases — list all releases for the current artist
export async function GET() {
  const supabase = createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('releases')
    .select(`
      *,
      tracks (id, title, track_number, isrc, audio_file_url, duration_seconds),
      release_assets (id, type, url),
      release_documents (id, type, status),
      submissions (id, destination_name, status, submitted_at)
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// POST /api/releases — create a new release project
export async function POST(request: Request) {
  const supabase = createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { title, type, release_date, genre } = body

  if (!title || !type) {
    return NextResponse.json({ error: 'Title and type are required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('releases')
    .insert({
      user_id: user.id,
      title,
      type,
      release_date: release_date || null,
      genre: genre || null,
      status: 'building',
      readiness_score: 0,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
