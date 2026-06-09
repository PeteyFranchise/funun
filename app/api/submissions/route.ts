import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'
import { createSubmission } from '@/lib/submissions'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

// POST /api/submissions — record an outbound pitch (PitchPlug "mark as sent").
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    projectId?: string
    type?: string
    destinationName?: string
    destinationContact?: string | null
    pitchText?: string | null
  }

  if (!body.projectId || !body.destinationName) {
    return NextResponse.json(
      { error: 'projectId and destinationName are required' },
      { status: 400 }
    )
  }

  if (DEMO) {
    return NextResponse.json(
      { error: 'Sending is disabled in demo mode' },
      { status: 400 }
    )
  }

  const supabase = createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await createSubmission(supabase, {
    projectId: body.projectId,
    userId: user.id,
    type: body.type ?? 'playlist_curator',
    destination: { name: body.destinationName, contact: body.destinationContact },
    pitchText: body.pitchText,
    status: 'sent',
  })

  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json({ data })
}
