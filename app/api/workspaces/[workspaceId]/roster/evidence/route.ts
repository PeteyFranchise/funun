import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { requireWorkspaceAccess, requireWorkspaceRole } from '@/lib/workspaces/access'
import { logWorkspaceAction } from '@/lib/workspaces/audit'
import { canManageRoster } from '@/lib/workspaces/membership'
import { describeProvenance } from '@/lib/workspaces/evidence'

// ─── /api/workspaces/[workspaceId]/roster/evidence — declared-scope ladder ──
// (D-16, D-36, D-37, D-46). Funūn NEVER opens, parses, extracts from, or
// validates the file referenced by `documentId` anywhere in this route —
// there is no file read, no PDF/document parsing import, and no call to
// any text-extraction helper here. The rights holder DECLARES the scope of
// authority they are granting (`declaredScope`); the attached document is
// only supporting evidence for that declaration, never something Funūn
// checks the declaration against (D-36). No column or response value in
// this route ever calls a stored document "verified" or "approved" — the
// only observation vocabulary used is `describeProvenance`'s two neutral
// phrasings (D-37).
//
// DELETE never removes a workspace_agreement_evidence row at the database
// level — it supersedes (sets `superseded_at`/`superseded_by`), because a
// billing or relationship event must never destroy rights evidence (D-46).

const RecordEvidenceSchema = z
  .object({
    relationshipId: z.string().uuid(),
    declaredScope: z.string().trim().min(1, 'A declared scope is required.'),
    documentId: z.string().uuid().optional(),
    effectiveFrom: z.string().optional(),
    expiresAt: z.string().optional(),
  })
  .strict()

const SupersedeEvidenceSchema = z
  .object({
    evidenceId: z.string().uuid(),
    replacementId: z.string().uuid().optional(),
  })
  .strict()

/**
 * Reads whether the referenced `vault_documents` row records a completed,
 * Funūn-executed e-sign flow (its `document_data.esign.completedAt`
 * timestamp, set by the e-sign completion webhook — a structured metadata
 * field, never the file itself). A manually uploaded pre-signed PDF has no
 * `esign` object at all and this resolves to false, its default (D-37).
 */
async function resolveWitnessedBySignature(
  service: ReturnType<typeof createServiceClient>,
  documentId: string | undefined
): Promise<boolean> {
  if (!documentId) return false

  const { data, error } = await service
    .from('vault_documents')
    .select('document_data')
    .eq('id', documentId)
    .maybeSingle()

  if (error || !data) return false

  const documentData = data.document_data as Record<string, unknown> | null
  const esign = (documentData?.esign ?? null) as Record<string, unknown> | null
  const completedAt = esign?.completedAt
  return typeof completedAt === 'string' && completedAt.length > 0
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const access = await requireWorkspaceAccess(supabase, user, workspaceId)
  const gated = requireWorkspaceRole(
    access,
    canManageRoster,
    'Only owners and admins can record agreement evidence.'
  )
  if (!gated.ok) return NextResponse.json({ error: gated.error }, { status: gated.status })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const parsed = RecordEvidenceSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid request.' },
      { status: 400 }
    )
  }

  const service = createServiceClient()

  const { data: relationship, error: relationshipError } = await service
    .from('workspace_roster_relationships')
    .select('id, workspace_id, member_user_id, state')
    .eq('id', parsed.data.relationshipId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  if (relationshipError) {
    return NextResponse.json({ error: relationshipError.message }, { status: 500 })
  }
  if (!relationship) {
    return NextResponse.json({ error: 'Roster relationship not found.' }, { status: 404 })
  }
  if (relationship.state !== 'accepted') {
    return NextResponse.json(
      { error: 'Agreement evidence can only be recorded for an accepted roster relationship.' },
      { status: 409 }
    )
  }

  const witnessedBySignature = await resolveWitnessedBySignature(service, parsed.data.documentId)

  const { data: inserted, error: insertError } = await service
    .from('workspace_agreement_evidence')
    .insert({
      relationship_id: parsed.data.relationshipId,
      document_id: parsed.data.documentId ?? null,
      declared_scope: parsed.data.declaredScope,
      declared_by: gated.userId,
      effective_from: parsed.data.effectiveFrom ?? null,
      expires_at: parsed.data.expiresAt ?? null,
      witnessed_by_signature: witnessedBySignature,
    })
    .select(
      'id, relationship_id, document_id, declared_scope, declared_by, effective_from, expires_at, witnessed_by_signature, uploaded_at, created_at'
    )
    .single()

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  await logWorkspaceAction(service, {
    workspaceId,
    actorId: gated.userId,
    subjectMemberId: relationship.member_user_id,
    action: 'workspace.roster.evidence_recorded',
    targetType: 'workspace_agreement_evidence',
    targetId: inserted.id,
    changes: { declaredScope: parsed.data.declaredScope },
  })

  return NextResponse.json({ data: inserted }, { status: 201 })
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const access = await requireWorkspaceAccess(supabase, user, workspaceId)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

  const relationshipId = new URL(request.url).searchParams.get('relationshipId')
  if (!relationshipId) {
    return NextResponse.json({ error: 'relationshipId query parameter is required.' }, { status: 400 })
  }

  // RLS-scoped client: migration 183's workspace_agreement_evidence_select
  // policy (routed through workspace_agreement_evidence_visible) is the
  // filter, not application code.
  const { data, error } = await supabase
    .from('workspace_agreement_evidence')
    .select(
      'id, relationship_id, declared_scope, declared_by, effective_from, expires_at, superseded_at, superseded_by, uploaded_at, witnessed_by_signature'
    )
    .eq('relationship_id', relationshipId)
    .order('uploaded_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  type EvidenceRow = {
    id: string
    relationship_id: string
    declared_scope: string | null
    declared_by: string
    effective_from: string | null
    expires_at: string | null
    superseded_at: string | null
    superseded_by: string | null
    uploaded_at: string
    witnessed_by_signature: boolean
  }

  // Speaks in observations, never a validity judgement (D-37) —
  // describeProvenance is the only vocabulary this GET returns.
  const provenance = ((data ?? []) as EvidenceRow[]).map((row) => ({
    id: row.id,
    relationshipId: row.relationship_id,
    supersededBy: row.superseded_by,
    ...describeProvenance({
      declaredScope: row.declared_scope,
      effectiveFrom: row.effective_from,
      expiresAt: row.expires_at,
      supersededAt: row.superseded_at,
      uploadedBy: row.declared_by,
      uploadedAt: row.uploaded_at,
      witnessedBySignature: row.witnessed_by_signature,
    }),
  }))

  return NextResponse.json({ data: provenance })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const access = await requireWorkspaceAccess(supabase, user, workspaceId)
  const gated = requireWorkspaceRole(
    access,
    canManageRoster,
    'Only owners and admins can supersede agreement evidence.'
  )
  if (!gated.ok) return NextResponse.json({ error: gated.error }, { status: gated.status })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const parsed = SupersedeEvidenceSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid request.' },
      { status: 400 }
    )
  }

  const service = createServiceClient()

  const { data: evidenceRow, error: evidenceError } = await service
    .from('workspace_agreement_evidence')
    .select('id, relationship_id, superseded_at')
    .eq('id', parsed.data.evidenceId)
    .maybeSingle()

  if (evidenceError) return NextResponse.json({ error: evidenceError.message }, { status: 500 })
  if (!evidenceRow) return NextResponse.json({ error: 'Agreement evidence not found.' }, { status: 404 })

  const { data: relationship, error: relationshipError } = await service
    .from('workspace_roster_relationships')
    .select('id, workspace_id, member_user_id')
    .eq('id', evidenceRow.relationship_id)
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  if (relationshipError) return NextResponse.json({ error: relationshipError.message }, { status: 500 })
  if (!relationship) return NextResponse.json({ error: 'Agreement evidence not found.' }, { status: 404 })

  if (evidenceRow.superseded_at) {
    return NextResponse.json({ error: 'This evidence has already been superseded.' }, { status: 400 })
  }

  // Supersede, never remove (D-46) — set superseded_at and, when supplied,
  // superseded_by. Nothing in this route issues a row-removal call.
  const { data: updated, error: updateError } = await service
    .from('workspace_agreement_evidence')
    .update({
      superseded_at: new Date().toISOString(),
      superseded_by: parsed.data.replacementId ?? null,
    })
    .eq('id', evidenceRow.id)
    .select('id, relationship_id, superseded_at, superseded_by')
    .single()

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  await logWorkspaceAction(service, {
    workspaceId,
    actorId: gated.userId,
    subjectMemberId: relationship.member_user_id,
    action: 'workspace.roster.evidence_superseded',
    targetType: 'workspace_agreement_evidence',
    targetId: evidenceRow.id,
    changes: { supersededBy: parsed.data.replacementId ?? null },
  })

  return NextResponse.json({ data: updated })
}
