import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import type { Opportunity, OpportunityType, CompensationType } from '@/types'
import { runMatchingForOpportunity } from '@/lib/matching/run'
import { hasCapability } from '@/lib/capabilities/check'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

const TYPES: OpportunityType[] = ['sync', 'playlist', 'label', 'venue', 'festival', 'press', 'brand']
const COMP: CompensationType[] = ['paid', 'rev_share', 'credit_only', 'tbd']

function toStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string')
  if (typeof v === 'string') {
    return v
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
  }
  return []
}

// GET /api/antenna/opportunities — list the signed-in industry pro's own opps.
export async function GET() {
  if (DEMO) return NextResponse.json({ data: [] })
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('opportunities')
    .select('*')
    .eq('created_by', user.id)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// POST /api/antenna/opportunities — create an opportunity and run matching.
export async function POST(request: Request) {
  if (DEMO) {
    return NextResponse.json({ error: 'Creating is disabled in demo mode' }, { status: 400 })
  }

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // D-14: server-side capability gate — hasCapability() requires an approved
  // 'industry' grant row. Nav-hiding (Plan 03) is defense-in-depth only;
  // this is the authoritative permission boundary (T-15-07 mitigation).
  if (!(await hasCapability(user.id, 'industry'))) {
    return NextResponse.json(
      { error: 'Only accounts with industry access can post opportunities' },
      { status: 403 }
    )
  }

  // Must be a registered industry pro.
  const { data: profile } = await supabase
    .from('industry_profiles')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!profile) {
    return NextResponse.json(
      { error: 'Only industry professionals can post opportunities' },
      { status: 403 }
    )
  }

  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>
  if (!b.title || !b.type || !TYPES.includes(b.type as OpportunityType)) {
    return NextResponse.json({ error: 'A title and valid type are required' }, { status: 400 })
  }

  const compType =
    typeof b.compensation_type === 'string' && COMP.includes(b.compensation_type as CompensationType)
      ? (b.compensation_type as CompensationType)
      : null

  const insert = {
    created_by: user.id,
    industry_profile_id: profile.id,
    title: String(b.title),
    description: typeof b.description === 'string' ? b.description : '',
    type: b.type as OpportunityType,
    genres: toStringArray(b.genres),
    mood_tags: toStringArray(b.mood_tags),
    bpm_min: typeof b.bpm_min === 'number' ? b.bpm_min : null,
    bpm_max: typeof b.bpm_max === 'number' ? b.bpm_max : null,
    deadline: typeof b.deadline === 'string' ? b.deadline : null,
    response_deadline: typeof b.response_deadline === 'string' ? b.response_deadline : null,
    active: true,
    exclusive: Boolean(b.exclusive),
    compensation: typeof b.compensation === 'string' ? b.compensation : null,
    compensation_type: compType,
    submission_requirements:
      typeof b.submission_requirements === 'string' ? b.submission_requirements : null,
    min_readiness_score: typeof b.min_readiness_score === 'number' ? b.min_readiness_score : 60,
    min_monthly_listeners:
      typeof b.min_monthly_listeners === 'number' ? b.min_monthly_listeners : null,
    max_monthly_listeners:
      typeof b.max_monthly_listeners === 'number' ? b.max_monthly_listeners : null,
    career_stages: Array.isArray(b.career_stages)
      ? (b.career_stages as unknown[]).filter((x): x is number => typeof x === 'number')
      : [1, 2, 3, 4],
    location_preference: typeof b.location_preference === 'string' ? b.location_preference : null,
    slots_available: typeof b.slots_available === 'number' ? b.slots_available : 1,
    platform: typeof b.platform === 'string' ? b.platform : null,
    pete_exclusive: Boolean(b.pete_exclusive),
    pete_note: typeof b.pete_note === 'string' ? b.pete_note : null,
  }

  const { data, error } = await supabase.from('opportunities').insert(insert).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fan out matches with the service client (reads across all artists).
  try {
    const service = createServiceClient()
    await runMatchingForOpportunity(service, data as Opportunity)
  } catch {
    // Matching failure shouldn't block creation; it can be re-run.
  }

  return NextResponse.json({ data })
}
