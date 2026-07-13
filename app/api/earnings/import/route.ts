import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'
import { parseDsrFlatFile } from '@/lib/dsr/parse'

export const maxDuration = 30

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

// POST /api/earnings/import  (multipart/form-data: file)
// Parses an uploaded DDEX DSR flat-file, persists the aggregate (migration
// 015), and returns it.
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
  if (file.size > 50 * 1024 * 1024) return NextResponse.json({ error: 'File exceeds 50 MB' }, { status: 400 })

  const text = await file.text()
  const summary = parseDsrFlatFile(text)

  if (!DEMO) {
    try {
      const supabase = await createApiClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user) {
        await supabase.from('dsr_imports').insert({
          user_id: user.id,
          file_name: file.name.slice(0, 200),
          currency: summary.currency,
          total_revenue: summary.totalRevenue,
          total_units: summary.totalUnits,
          by_isrc: summary.byIsrc,
        })
      }
    } catch {
      // best-effort — parsing still succeeds even if the table isn't there yet
    }
  }

  return NextResponse.json({ data: summary })
}
