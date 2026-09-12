import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient } from '@/lib/supabase/server'
import { getDemoProjects, addDemoProject } from '@/lib/vault/demo-store'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'
const CreateProjectSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    type: z.enum(['single', 'snippet', 'ep', 'album', 'unreleased']),
    release_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine(value => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), 'Invalid release date')
      .nullable()
      .optional(),
    genre: z.string().trim().max(100).nullable().optional(),
  })
  .strict()

// GET /api/vault — list all vault projects for the current artist
export async function GET() {
  if (DEMO) {
    return NextResponse.json({ data: await getDemoProjects() })
  }

  const supabase = await createApiClient()
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

  if (error) return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
  return NextResponse.json({ data })
}

// POST /api/vault — create a new vault project
export async function POST(request: Request) {
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user && !DEMO) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = CreateProjectSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid project details.' }, { status: 400 })
  }
  const { title, type, release_date, genre } = parsed.data

  if (DEMO) {
    const project = await addDemoProject({
      title,
      type,
      genre: genre || null,
      release_date: release_date || null,
    })
    return NextResponse.json({ data: project })
  }

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

  if (error) return NextResponse.json({ error: 'Project could not be created.' }, { status: 500 })
  return NextResponse.json({ data })
}
