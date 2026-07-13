import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'
import type { DocumentType } from '@/types'
import { readComposers } from '@/lib/metadata/schema'
import { verifyContractPdf, type VerifyContext } from '@/lib/contracts/verify'

export const maxDuration = 60

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

const VALID_TYPES: DocumentType[] = [
  'split_sheet',
  'copyright_registration',
  'hire_right',
  'sample_clearance',
  'distribution_agreement',
]

// POST /api/contracts/verify  (multipart/form-data)
// fields: file (PDF), projectId, type — uploads an external contract,
// runs AI completeness/accuracy verification, and stores the result.
export async function POST(request: Request) {
  if (DEMO) {
    // Demo can't persist; return a simulated verified result so the UI flows.
    return NextResponse.json({
      data: {
        status: 'verified',
        summary: 'Demo: looks complete and consistent.',
        checks: [
          { key: 'splits_total', label: 'Splits total 100%', detail: 'Adds up exactly', state: 'pass' },
          { key: 'parties_present', label: 'All parties present', detail: 'All named', state: 'pass' },
          { key: 'signatures_present', label: 'Signatures present', detail: 'All signed', state: 'pass' },
          { key: 'terms_match', label: 'Terms match release', detail: 'Aligns with Vault', state: 'pass' },
        ],
      },
    })
  }

  const form = await request.formData()
  const file = form.get('file')
  const projectId = String(form.get('projectId') ?? '')
  const type = String(form.get('type') ?? '') as DocumentType

  if (!(file instanceof File)) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
  if (file.type !== 'application/pdf') return NextResponse.json({ error: 'Only PDF files are accepted' }, { status: 400 })
  if (file.size > 20 * 1024 * 1024) return NextResponse.json({ error: 'File exceeds 20 MB' }, { status: 400 })
  if (!VALID_TYPES.includes(type)) return NextResponse.json({ error: 'Unknown contract type' }, { status: 400 })

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Project ownership + verification context.
  const { data: project } = await supabase
    .from('vault_projects')
    .select('id, title, tracks (isrc, metadata)')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const tracks = ((project as { tracks?: { isrc: string | null; metadata: Record<string, unknown> | null }[] }).tracks) ?? []
  const isrcs = tracks.map(t => t.isrc).filter((v): v is string => Boolean(v))
  const writerMap = new Map<string, number>()
  for (const t of tracks) for (const c of readComposers(t.metadata)) if (!writerMap.has(c.name)) writerMap.set(c.name, c.split)
  const expectedWriters = Array.from(writerMap, ([name, split]) => ({ name, split }))

  // Upload the PDF to the private bucket.
  const bytes = Buffer.from(await file.arrayBuffer())
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80)
  const path = `${user.id}/${projectId}/${Date.now()}-${safeName}`
  const { error: upErr } = await supabase.storage.from('vault-contracts').upload(path, bytes, {
    contentType: 'application/pdf',
    upsert: false,
  })
  if (upErr) return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 })

  // Run AI verification.
  const ctx: VerifyContext = { docType: type, releaseTitle: project.title, isrcs, expectedWriters }
  const result = await verifyContractPdf(bytes.toString('base64'), ctx)

  // Persist as an uploaded, verified document.
  const { data: doc, error } = await supabase
    .from('vault_documents')
    .insert({
      user_id: user.id,
      project_id: projectId,
      type,
      status: result.status === 'verified' ? 'verified' : 'pending',
      source: 'uploaded',
      file_url: path,
      document_data: {},
      verification_status: result.status,
      verification_checks: result.checks,
      verification_summary: result.summary,
      verified_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: { document: doc, result } })
}
