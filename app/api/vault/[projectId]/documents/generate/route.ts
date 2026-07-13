import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import type { ArtistProfile } from '@/types'
import type { Stage3ToolSlug } from '@/lib/vault/stage3'
import { TOOL_DOC_TYPE, TOOL_NAME, buildDocPrompt } from '@/lib/tools/documents'
import { buildSplitSheet } from '@/lib/tools/splitsheet'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'
const MODEL = 'claude-sonnet-4-6'

const VALID_TOOLS: Stage3ToolSlug[] = [
  'splitsheet',
  'hireright',
  'copyrightkit',
  'sampleclear',
  'contentid',
]

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

// POST /api/vault/[projectId]/documents/generate
// Body: { tool, trackId?, input } — runs a Stage 3 doc tool and persists
// the result to tool_outputs (+ vault_documents for the gated tools).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params

  if (DEMO) {
    return NextResponse.json(
      { error: 'Document generation is not available in demo mode' },
      { status: 400 }
    )
  }

  const body = (await request.json()) as {
    tool?: string
    trackId?: string
    input?: Record<string, unknown>
  }
  const tool = body.tool as Stage3ToolSlug
  if (!VALID_TOOLS.includes(tool)) {
    return NextResponse.json({ error: 'Unknown document tool' }, { status: 400 })
  }
  const input = body.input ?? {}
  const trackId = body.trackId ?? null

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Confirm project ownership.
  const { data: project } = await supabase
    .from('vault_projects')
    .select('id, title')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const docType = TOOL_DOC_TYPE[tool]

  // ── SplitSheet: form-only, no AI. Validate percentages total 100. ────
  if (tool === 'splitsheet') {
    const result = buildSplitSheet(input)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })

    const { data: doc, error } = await supabase
      .from('vault_documents')
      .insert({
        user_id: user.id,
        project_id: projectId,
        track_id: trackId,
        type: 'split_sheet',
        status: 'pending',
        document_data: result.data,
      })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data: { document: doc, output: result.data } })
  }

  // ── AI tools: build prompt, generate JSON. ───────────────────────────
  // Ownership established above (project scoped to user.id). artist_profiles
  // is column-privilege-locked (migration 040) — a session-bound SELECT *
  // would 42501, and this route exists to consume the artist's legal-name
  // and contact fields — so the read runs on the service-role client scoped
  // to the verified user.id (D-19 companion pattern).
  const service = createServiceClient()
  const { data: profile } = await service
    .from('artist_profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  const prompt = buildDocPrompt(tool, (profile ?? { artist_name: null }) as ArtistProfile, input)
  if (!prompt) return NextResponse.json({ error: 'Tool not generatable' }, { status: 400 })

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  let output: Record<string, unknown> | null
  try {
    const message = await anthropic.messages.create({
      model: MODEL,
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

  // Log the generation.
  await supabase.from('tool_outputs').insert({
    user_id: user.id,
    project_id: projectId,
    tool_slug: tool,
    title: TOOL_NAME[tool],
    inputs: { projectId, trackId, ...input },
    output,
  })

  // ContentID has no document — it generates a guide only.
  if (!docType) {
    return NextResponse.json({ data: { output } })
  }

  // Gated tools also create a pending vault_documents record.
  const { data: doc, error: docError } = await supabase
    .from('vault_documents')
    .insert({
      user_id: user.id,
      project_id: projectId,
      track_id: trackId,
      type: docType,
      status: 'pending',
      document_data: output,
    })
    .select()
    .single()
  if (docError) return NextResponse.json({ error: docError.message }, { status: 500 })

  return NextResponse.json({ data: { document: doc, output } })
}
