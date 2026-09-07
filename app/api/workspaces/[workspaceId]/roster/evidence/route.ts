import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { requireWorkspaceAccess, requireWorkspaceRole } from '@/lib/workspaces/access'
import { logWorkspaceAction } from '@/lib/workspaces/audit'
import { canManageRoster } from '@/lib/workspaces/membership'
import { describeProvenance } from '@/lib/workspaces/evidence'
import {
  assertDateOrdering,
  optionalIsoDate,
  optionalIsoDateTime,
} from '@/lib/workspaces/date-schemas'

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
//
// ─── PROPOSE, NEVER ACTIVATE (R-08 / WSR-14, finding F8) ─────────────────
// This route previously let a workspace admin insert a row with a declared
// scope, no document and no acknowledgement from the Member it named, and
// that row became live authority-tier evidence the instant
// `resolveAuthorityTier` next ran. D-36 says the rights holder declares the
// scope; a workspace admin is not the rights holder. So POST here now
// DRAFTS only: `confirmed_by_subject_at` and `confirmed_by_subject` are
// written as null and are never writable from this route at all. The row
// confers nothing at any tier until the relationship's own named Member
// confirms it through `app/api/roster/relationships/[relationshipId]/evidence`
// — `isLiveQualifyingEvidence` (lib/workspaces/evidence.ts) refuses an
// unconfirmed or undocumented row.
//
// A `documentId` is MANDATORY here (WSR-14), and the referenced
// `vault_documents` row must be owned by the relationship's own
// `member_user_id` — see the ownership check in POST. Funūn still never
// opens or parses that file; the ownership comparison reads one column of
// structured metadata, nothing more (D-36, D-37).
//
// Date fields go through `lib/workspaces/date-schemas.ts` (R-14 / WSR-22)
// rather than a bare `z.string()`, because a malformed bound stored here is
// later compared with a date constructor, parses to NaN, and reads as "no
// constraint" — an authority window that never expires.

const RecordEvidenceSchema = z
  .object({
    relationshipId: z.string().uuid(),
    declaredScope: z.string().trim().min(1, 'A declared scope is required.'),
    documentId: z.string().uuid(),
    // effective_from is a DATE column and expires_at is a TIMESTAMPTZ
    // (migration 183) — the two schemas differ deliberately.
    effectiveFrom: optionalIsoDate,
    expiresAt: optionalIsoDateTime,
  })
  .strict()

const SupersedeEvidenceSchema = z
  .object({
    evidenceId: z.string().uuid(),
    replacementId: z.string().uuid().optional(),
  })
  .strict()

type DocumentFacts = {
  /** `vault_documents.user_id` — the document's owner. */
  ownerUserId: string
  witnessedBySignature: boolean
}

/**
 * Reads the two STRUCTURED METADATA facts POST needs about the referenced
 * `vault_documents` row, in a single lookup:
 *
 *  - `ownerUserId` (`user_id`) — compared against the relationship's
 *    `member_user_id` by the caller, so a workspace cannot point at someone
 *    else's document as evidence of authority over this Member (R-08).
 *  - `witnessedBySignature` — whether the row records a completed,
 *    Funūn-executed e-sign flow (its `document_data.esign.completedAt`
 *    timestamp, set by the e-sign completion webhook). A manually uploaded
 *    pre-signed PDF has no `esign` object at all and this resolves to
 *    false, its default (D-37).
 *
 * Neither fact involves opening, parsing, extracting from or validating the
 * file itself — there is no file read and no document-parsing import
 * anywhere in this route (D-36, D-37). Returns null when the row does not
 * exist or cannot be read; the caller must treat that identically to a
 * third-party-owned document so document existence is never disclosed.
 */
async function resolveDocumentFacts(
  service: ReturnType<typeof createServiceClient>,
  documentId: string
): Promise<DocumentFacts | null> {
  const { data, error } = await service
    .from('vault_documents')
    .select('user_id, document_data')
    .eq('id', documentId)
    .maybeSingle()

  if (error || !data) return null

  const documentData = data.document_data as Record<string, unknown> | null
  const esign = (documentData?.esign ?? null) as Record<string, unknown> | null
  const completedAt = esign?.completedAt

  return {
    ownerUserId: data.user_id as string,
    witnessedBySignature: typeof completedAt === 'string' && completedAt.length > 0,
  }
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

  // Ordering is checked before any database read, alongside the schema —
  // an inverted window is a malformed request, not a state conflict
  // (R-14 / WSR-22). The labels below are the request-body field names, so
  // the message names what the caller actually sent.
  const ordering = assertDateOrdering({
    start: parsed.data.effectiveFrom,
    end: parsed.data.expiresAt,
    startLabel: 'effectiveFrom',
    endLabel: 'expiresAt',
  })
  if (!ordering.ok) return NextResponse.json({ error: ordering.error }, { status: 400 })

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

  // R-08: a workspace must not be able to point at someone else's document
  // as evidence of authority over this Member. The referenced
  // `vault_documents` row has to be owned by the relationship's own
  // `member_user_id` — anything else is a workspace asserting authority
  // from a file its subject never produced.
  //
  // ONE generic message covers BOTH "no such document" and "not the
  // subject's document", so this route never becomes a document-id
  // enumeration oracle for a workspace probing ids it does not own.
  const documentFacts = await resolveDocumentFacts(service, parsed.data.documentId)
  if (!documentFacts || documentFacts.ownerUserId !== relationship.member_user_id) {
    return NextResponse.json(
      { error: 'That document cannot be used as evidence for this roster relationship.' },
      { status: 403 }
    )
  }

  // Both confirmation columns are written as null, always. This row is a
  // PROPOSAL: it confers nothing at any tier until the relationship's named
  // Member confirms it through
  // `app/api/roster/relationships/[relationshipId]/evidence` (R-08, F8).
  // Nothing on this workspace-side route can set either column.
  const { data: inserted, error: insertError } = await service
    .from('workspace_agreement_evidence')
    .insert({
      relationship_id: parsed.data.relationshipId,
      document_id: parsed.data.documentId,
      declared_scope: parsed.data.declaredScope,
      declared_by: gated.userId,
      effective_from: parsed.data.effectiveFrom ?? null,
      expires_at: parsed.data.expiresAt ?? null,
      witnessed_by_signature: documentFacts.witnessedBySignature,
      confirmed_by_subject_at: null,
      confirmed_by_subject: null,
    })
    .select(
      'id, relationship_id, document_id, declared_scope, declared_by, effective_from, expires_at, witnessed_by_signature, confirmed_by_subject_at, uploaded_at, created_at'
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

  // `isConfirmedBySubject` is a derived boolean, deliberately NOT the
  // `confirmed_by_subject` column (which holds the confirming identity, not
  // a flag). It is false on every response this route can produce.
  return NextResponse.json(
    {
      data: {
        ...inserted,
        isConfirmedBySubject: Boolean(inserted.confirmed_by_subject_at),
        confirmedBySubjectAt: inserted.confirmed_by_subject_at ?? null,
      },
    },
    { status: 201 }
  )
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
      'id, relationship_id, declared_scope, declared_by, effective_from, expires_at, superseded_at, superseded_by, uploaded_at, witnessed_by_signature, confirmed_by_subject_at'
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
    confirmed_by_subject_at: string | null
  }

  // Speaks in observations, never a validity judgement (D-37) —
  // describeProvenance is the only vocabulary this GET returns.
  //
  // The confirmation pair is added so a workspace can see WHICH of its
  // drafts are still awaiting the Member (R-08). It carries no document
  // contents and no third state label: `isConfirmedBySubject` is a plain
  // derived boolean sitting beside `stateLabel`, not a new value of it.
  const provenance = ((data ?? []) as EvidenceRow[]).map((row) => ({
    id: row.id,
    relationshipId: row.relationship_id,
    supersededBy: row.superseded_by,
    isConfirmedBySubject: Boolean(row.confirmed_by_subject_at),
    confirmedBySubjectAt: row.confirmed_by_subject_at ?? null,
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
