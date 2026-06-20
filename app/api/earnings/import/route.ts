import { NextResponse } from 'next/server'
import { parseDsrFlatFile } from '@/lib/dsr/parse'

export const maxDuration = 30

// POST /api/earnings/import  (multipart/form-data: file)
// Parses an uploaded DDEX DSR flat-file and returns aggregated earnings.
// Parse-only for now (no persistence) — a future migration can store the
// aggregates against the artist's catalogue.
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
  if (file.size > 50 * 1024 * 1024) return NextResponse.json({ error: 'File exceeds 50 MB' }, { status: 400 })

  const text = await file.text()
  const summary = parseDsrFlatFile(text)
  return NextResponse.json({ data: summary })
}
