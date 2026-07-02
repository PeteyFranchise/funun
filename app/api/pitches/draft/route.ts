import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createApiClient } from '@/lib/supabase/server'
import { buildPitchNotePrompt } from '@/lib/curators/pitch-copy'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'
const MODEL = 'claude-sonnet-4-6'

function extractJson(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = fenced ? fenced[1] : text
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1) return null
  try {
    return JSON.parse(raw.slice(start, end + 1))
  } catch {
    return null
  }
}

function demoNote(trackTitle: string, playlistName: string | null): string {
  return `Hey — I put out a track called "${trackTitle}" and thought it could be a fit for ${
    playlistName ?? 'your playlist'
  }. It's got the kind of late-night pull that works well back-to-back with the rest of what you're running. No big rollout, just trying to get it in front of the right ears. Would love for you to give it a listen — thanks for the time either way.`
}

// POST /api/pitches/draft — AI-draft a 150-word playlist-specific pitch note.
// DRAFT-ONLY: this route never writes pitch_history and never sends email.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    projectId?: string
    trackId?: string
    curatorId?: string
  }
  const { projectId, trackId, curatorId } = body

  if (!projectId || !trackId || !curatorId) {
    return NextResponse.json(
      { error: 'projectId, trackId, and curatorId are required' },
      { status: 400 }
    )
  }

  const supabase = createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: project } = await supabase
    .from('vault_projects')
    .select('id, title, genre, release_date, tracks (id, title)')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const track = ((project.tracks ?? []) as { id: string; title: string }[]).find(
    t => t.id === trackId
  )
  if (!track) return NextResponse.json({ error: 'Track not found in project' }, { status: 404 })

  const { data: curator } = await supabase
    .from('curators')
    .select('genre_focus, playlist_name')
    .eq('id', curatorId)
    .maybeSingle()
  if (!curator) return NextResponse.json({ error: 'Curator not found' }, { status: 404 })

  if (DEMO) {
    return NextResponse.json({ data: { note: demoNote(track.title, curator.playlist_name) } })
  }

  const { data: profile } = await supabase
    .from('artist_profiles')
    .select('artist_name')
    .eq('id', user.id)
    .maybeSingle()

  const prompt = buildPitchNotePrompt({
    artistName: profile?.artist_name ?? null,
    trackTitle: track.title,
    projectTitle: project.title,
    genre: project.genre,
    releaseDate: project.release_date,
    curatorGenreFocus: curator.genre_focus ?? [],
    playlistName: curator.playlist_name,
  })

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  let parsed: Record<string, unknown> | null
  try {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')
    parsed = extractJson(text)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Generation failed'
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  const note = parsed && typeof parsed.note === 'string' ? parsed.note : null
  if (!note) {
    return NextResponse.json({ error: 'Could not parse generated note' }, { status: 502 })
  }

  return NextResponse.json({ data: { note } })
}
