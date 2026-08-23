import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'
import { parseDsrFlatFile } from '@/lib/dsr/parse'
import { checkRateLimit } from '@/lib/security/rate-limit'

export const maxDuration = 30

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

// Aligned down from the old, misleading 50 MB (audit #9): the hosting layer caps
// the request body well below that, and a large DSR report belongs in a
// direct-to-storage + queued-parse flow, not this inline parser. Keep the parser
// input bounded.
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

// POST /api/earnings/import  (multipart/form-data: file)
// Parses an uploaded DDEX DSR flat-file, persists the aggregate (migration 015),
// and returns it.
export async function POST(request: Request) {
  // Authenticate + rate-limit BEFORE touching the request body (audit #9). An
  // unauthenticated caller must never reach the multipart read or the DSR parser
  // — that was an unauthenticated CPU/memory endpoint. Demo mode is a seeded
  // local preview with no real auth, so it skips the gate like the rest of the app.
  let userId: string | null = null
  if (!DEMO) {
    const supabase = await createApiClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    userId = user.id
    if (await checkRateLimit(`earnings-import:${user.id}`, { maxAttempts: 20 })) {
      return NextResponse.json({ error: 'Too many imports — please slow down.' }, { status: 429 })
    }
  }

  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'File exceeds 10 MB' }, { status: 400 })
  }

  const text = await file.text()
  const summary = parseDsrFlatFile(text)

  if (userId) {
    try {
      const supabase = await createApiClient()
      await supabase.from('dsr_imports').insert({
        user_id: userId,
        file_name: file.name.slice(0, 200),
        currency: summary.currency,
        total_revenue: summary.totalRevenue,
        total_units: summary.totalUnits,
        by_isrc: summary.byIsrc,
      })
    } catch {
      // best-effort — parsing still succeeds even if the table isn't there yet
    }
  }

  return NextResponse.json({ data: summary })
}
