import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createApiClient } from '@/lib/supabase/server'
import type { ArtistProfile } from '@/types'
import {
  buildSlotCaptionPrompt,
  buildSlotHookPrompt,
  type ToolProjectContext,
} from '@/lib/tools/registry'
import { readPosts } from '@/lib/launchpad/campaigns'

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

// POST /api/launchpad/[projectId]/campaigns/[campaignId]/slots/[slotId]/generate
// D-10 preview-then-accept: generates a slot caption or hook from Claude and returns it
// WITHOUT writing to the DB. The write happens via the separate slot PATCH on "Use this" click.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; campaignId: string; slotId: string }> }
) {
  const { projectId, campaignId, slotId } = await params

  const supabase = createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Step 2: load parent campaign scoped by user_id (IDOR guard — ownership first)
  const { data: campaign } = await supabase
    .from('social_campaigns')
    .select('id, project_id, user_id, posts')
    .eq('id', campaignId)
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

  const posts = readPosts(campaign.posts)
  const slot = posts.find(p => p.id === slotId)
  if (!slot) return NextResponse.json({ error: 'Slot not found' }, { status: 404 })

  // Step 3: fetch project + profile for prompt context
  const { data: project } = await supabase
    .from('vault_projects')
    .select('id, title, type, genre, sub_genre, release_date, notes, tracks (title)')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const { data: profile } = await supabase
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

  const artistProfile = (profile ?? { artist_name: null }) as ArtistProfile

  // Step 4: choose prompt builder by content_type
  // short_form_video + stories → hook framing; static_image, lyric_graphic, text → caption framing
  const slotArg = {
    platform: slot.platform,
    week: slot.week,
    content_type: slot.content_type,
    existingCaption: slot.caption,
  }

  const isHookSlot = slot.content_type === 'short_form_video' || slot.content_type === 'stories'
  const prompt = isHookSlot
    ? buildSlotHookPrompt(artistProfile, ctx, slotArg)
    : buildSlotCaptionPrompt(artistProfile, ctx, slotArg)

  // Step 5: run AI call (max_tokens: 1000 — single caption output is small)
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  let output: Record<string, unknown> | null
  try {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1000,
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

  const caption = output?.caption
  if (!caption || typeof caption !== 'string' || !caption.trim()) {
    return NextResponse.json(
      { error: "Couldn't generate a suggestion — please try again." },
      { status: 502 }
    )
  }

  // Step 6: return preview — NO DB write (D-10)
  return NextResponse.json({ data: { caption: String(caption) } })
}
