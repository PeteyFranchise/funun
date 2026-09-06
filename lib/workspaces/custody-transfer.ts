import type { SupabaseClient } from '@supabase/supabase-js'
import { canManageRoster } from '@/lib/workspaces/membership'
import type { WorkspaceRole } from '@/lib/workspaces/types'

// ─── Two-sided record custody transfer (D-28, D-29, D-43, custody D-02) ────
//
// THE D-28 CANONICAL RULE THIS MODULE EXISTS TO ENFORCE: `vault_projects.
// user_id` means RECORD CUSTODY — who holds and administers the record in
// Funūn — and NEVER rights ownership. Rights always live on separate
// evidenced records: composition rights on split sheets, master rights on
// version ownership records (custody D-02). A custody transfer therefore
// moves ADMINISTRATION, not title. `describeTransferEffect` below is the
// exact sentence that must be shown to both parties before either acts,
// naming what changes and, just as importantly, what does not.
//
// Custody MAY transfer, but only as a TWO-SIDED act (D-29): the current
// holder offers, the recipient accepts, and the diary — the transfer row
// itself, moved to its terminal `accepted` state in the same handler that
// writes `vault_projects.user_id` — records it permanently. Never
// unilateral. `isLegalTransferTransition` is the one place that legality is
// decided; `assertMayRespond` is the one place that authority to respond is
// decided. Neither function throws — both fail closed to a refusal.
//
// custody D-02's own rule, restated here because this module's entire
// reason for existing is to not violate it: "Version contributors,
// uploaders, owners, controllers and authorized users are separate concepts
// and must not be inferred from one another." A custody transfer changes
// who administers a `vault_projects` row. It creates no split-sheet party,
// no credit, no royalty entitlement, no version-ownership record, and no
// signature authority (D-28, D-43) — `describeTransferEffect`'s sentence
// says so explicitly, and the service route this module backs (`app/api/
// vault/custody-transfers/route.ts`) never touches any of those tables on
// its accept path.

// ─── Transfer state machine ─────────────────────────────────────────────
// offered -> accepted, declined, withdrawn   (the only three legal exits)
// accepted, declined, withdrawn are terminal — a renewed transfer is a new
// row, never a revival, mirroring D-25's never-move-never-copy posture and
// this same phase's roster-relationship state machine (lib/workspaces/
// roster.ts's LEGAL_ROSTER_EDGES).
export const CUSTODY_TRANSFER_STATE_VALUES = ['offered', 'accepted', 'declined', 'withdrawn'] as const
export type CustodyTransferState = (typeof CUSTODY_TRANSFER_STATE_VALUES)[number]

export const TRANSFER_LEGAL_EDGES: Record<CustodyTransferState, ReadonlySet<CustodyTransferState>> = {
  offered: new Set<CustodyTransferState>(['accepted', 'declined', 'withdrawn']),
  accepted: new Set<CustodyTransferState>(),
  declined: new Set<CustodyTransferState>(),
  withdrawn: new Set<CustodyTransferState>(),
}

const KNOWN_TRANSFER_STATES: ReadonlySet<string> = new Set(CUSTODY_TRANSFER_STATE_VALUES)

function isKnownTransferState(value: string): value is CustodyTransferState {
  return KNOWN_TRANSFER_STATES.has(value)
}

/**
 * True only when moving from `from` to `to` is a legal custody-transfer
 * transition. Fails closed (false) on any unknown state value, on a
 * same-state self-transition, and on any move OUT of a terminal state
 * (`accepted`, `declined`, `withdrawn` each have an empty edge set).
 */
export function isLegalTransferTransition(from: CustodyTransferState, to: CustodyTransferState): boolean {
  if (!isKnownTransferState(from) || !isKnownTransferState(to)) return false
  if (from === to) return false
  return TRANSFER_LEGAL_EDGES[from].has(to)
}

// ─── Offer authority (D-29, T-38-13-01) ─────────────────────────────────
export type AssertMayOfferResult =
  | { ok: true; custodianId: string }
  | { ok: false; status: 403 | 404 | 500; reason: string }

type ProjectCustodyRow = { id: string; user_id: string }
type WorkspaceMembershipRow = { role: string; status: string }
type WorkspaceAttachmentRow = { id: string }

/**
 * Permits exactly two kinds of offerer, mirroring migration 185's
 * `guard_custody_transfer_offered_by_holder` BEFORE INSERT trigger — this
 * function is the SECOND enforcement point, not the only one (T-38-13-01):
 * (1) the project's current custodian, offering directly; or (2) an
 * active owner/admin of a workspace that holds a LIVE attachment to the
 * project. Refuses everyone else, and refuses (rather than throws) on any
 * lookup error.
 */
export async function assertMayOffer(
  supabase: SupabaseClient,
  args: { projectId: string; offeredByUserId: string; workspaceId: string | null }
): Promise<AssertMayOfferResult> {
  const { data: project, error: projectError } = await supabase
    .from('vault_projects')
    .select('id, user_id')
    .eq('id', args.projectId)
    .maybeSingle()

  if (projectError) {
    return { ok: false, status: 500, reason: 'Could not verify record custody.' }
  }
  if (!project) {
    return { ok: false, status: 404, reason: 'Project not found.' }
  }

  const custodianId = (project as ProjectCustodyRow).user_id

  if (args.offeredByUserId === custodianId) {
    return { ok: true, custodianId }
  }

  if (!args.workspaceId) {
    return {
      ok: false,
      status: 403,
      reason:
        "Only the record's current custodian may offer a custody transfer outside a workspace context — custody transfer is two-sided, never unilateral (D-29).",
    }
  }

  const [{ data: membership, error: membershipError }, { data: attachment, error: attachmentError }] =
    await Promise.all([
      supabase
        .from('workspace_members')
        .select('role, status')
        .eq('workspace_id', args.workspaceId)
        .eq('user_id', args.offeredByUserId)
        .maybeSingle(),
      supabase
        .from('workspace_attachments')
        .select('id')
        .eq('workspace_id', args.workspaceId)
        .eq('project_id', args.projectId)
        .is('detached_at', null)
        .maybeSingle(),
    ])

  if (membershipError || attachmentError) {
    return { ok: false, status: 500, reason: 'Could not verify workspace authority over this record.' }
  }

  const membershipRow = membership as WorkspaceMembershipRow | null
  const hasAuthorityRole =
    !!membershipRow && membershipRow.status === 'active' && canManageRoster(membershipRow.role as WorkspaceRole)
  const hasLiveAttachment = !!(attachment as WorkspaceAttachmentRow | null)

  if (hasAuthorityRole && hasLiveAttachment) {
    return { ok: true, custodianId }
  }

  return {
    ok: false,
    status: 403,
    reason:
      "Only the record's current custodian, or an owner/admin of a workspace with a live attachment to this project, may offer a custody transfer.",
  }
}

// ─── Response authority (D-29) ──────────────────────────────────────────
export type TransferParties = { fromUserId: string; toUserId: string; offeredBy: string }
export type TransferResponseAction = 'accept' | 'decline' | 'withdraw'

export type AssertMayRespondResult = { ok: true } | { ok: false; status: 403; reason: string }

/**
 * Pure — no I/O. Permits only the offer's `to_user_id` to accept or
 * decline, and only `offered_by` or `from_user_id` to withdraw. A recipient
 * can never withdraw an offer made TO them (only decline it); the party
 * that put the offer forward — the holder or the workspace admin who acted
 * for them — is the only one who can retract it before the recipient acts.
 */
export function assertMayRespond(args: {
  parties: TransferParties
  actorUserId: string
  action: TransferResponseAction
}): AssertMayRespondResult {
  const { parties, actorUserId, action } = args

  if (action === 'accept' || action === 'decline') {
    if (actorUserId !== parties.toUserId) {
      return {
        ok: false,
        status: 403,
        reason: `Only the offer's recipient may ${action} a custody transfer.`,
      }
    }
    return { ok: true }
  }

  // action === 'withdraw'
  if (actorUserId !== parties.offeredBy && actorUserId !== parties.fromUserId) {
    return {
      ok: false,
      status: 403,
      reason: 'Only the party who offered this transfer, or the record’s current custodian, may withdraw it.',
    }
  }
  return { ok: true }
}

// ─── The copy shown to both parties before either acts (D-28) ──────────
/**
 * Names exactly what accepting a custody transfer changes — who holds and
 * administers the record — and explicitly states what it does not change:
 * authorship, ownership, credit, royalty entitlement, and signature
 * authority. Never throws; takes no arguments because the sentence is the
 * same regardless of which project or parties are involved (the specific
 * names are supplied by the UI around this copy, not inside it).
 */
export function describeTransferEffect(): string {
  return (
    'Accepting this transfer changes who holds and administers this record in Funūn. ' +
    'It does not change authorship, ownership, credit, royalty entitlement, or signature ' +
    'authority — those live separately, on split sheets and version ownership records.'
  )
}
