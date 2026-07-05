import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import type { ArtistProfile } from '@/types'
import { getTool, buildToolPrompt, type ToolProjectContext } from '@/lib/tools/registry'
import { addDemoToolOutput } from '@/lib/vault/demo-store'

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

// POST /api/tools/[slug] — run a tool against a project and save its output.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const tool = getTool(slug)
  if (!tool) return NextResponse.json({ error: 'Unknown tool' }, { status: 404 })
  if (!tool.available) {
    return NextResponse.json({ error: 'This tool is coming soon' }, { status: 400 })
  }

  const body = (await request.json()) as { projectId?: string }
  const projectId = body.projectId
  if (!projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 })

  if (DEMO) {
    const project = await addDemoToolOutput(projectId, { tool_slug: slug, title: tool.name })
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    return NextResponse.json({ data: { demo: true } })
  }

  const supabase = createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: project } = await supabase
    .from('vault_projects')
    .select('id, title, type, genre, sub_genre, release_date, notes, tracks (title)')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  // Ownership established via auth.getUser() above. artist_profiles is
  // column-privilege-locked (migration 040) — a session-bound SELECT * would
  // 42501 — so the owner's full row is read via the service-role client
  // scoped to the verified user.id (D-19 companion pattern).
  const service = createServiceClient()
  const { data: profile } = await service
    .from('artist_profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  const ctx: ToolProjectContext = {
    title: project.title,
    type: project.type,
    genre: project.genre,
    sub_genre: project.sub_genre,
    release_date: project.release_date,
    notes: project.notes,
    trackTitles: ((project.tracks ?? []) as { title?: string }[])
      .map(t => t.title)
      .filter((t): t is string => Boolean(t)),
  }

  const prompt = buildToolPrompt(
    tool.slug,
    (profile ?? { artist_name: null }) as ArtistProfile,
    ctx
  )
  if (!prompt) {
    return NextResponse.json({ error: 'This tool is coming soon' }, { status: 400 })
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  let output: Record<string, unknown> | null
  try {
    const message = await anthropic.messages.create({
      model: MODEL,
      // Some tools (DistroAdvisor, RoyaltyAudit) emit long structured JSON;
      // 2000 truncated them mid-object and broke JSON parsing.
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')
    output = extractJson(text)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Generation failed'
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  if (!output) {
    return NextResponse.json({ error: 'Could not parse tool output' }, { status: 502 })
  }

  const { data, error } = await supabase
    .from('tool_outputs')
    .insert({
      user_id: user.id,
      project_id: projectId,
      tool_slug: slug,
      title: tool.name,
      inputs: { projectId },
      output,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
