import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createApiClient } from '@/lib/supabase/server'
import type { ArtistProfile } from '@/types'
import { buildCalendarPrompt, type ToolProjectContext } from '@/lib/tools/registry'
import {
  readCalendarPosts,
  readPosts,
  PLATFORM_VALUES,
  type Platform,
  type SocialCampaign,
} from '@/lib/launchpad/campaigns'

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

// POST /api/launchpad/[projectId]/campaigns — generate a 4-week social calendar
// Also handles D-01 scoped regeneration when body contains campaignId + regeneratePlatform
export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params

  const supabase = createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json()) as {
    platforms?: unknown
    name?: string
    campaignId?: string
    regeneratePlatform?: string
  }

  // Validate platforms: must be an array of known platform slugs with at least one entry
  const rawPlatforms = Array.isArray(body.platforms) ? body.platforms : []
  const platforms = rawPlatforms.filter((p): p is Platform =>
    PLATFORM_VALUES.includes(p as Platform)
  )
  if (platforms.length === 0) {
    return NextResponse.json(
      { error: 'At least one valid platform is required' },
      { status: 400 }
    )
  }

  // Fetch the project scoped by user_id
  const { data: project } = await supabase
    .from('vault_projects')
    .select('id, title, type, genre, sub_genre, release_date, notes, cover_art_url, tracks (title)')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  // Fetch collaborator names (global roster scoped by user_id — RESEARCH.md Pitfall 1: no project join)
  const { data: collaboratorRows } = await supabase
    .from('collaborators')
    .select('name')
    .eq('user_id', user.id)
  const collaboratorNames: string[] = (collaboratorRows ?? [])
    .map(c => String(c.name ?? '').trim())
    .filter(Boolean)

  // Fetch artist profile
  const { data: profileRow } = await supabase
    .from('artist_profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()
  const profile = (profileRow ?? { artist_name: null }) as ArtistProfile

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

  // D-01 scoped regeneration: body carries an existing campaignId + regeneratePlatform
  if (body.campaignId && body.regeneratePlatform) {
    const regenPlatform = body.regeneratePlatform as Platform
    if (!PLATFORM_VALUES.includes(regenPlatform)) {
      return NextResponse.json({ error: 'Invalid regeneratePlatform' }, { status: 400 })
    }

    // Load the existing campaign (ownership-scoped)
    const { data: existingCampaign } = await supabase
      .from('social_campaigns')
      .select('id, posts, platforms')
      .eq('id', body.campaignId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!existingCampaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    // Keep all slots for other platforms, regenerate only the target platform's slots
    const existingPosts = readPosts(existingCampaign.posts)
    const retainedPosts = existingPosts.filter(p => p.platform !== regenPlatform)

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    let output: Record<string, unknown> | null
    try {
      const prompt = buildCalendarPrompt(profile, ctx, collaboratorNames, [regenPlatform])
      const message = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 8000,
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
      return NextResponse.json(
        { error: "Couldn't generate your calendar — please try again." },
        { status: 502 }
      )
    }

    const rawPosts = (output.posts ?? output) as unknown
    const newPlatformPosts = readCalendarPosts(rawPosts, project.release_date ?? null)

    if (newPlatformPosts.length === 0) {
      return NextResponse.json(
        { error: "Couldn't generate your calendar — please try again." },
        { status: 502 }
      )
    }

    const mergedPosts = [...retainedPosts, ...newPlatformPosts]

    const { data: updatedCampaign, error: updateError } = await supabase
      .from('social_campaigns')
      .update({ posts: mergedPosts })
      .eq('id', body.campaignId)
      .eq('user_id', user.id)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ data: updatedCampaign })
  }

  // Fresh generation
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  let output: Record<string, unknown> | null
  try {
    const prompt = buildCalendarPrompt(profile, ctx, collaboratorNames, platforms)
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 8000,
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
    return NextResponse.json(
      { error: "Couldn't generate your calendar — please try again." },
      { status: 502 }
    )
  }

  const rawPosts = (output.posts ?? output) as unknown
  const validatedPosts = readCalendarPosts(rawPosts, project.release_date ?? null)

  if (validatedPosts.length === 0) {
    return NextResponse.json(
      { error: "Couldn't generate your calendar — please try again." },
      { status: 502 }
    )
  }

  const campaignName = typeof body.name === 'string' && body.name.trim()
    ? body.name.trim()
    : `Campaign ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`

  // D-04: flip any existing active campaign for this project to is_active=false
  // This happens BEFORE the INSERT so the partial unique index never sees two active rows
  await supabase
    .from('social_campaigns')
    .update({ is_active: false })
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .eq('is_active', true)

  // Insert the new campaign as the active one
  const { data: newCampaign, error: insertError } = await supabase
    .from('social_campaigns')
    .insert({
      project_id: projectId,
      user_id: user.id,
      name: campaignName,
      platforms,
      is_active: true,
      posts: validatedPosts,
    })
    .select()
    .single()

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({ data: newCampaign }, { status: 201 })
}

// GET /api/launchpad/[projectId]/campaigns — list all campaigns for the project
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params

  const supabase = createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: campaigns, error } = await supabase
    .from('social_campaigns')
    .select('*')
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .order('is_active', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Run each campaign's posts through readPosts() for type safety
  const sanitized = ((campaigns ?? []) as SocialCampaign[]).map(c => ({
    ...c,
    posts: readPosts(c.posts),
  }))

  return NextResponse.json({ data: sanitized })
}

// PATCH /api/launchpad/[projectId]/campaigns — set one campaign as active (D-04)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params

  const supabase = createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json()) as { campaignId?: string }
  if (!body.campaignId) {
    return NextResponse.json({ error: 'campaignId is required' }, { status: 400 })
  }

  // Verify ownership before mutating
  const { data: target } = await supabase
    .from('social_campaigns')
    .select('id')
    .eq('id', body.campaignId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!target) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

  // Flip all this project's campaigns inactive, then set the target active
  await supabase
    .from('social_campaigns')
    .update({ is_active: false })
    .eq('project_id', projectId)
    .eq('user_id', user.id)

  const { data: activeCampaign, error: activateError } = await supabase
    .from('social_campaigns')
    .update({ is_active: true })
    .eq('id', body.campaignId)
    .eq('user_id', user.id)
    .select()
    .single()

  if (activateError) {
    return NextResponse.json({ error: activateError.message }, { status: 500 })
  }

  return NextResponse.json({ data: activeCampaign })
}

// DELETE /api/launchpad/[projectId]/campaigns — hard-delete an inactive campaign (D-05)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId: _projectId } = await params

  const supabase = createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json()) as { campaignId?: string }
  if (!body.campaignId) {
    return NextResponse.json({ error: 'campaignId is required' }, { status: 400 })
  }

  // Load the campaign scoped by user_id
  const { data: campaign } = await supabase
    .from('social_campaigns')
    .select('id, is_active')
    .eq('id', body.campaignId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

  // D-05: the active campaign cannot be deleted
  if (campaign.is_active) {
    return NextResponse.json(
      { error: "The active campaign can't be deleted — set another campaign active first." },
      { status: 409 }
    )
  }

  const { error: deleteError } = await supabase
    .from('social_campaigns')
    .delete()
    .eq('id', body.campaignId)
    .eq('user_id', user.id)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  return NextResponse.json({ data: { deleted: true } })
}
