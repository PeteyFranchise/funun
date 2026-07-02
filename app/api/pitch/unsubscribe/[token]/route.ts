import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// POST /api/pitch/unsubscribe/[token] — public, token-authenticated. The
// token resolves a specific pitch a curator received, whose curator_id we
// then flip do_not_pitch=true on (D-20). The curator is NOT deleted — they
// stay visible/browsable in the directory, only blocked from future sends
// (already enforced by /api/pitches, 06-04). Idempotent — safe to click
// twice.
export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const service = createServiceClient()

  const { data: pitch } = await service
    .from('pitch_history')
    .select('id, curator_id')
    .eq('response_token', token)
    .maybeSingle()

  if (!pitch) {
    return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 })
  }

  const { error: updateError } = await service
    .from('curators')
    .update({ do_not_pitch: true })
    .eq('id', pitch.curator_id)
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
