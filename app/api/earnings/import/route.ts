import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'
import { parseDsrFlatFile } from '@/lib/dsr/parse'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { parseAdmittedFormData } from '@/lib/security/upload-admission'

export const maxDuration = 30

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
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (await checkRateLimit(`earnings-import:${user.id}`, { maxAttempts: 20 })) {
    return NextResponse.json({ error: 'Too many imports — please slow down.' }, { status: 429 })
  }

  const parsed = await parseAdmittedFormData(supabase, request, {
    operation: 'earnings:dsr-import',
    maxBodyBytes: MAX_UPLOAD_BYTES + 512 * 1024,
    dailyCountLimit: 20,
    dailyByteLimit: 100 * 1024 * 1024,
  })
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status })
  const file = parsed.form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'File exceeds 10 MB' }, { status: 400 })
  }

  const text = await file.text()
  const summary = parseDsrFlatFile(text)

  const { error: persistError } = await supabase.from('dsr_imports').insert({
    user_id: user.id,
    file_name: file.name.slice(0, 200),
    currency: summary.currency,
    total_revenue: summary.totalRevenue,
    total_units: summary.totalUnits,
    by_isrc: summary.byIsrc,
  })
  if (persistError) {
    return NextResponse.json(
      { error: 'The report was parsed but could not be saved. Please try again.' },
      { status: 503 }
    )
  }

  return NextResponse.json({ data: summary })
}
