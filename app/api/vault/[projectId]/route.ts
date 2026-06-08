import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'
import type { VaultProjectStatus, VaultProjectType } from '@/types'
import { updateDemoProject, deleteDemoProject } from '@/lib/vault/demo-store'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

const VALID_TYPES: VaultProjectType[] = ['single', 'snippet', 'ep', 'album', 'unreleased']
const VALID_STATUSES: VaultProjectStatus[] = [
  'in_progress',
  'vault_ready',
  'submitted',
  'released',
  'archived',
  'shelved',
]

type ProjectUpdate = {
  title?: string
  type?: VaultProjectType
  status?: VaultProjectStatus
  genre?: string | null
  sub_genre?: string | null
  release_date?: string | null
  notes?: string | null
  content_id_registered?: boolean
  content_id_dismissed_until?: string | null
}

function sanitize(body: Record<string, unknown>): ProjectUpdate | { error: string } {
  const update: ProjectUpdate = {}

  if ('title' in body) {
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    if (!title) return { error: 'Title cannot be empty' }
    update.title = title
  }
  if ('type' in body) {
    if (!VALID_TYPES.includes(body.type as VaultProjectType)) {
      return { error: 'Invalid project type' }
    }
    update.type = body.type as VaultProjectType
  }
  if ('status' in body) {
    if (!VALID_STATUSES.includes(body.status as VaultProjectStatus)) {
      return { error: 'Invalid status' }
    }
    update.status = body.status as VaultProjectStatus
  }
  for (const key of ['genre', 'sub_genre', 'release_date', 'notes'] as const) {
    if (!(key in body)) continue
    const value = body[key]
    if (value === null) {
      update[key] = null
    } else if (typeof value === 'string') {
      const trimmed = value.trim()
      update[key] = trimmed === '' ? null : trimmed
    }
  }
  // ContentID actions (Stage 3): confirm setup, or dismiss for 30 days.
  if ('content_id_registered' in body && typeof body.content_id_registered === 'boolean') {
    update.content_id_registered = body.content_id_registered
  }
  if ('content_id_dismissed_until' in body) {
    const v = body.content_id_dismissed_until
    update.content_id_dismissed_until = v === null ? null : String(v)
  }

  return update
}

// PATCH /api/vault/[projectId] — update project details / status.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const body = (await request.json()) as Record<string, unknown>
  const result = sanitize(body)
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }
  if (Object.keys(result).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  if (DEMO) {
    const project = await updateDemoProject(projectId, result)
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    return NextResponse.json({ data: project })
  }

  const supabase = createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('vault_projects')
    .update(result)
    .eq('id', projectId)
    .eq('user_id', user.id)
    .select()
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  return NextResponse.json({ data })
}

// DELETE /api/vault/[projectId] — remove a project (child rows cascade).
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params

  if (DEMO) {
    const ok = await deleteDemoProject(projectId)
    if (!ok) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    return NextResponse.json({ data: { id: projectId } })
  }

  const supabase = createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('vault_projects')
    .delete()
    .eq('id', projectId)
    .eq('user_id', user.id)
    .select('id')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  return NextResponse.json({ data })
}
