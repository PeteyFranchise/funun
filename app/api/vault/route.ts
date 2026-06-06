import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'
import type { VaultProjectType } from '@/types'
import { getDemoProjects, addDemoProject } from '@/lib/vault/demo-store'

const VALID_TYPES: VaultProjectType[] = ['single', 'snippet', 'ep', 'album', 'unreleased']
const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

// GET /api/vault — list all vault projects for the current artist
export async function GET() {
  if (DEMO) {
    return NextResponse.json({ data: await getDemoProjects() })
  }

  const supabase = createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('vault_projects')
    .select(
      `
      *,
      tracks (id, title, track_number, isrc, audio_file_url, duration_seconds),
      vault_assets (id, type, url),
      vault_documents (id, type, status),
      submissions (id, destination_name, status, submitted_at)
    `
    )
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// POST /api/vault — create a new vault project
export async function POST(request: Request) {
  const body = await request.json()
  const { title, type, release_date, genre } = body

  if (!title || !type) {
    return NextResponse.json({ error: 'Title and type are required' }, { status: 400 })
  }
  if (!VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: 'Invalid project type' }, { status: 400 })
  }

  if (DEMO) {
    const project = await addDemoProject({
      title,
      type,
      genre: genre || null,
      release_date: release_date || null,
    })
    return NextResponse.json({ data: project })
  }

  const supabase = createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('vault_projects')
    .insert({
      user_id: user.id,
      title,
      type,
      release_date: release_date || null,
      genre: genre || null,
      status: 'in_progress',
      vault_readiness_score: 0,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
