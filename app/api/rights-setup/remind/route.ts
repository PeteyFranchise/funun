import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'

const REMINDER_DELAY_MS = 7 * 24 * 60 * 60 * 1000

// POST /api/rights-setup/remind — a fixed, server-owned seven-day snooze.
// No client timestamp or user id is accepted.
export async function POST() {
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const remindAt = new Date(Date.now() + REMINDER_DELAY_MS).toISOString()
  const service = createServiceClient()
  const { data, error } = await service
    .from('user_profiles')
    .update({ rights_setup_remind_at: remindAt })
    .eq('id', user.id)
    .select('id')
    .maybeSingle()

  if (error || !data) {
    return NextResponse.json({ error: 'Could not set your reminder. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, remindAt })
}
