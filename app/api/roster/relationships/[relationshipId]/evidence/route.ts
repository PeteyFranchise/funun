import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { requireMemberApiAccount } from '@/lib/accounts/member-api-gate'
import { logWorkspaceAction } from '@/lib/workspaces/audit'
import { isWorkspaceAccessEnabled } from '@/lib/workspaces/access-kill-switch'
import { describeProvenance } from '@/lib/workspaces/evidence'

// ─── /api/roster/relationships/[relationshipId]/evidence ──────────────────
// The MEMBER half of R-08's propose-then-confirm model (D-05, D-18, D-36,
// D-37, D-46, finding F8). A workspace may DRAFT agreement evidence through
// `app/api/workspaces/[workspaceId]/roster/evidence` — that is genuine admin
// help — but the draft confers nothing at any tier until the relationship's
// own named Member confirms it here. `isLiveQualifyingEvidence`
// (lib/workspaces/evidence.ts) refuses any row whose
// `confirmed_by_subject_at` is null, so an unconfirmed draft is inert no
// matter how complete its declared scope.
//
// Funūn NEVER opens, parses, extracts from or validates the referenced file
// at any point in this file — there is no file read, no document-parsing
// import, and no storage or signing helper here. The rights holder declares
// the scope of authority; the document is supporting evidence for that
// declaration, never something Funūn checks the declaration against (D-36).
// No response value in this route describes a stored document as reviewed,
// approved or verified — GET returns `describeProvenance`'s two neutral
// observation phrasings unchanged and introduces no third label (D-37).
//
// Deliberately OUTSIDE `/api/workspaces/**`, exactly like its sibling
// `app/api/roster/relationships/route.ts`: the Member must be able to act on
// a claim naming them without entering the claiming workspace's context. The
// ONLY gate here is `requireMemberApiAccount` plus a comparison of the
// loaded relationship's `member_user_id` to the authenticated user. There is
// no workspace-membership gate and no workspace role check of any kind — a
// workspace owner or admin who is not the named Member is refused with the
// same generic 403 as any other caller, so this route never discloses
// whether a given relationship id exists.
//
// NOTHING HERE EVER REMOVES A ROW. Withdrawing a confirmation nulls the two
// confirmation columns and leaves the evidence record, its declared scope
// and its provenance intact — D-46's rule that a billing or relationship
// event must never destroy rights evidence applies just as much to a change
// of mind about confirming one.

const EVIDENCE_COLUMNS =
  'id, relationship_id, document_id, declared_scope, declared_by, effective_from, expires_at, superseded_at, superseded_by, uploaded_at, witnessed_by_signature, confirmed_by_subject_at, confirmed_by_subject'

// One generic message for "no such relationship" and "this relationship does
// not name you" alike, so neither existence nor ownership leaks.
const RELATIONSHIP_NOT_YOURS = 'This roster relationship does not name you.'

const WORKSPACE_ACCESS_DISABLED = 'Workspace access is temporarily disabled.'

const PatchEvidenceSchema = z
  .object({
    evidenceId: z.string().uuid(),
    action: z.enum(['confirm', 'withdraw']),
  })
  .strict()

type EvidenceRow = {
  id: string
  relationship_id: string
  document_id: string | null
  declared_scope: string | null
  declared_by: string
  effective_from: string | null
  expires_at: string | null
  superseded_at: string | null
  superseded_by: string | null
  uploaded_at: string
  witnessed_by_signature: boolean
  confirmed_by_subject_at: string | null
  confirmed_by_subject: string | null
}

type RelationshipRow = {
  id: string
  workspace_id: string
  member_user_id: string
}

/**
 * The response shape both verbs return for one evidence row: the declared
 * scope, the provenance observation, the confirmation state, and the
 * document's IDENTIFIER only. No field here can carry the document's
 * contents, its storage path, or a signed URL (D-36, D-37).
 */
function presentEvidence(row: EvidenceRow) {
  return {
    id: row.id,
    relationshipId: row.relationship_id,
    documentId: row.document_id,
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
      confirmedBySubjectAt: row.confirmed_by_subject_at,
      documentId: row.document_id,
    }),
  }
}

/**
 * Loads the relationship named by the path segment and proves it names the
 * caller. Gate-then-service-client, the pattern
 * `app/api/roster/relationships/route.ts` already uses: the workspace-scoped
 * SELECT policies do not cover the named Member, so the read goes through
 * the service client only AFTER `requireMemberApiAccount` has proved the
 * caller's own identity, and the ownership comparison below is the
 * authorization.
 */
async function loadRelationshipForMember(
  service: ReturnType<typeof createServiceClient>,
  relationshipId: string,
  callerUserId: string
): Promise<
  { ok: true; relationship: RelationshipRow } | { ok: false; status: 403 | 500; error: string }
> {
  const { data, error } = await service
    .from('workspace_roster_relationships')
    .select('id, workspace_id, member_user_id')
    .eq('id', relationshipId)
    .maybeSingle()

  if (error) {
    return { ok: false, status: 500, error: 'Could not load this roster relationship.' }
  }

  const relationship = data as RelationshipRow | null
  if (!relationship || relationship.member_user_id !== callerUserId) {
    return { ok: false, status: 403, error: RELATIONSHIP_NOT_YOURS }
  }

  return { ok: true, relationship }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ relationshipId: string }> }
) {
  const { relationshipId } = await params
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const gate = await requireMemberApiAccount(supabase, user)
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const service = createServiceClient()

  // D-56/WS-31: this surface reads and writes workspace-derived authority
  // facts, so it stops with the platform-wide control. Unlike the Member's
  // refuse/block/end escape hatches on the sibling relationships route,
  // nothing here is a protective action a Member could be trapped without —
  // with the control off, no workspace-derived authority is usable at all.
  if (!(await isWorkspaceAccessEnabled(service))) {
    return NextResponse.json({ error: WORKSPACE_ACCESS_DISABLED }, { status: 503 })
  }

  const loaded = await loadRelationshipForMember(service, relationshipId, gate.user.id)
  if (!loaded.ok) return NextResponse.json({ error: loaded.error }, { status: loaded.status })

  const { data, error } = await service
    .from('workspace_agreement_evidence')
    .select(EVIDENCE_COLUMNS)
    .eq('relationship_id', relationshipId)
    .order('uploaded_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data: ((data ?? []) as EvidenceRow[]).map(presentEvidence) })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ relationshipId: string }> }
) {
  const { relationshipId } = await params
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const gate = await requireMemberApiAccount(supabase, user)
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const service = createServiceClient()

  if (!(await isWorkspaceAccessEnabled(service))) {
    return NextResponse.json({ error: WORKSPACE_ACCESS_DISABLED }, { status: 503 })
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const parsed = PatchEvidenceSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid request.' },
      { status: 400 }
    )
  }

  const loaded = await loadRelationshipForMember(service, relationshipId, gate.user.id)
  if (!loaded.ok) return NextResponse.json({ error: loaded.error }, { status: loaded.status })

  const { relationship } = loaded

  // Filtered by BOTH the evidence id AND the path relationship id: an
  // evidence row belonging to a different relationship — including one the
  // caller is also the Member of — can never be reached through this path.
  const { data: evidenceData, error: evidenceError } = await service
    .from('workspace_agreement_evidence')
    .select(EVIDENCE_COLUMNS)
    .eq('id', parsed.data.evidenceId)
    .eq('relationship_id', relationshipId)
    .maybeSingle()

  if (evidenceError) return NextResponse.json({ error: evidenceError.message }, { status: 500 })

  const evidence = evidenceData as EvidenceRow | null
  if (!evidence) {
    return NextResponse.json(
      { error: 'Agreement evidence not found for this roster relationship.' },
      { status: 404 }
    )
  }

  const alreadyConfirmed = Boolean(evidence.confirmed_by_subject_at)
  const confirming = parsed.data.action === 'confirm'

  // Confirming an already-confirmed row, or withdrawing from an already
  // unconfirmed one, is a success with nothing to do — not an error. No
  // write and no audit row is produced for a no-op.
  if (confirming === alreadyConfirmed) {
    return NextResponse.json({ data: presentEvidence(evidence) })
  }

  if (confirming && !evidence.document_id) {
    // Migration 191's CHECK enforces the same coupling in the database; this
    // is the readable message a caller gets instead of a constraint string.
    return NextResponse.json(
      { error: 'A document is required before this evidence can be confirmed.' },
      { status: 409 }
    )
  }

  const update = confirming
    ? { confirmed_by_subject_at: new Date().toISOString(), confirmed_by_subject: gate.user.id }
    : { confirmed_by_subject_at: null, confirmed_by_subject: null }

  const { data: updatedData, error: updateError } = await service
    .from('workspace_agreement_evidence')
    .update(update)
    .eq('id', evidence.id)
    .eq('relationship_id', relationshipId)
    .select(EVIDENCE_COLUMNS)
    .single()

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  // Both identities are the Member: they acted, and they are the subject
  // (D-50). `changes` carries the evidence id and the declared scope only —
  // never a document reference's contents, a file name, or an email.
  await logWorkspaceAction(service, {
    workspaceId: relationship.workspace_id,
    actorId: gate.user.id,
    subjectMemberId: gate.user.id,
    action: confirming ? 'workspace.evidence.confirmed' : 'workspace.evidence.confirmation_withdrawn',
    targetType: 'workspace_agreement_evidence',
    targetId: evidence.id,
    changes: { evidenceId: evidence.id, declaredScope: evidence.declared_scope },
  })

  return NextResponse.json({ data: presentEvidence(updatedData as EvidenceRow) })
}
