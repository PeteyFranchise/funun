import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { runMatchingForOpportunity } from '@/lib/matching/run'
import type { Opportunity } from '@/types'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

// POST /api/antenna/match — re-run matching for one of the owner's opportunities.
export async function POST(request: Request) {
  if (DEMO) return NextResponse.json({ error: 'Disabled in demo mode' }, { status: 400 })

  const supabase = createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { opportunityId } = (await request.json().catch(() => ({}))) as { opportunityId?: string }
  if (!opportunityId) {
    return NextResponse.json({ error: 'opportunityId is required' }, { status: 400 })
  }

  // Only the owner can trigger a rematch.
  const { data: opp } = await supabase
    .from('opportunities')
    .select('*')
    .eq('id', opportunityId)
    .eq('created_by', user.id)
    .maybeSingle()
  if (!opp) return NextResponse.json({ error: 'Opportunity not found' }, { status: 404 })

  const service = createServiceClient()
  const { matched } = await runMatchingForOpportunity(service, opp as Opportunity)
  return NextResponse.json({ data: { matched } })
}
