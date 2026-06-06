import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'

// POST /api/pitches — send a pitch from a vault project to an industry professional
export async function POST(request: Request) {
  const supabase = createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Check pitch credits
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('tier, pitch_credits_remaining')
    .eq('user_id', user.id)
    .single()

  if (!sub || sub.pitch_credits_remaining <= 0) {
    return NextResponse.json(
      { error: 'No pitch credits remaining. Upgrade to Pro for 20 pitches per month.' },
      { status: 403 }
    )
  }

  const { project_id, recipient_id, message } = await request.json()

  if (!project_id || !recipient_id) {
    return NextResponse.json({ error: 'project_id and recipient_id are required' }, { status: 400 })
  }

  // Verify project belongs to this artist and has sufficient readiness
  const { data: project } = await supabase
    .from('vault_projects')
    .select('vault_readiness_score, title')
    .eq('id', project_id)
    .eq('user_id', user.id)
    .single()

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  if (project.vault_readiness_score < 60) {
    return NextResponse.json(
      {
        error: `Your project needs a Vault Readiness Score of at least 60 to pitch. Current score: ${project.vault_readiness_score}`,
      },
      { status: 400 }
    )
  }

  // Verify recipient is a verified industry professional
  const { data: recipient } = await supabase
    .from('industry_profiles')
    .select('id, verified, currently_accepting, display_name')
    .eq('user_id', recipient_id)
    .single()

  if (!recipient?.verified) {
    return NextResponse.json({ error: 'Recipient is not a verified industry professional' }, { status: 400 })
  }

  if (!recipient.currently_accepting) {
    return NextResponse.json({ error: `${recipient.display_name} is not currently accepting pitches` }, { status: 400 })
  }

  // Check for duplicate pitch
  const { data: existing } = await supabase
    .from('pitches')
    .select('id')
    .eq('project_id', project_id)
    .eq('recipient_id', recipient_id)
    .single()

  if (existing) {
    return NextResponse.json({ error: 'You have already pitched this project to this person' }, { status: 409 })
  }

  // Create the pitch
  const { data: pitch, error } = await supabase
    .from('pitches')
    .insert({
      project_id,
      artist_id: user.id,
      recipient_id,
      message: message || null,
      status: 'sent',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Deduct pitch credit
  await supabase
    .from('subscriptions')
    .update({ pitch_credits_remaining: sub.pitch_credits_remaining - 1 })
    .eq('user_id', user.id)

  // Record as a submission for tracking
  await supabase.from('submissions').insert({
    project_id,
    user_id: user.id,
    destination_type: 'industry_pitch',
    destination_name: recipient.display_name,
    status: 'sent',
    submitted_at: new Date().toISOString(),
  })

  return NextResponse.json({ data: pitch })
}

// GET /api/pitches — list pitches sent by this artist
export async function GET(request: Request) {
  const supabase = createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const projectId = searchParams.get('project_id')

  let query = supabase
    .from('pitches')
    .select(
      `
      *,
      vault_projects (id, title, type, cover_art_url),
      industry_profiles!recipient_id (display_name, role, company, verified)
    `
    )
    .eq('artist_id', user.id)
    .order('sent_at', { ascending: false })

  if (projectId) query = query.eq('project_id', projectId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
