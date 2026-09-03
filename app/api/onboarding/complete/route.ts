import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'

// POST /api/onboarding/complete — idempotently closes the signed-in user's
// one-time welcome. The private profile field is never accepted from input.
export async function POST() {
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { data, error } = await service
    .from('user_profiles')
    .update({ first_sign_in_completed_at: new Date().toISOString() })
    .eq('id', user.id)
    .select('id')
    .maybeSingle()

  if (error || !data) {
    return NextResponse.json({ error: 'Could not finish setup. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
