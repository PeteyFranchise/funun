import { NextResponse } from 'next/server'
import { requireRoomAccess } from '@/lib/playbook/rooms'
import { createServiceClient } from '@/lib/supabase/server'
import { loadAuthHealth } from '@/lib/auth/health'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireRoomAccess('it-team')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  return NextResponse.json({ data: await loadAuthHealth(createServiceClient()) })
}
