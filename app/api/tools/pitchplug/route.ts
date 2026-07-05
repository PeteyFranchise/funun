import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import type { ArtistProfile } from '@/types'
import {
  buildPitchPlugPrompt,
  getCurator,
  type CuratorType,
  type PitchPlugProjectContext,
  type PitchPlugOutput,
} from '@/lib/tools/pitchplug'

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

function demoPitches(curatorTypes: CuratorType[], title: string): PitchPlugOutput {
  const out: PitchPlugOutput = {}
  for (const t of curatorTypes) {
    const c = getCurator(t)
    out[t] = {
      subject: `${title.toLowerCase()} — quick one for you`,
      body: `Hey — I put out a track called "${title}" and thought of your ${c?.blurb.toLowerCase() ?? 'page'}.\n\nIt sits somewhere between late-night and hopeful, the kind of thing that works when someone's driving home and not ready to be home yet. No big rollout, just trying to get it in front of the right ears.\n\nIf it's a fit, I'd love for you to give it a listen. Either way, thanks for the time.`,
    }
  }
  return out
}

// POST /api/tools/pitchplug — generate cold-outreach emails per curator type.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    projectId?: string
    curatorTypes?: CuratorType[]
  }
  const projectId = body.projectId
  const curatorTypes = (body.curatorTypes ?? []).filter(t => getCurator(t)) as CuratorType[]

  if (!projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
  if (curatorTypes.length === 0) {
    return NextResponse.json({ error: 'Select at least one recipient type' }, { status: 400 })
  }

  if (DEMO) {
    return NextResponse.json({ data: demoPitches(curatorTypes, 'Your Track') })
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

  const ctx: PitchPlugProjectContext = {
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

  const prompt = buildPitchPlugPrompt(
    (profile ?? { artist_name: null }) as ArtistProfile,
    ctx,
    curatorTypes
  )

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  let parsed: Record<string, unknown> | null
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
    parsed = extractJson(text)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Generation failed'
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  if (!parsed) {
    return NextResponse.json({ error: 'Could not parse generated pitches' }, { status: 502 })
  }

  // Keep only requested curator keys with the expected shape.
  const out: PitchPlugOutput = {}
  for (const t of curatorTypes) {
    const v = parsed[t]
    if (v && typeof v === 'object' && 'subject' in v && 'body' in v) {
      const o = v as { subject: unknown; body: unknown }
      if (typeof o.subject === 'string' && typeof o.body === 'string') {
        out[t] = { subject: o.subject, body: o.body }
      }
    }
  }

  if (Object.keys(out).length === 0) {
    return NextResponse.json({ error: 'No pitches were generated' }, { status: 502 })
  }

  return NextResponse.json({ data: out })
}
