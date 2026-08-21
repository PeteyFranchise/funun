// GET /api/vault/[projectId]/export/status?jobId=... (audit #10)
// Ownership-checked poll for a queued vault_export job. Mints a FRESH signed URL
// from the assembled pack path when the job is done — never stores a URL that
// could expire between assembly and the client's poll.

export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { getJob } from '@/lib/jobs/queue'
import { EXPORT_BUCKET } from '@/lib/vault/export-assemble'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const jobId = new URL(request.url).searchParams.get('jobId')
  if (!jobId) return NextResponse.json({ error: 'Missing jobId' }, { status: 400 })

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const job = await getJob(jobId)
  // Ownership: payload is service-set at enqueue. Confirm the job is a
  // vault_export owned by THIS user for THIS project before revealing anything.
  const payload = (job?.payload ?? {}) as { userId?: string; projectId?: string }
  if (!job || job.type !== 'vault_export' || payload.userId !== user.id || payload.projectId !== projectId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (job.status === 'failed') return NextResponse.json({ status: 'failed' })
  if (job.status !== 'completed') return NextResponse.json({ status: 'processing' })

  const result = (job.result ?? {}) as { path?: string; mode?: string }
  if (!result.path) return NextResponse.json({ status: 'failed' })

  const mode = result.mode === 'share' ? 'share' : 'download'
  const ttl = mode === 'download' ? 60 * 5 : 60 * 60 * 24 * 7
  const service = createServiceClient()
  const { data: signed } = await service.storage.from(EXPORT_BUCKET).createSignedUrl(result.path, ttl)

  return NextResponse.json({ status: 'ready', url: signed?.signedUrl ?? null, mode })
}
