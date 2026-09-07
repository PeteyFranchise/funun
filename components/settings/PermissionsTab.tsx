'use client'

import { useState } from 'react'
import type { WorkspaceConsentGroup } from '@/app/api/settings/permissions/route'
import {
  AUTHORITY_TIER_TAG,
  STRUCTURAL_EXCLUSION_FOOTNOTE,
  describePermissionForMember,
} from '@/lib/workspaces/permission-copy'
import type { WorkspacePermission } from '@/lib/workspaces/permissions'

// ─── The Member's consent surface (WSR-27, R-18) ──────────────────────────
//
// THERE IS NO BULK CONTROL ON THIS SCREEN AND THERE MUST NEVER BE ONE. Not
// a select-all, not an approve-all, not a preset. That is structural, not
// aesthetic: three permissions in the catalogue are bundle-excluded by D-40
// precisely so nobody can ever hand them over without being asked about
// each one by name, and a single control acting on more than one row is all
// it would take to undo that. Every row below owns its own decision, its own
// request and its own state. The paired test counts Approve controls against
// rows, so an edit that adds a bulk control fails the suite rather than
// shipping (T-38.0.1-13-01).
//
// THIS COMPONENT IS NOT A SECURITY BOUNDARY and nothing here relies on it
// being one. Every decision is re-derived server-side by the consent route
// and by migration 194's helper; the worst this file can do is confuse
// somebody. That is the reason for the two rules it does enforce: the copy
// rule and the honesty rule.
//
// THE COPY RULE. No slug and no ops-facing label is rendered anywhere. Every
// sentence comes from `describePermissionForMember`, and not one of the
// nineteen is written out in this file — a permission reworded at the point
// of consent is a different question than the one that was reviewed
// (T-38.0.1-13-02).
//
// THE HONESTY RULE. A row resolves to "Approved" only after the server said
// so. A failure leaves the row exactly as it was, with both buttons still
// live and the server's own refusal printed beside them, because a Member
// told an approval happened when it did not has been told something untrue
// (T-38.0.1-13-05).
//
// PROPS ARE PLAIN DATA. The server page hands this component two arrays of
// serialisable groups and nothing else — no callback, no Supabase client, no
// Date. See the page's own comment for the production-only failure that rule
// exists to prevent.
//
// DECLINE IS NOT REVOKE. Declining a pending ask writes no grant and takes
// nothing away, so it gets no confirm step and never wears the destructive
// colour. Revoking removes access somebody is already relying on, so it gets
// the two-step inline confirm and the rose family. Collapsing the two would
// misstate what the Member just did.

// ─── The one route this component writes through ──────────────────────────
// Approve, decline and revoke all go here. There is deliberately no second
// mutation path: the Member-identity check lives in one place, and a client
// that could reach a workspace-scoped endpoint would be reaching around it
// (T-38.0.1-13-06).
const CONSENT_ROUTE_BASE = '/api/roster/relationships'

export function consentEndpoint(relationshipId: string): string {
  return `${CONSENT_ROUTE_BASE}/${relationshipId}/consent`
}

// ─── Copy owned by this surface, not by the permission catalogue ──────────
// Page chrome and section copy from the UI-SPEC's Copywriting Contract. The
// permission sentences themselves are never here — they come from
// `describePermissionForMember` and live in exactly one file.
const PENDING_HEADING = 'Pending requests'
const ACTIVE_HEADING = 'Active permissions'
const EMPTY_HEADING = 'No workspace has asked for access yet.'
const EMPTY_BODY =
  "When a team or label wants to work on your catalogue, you'll see exactly what they're asking for here — and nothing happens until you say yes."
const UNNAMED_WORKSPACE = 'A workspace'
const UNNAMED_WORKSPACE_POSSESSIVE = 'this workspace'

// ─── Types ────────────────────────────────────────────────────────────────
/** One card's worth of data, exactly as the read endpoint emits it. */
export type PermissionsGroup = WorkspaceConsentGroup

export type RowAction = 'approve' | 'decline' | 'revoke'

export type MutationResult = { ok: true } | { ok: false; error: string }

/**
 * One row's state, and only that row's. Keyed per relationship AND
 * permission so a decision on one row can never move, disable or resolve a
 * sibling.
 *
 * `revoked` is what a removed row becomes: the row disappears from the list
 * immediately, which is the confirmation — the UI-SPEC's inline-swap
 * convention, no toast.
 */
export type RowStatus =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'approved' }
  | { kind: 'declined' }
  | { kind: 'confirming-revoke' }
  | { kind: 'revoked' }
  | { kind: 'error'; message: string }

// ─── Pure helpers ─────────────────────────────────────────────────────────
export function rowKey(relationshipId: string, permission: WorkspacePermission): string {
  return `${relationshipId}:${permission}`
}

export function workspaceHeading(workspaceName: string | null): string {
  return `${workspaceName ?? UNNAMED_WORKSPACE} wants access`
}

/** Lowercases the first character only — the rest of the sentence keeps its
 * own capitalisation (proper nouns, "IPI", "SoundExchange"). */
export function lowercaseFirst(sentence: string): string {
  if (sentence.length === 0) return sentence
  return sentence.charAt(0).toLowerCase() + sentence.slice(1)
}

export function revokeConfirmCopy(workspaceName: string | null, permissionCopy: string): string {
  const who = workspaceName ?? UNNAMED_WORKSPACE_POSSESSIVE
  return `Remove ${who}'s access to ${lowercaseFirst(permissionCopy)}? They'll lose it immediately.`
}

/**
 * Formats the relationship's accepted date in UTC, deliberately: this
 * component renders once on the server and again on the client, and a
 * locale- or timezone-dependent format would disagree between the two.
 * Returns null rather than "Invalid Date" for anything unparseable.
 */
export function formatRelationshipDate(iso: string | null): string | null {
  if (!iso) return null
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return null

  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(parsed)
}

/**
 * What a row becomes once the server has answered. A failure never resolves
 * a row — it returns it to a state where both decisions are still open, with
 * the refusal shown.
 */
export function resolveRowStatus(action: RowAction, result: MutationResult): RowStatus {
  if (!result.ok) return { kind: 'error', message: result.error }
  if (action === 'approve') return { kind: 'approved' }
  if (action === 'decline') return { kind: 'declined' }
  return { kind: 'revoked' }
}

/**
 * Sends ONE permission, for ONE relationship, in ONE request.
 *
 * The endpoint's `permissions` array would accept more, and this component
 * never puts more in it. That is the whole point of the surface: batching
 * here would reintroduce the bulk grant the layout is built to make
 * impossible, just below the buttons instead of above them.
 *
 * `projectId` is never sent. A revoke refuses the key outright, and a
 * relationship-wide consent is the only scope this surface can represent
 * honestly (the read endpoint omits project-scoped asks for the same
 * reason).
 *
 * `fetchImpl` is injected so the request shape is assertable under jest's
 * node environment, where no click can be simulated. It is not a prop and
 * never crosses the server/client boundary.
 */
export async function submitRowDecision(
  args: { relationshipId: string; permission: WorkspacePermission; action: RowAction },
  fetchImpl: typeof fetch = fetch
): Promise<MutationResult> {
  const revoking = args.action === 'revoke'
  const body: Record<string, unknown> = { permissions: [args.permission] }
  if (!revoking) body.decision = args.action === 'approve' ? 'approved' : 'declined'

  let response: Response
  try {
    response = await fetchImpl(consentEndpoint(args.relationshipId), {
      method: revoking ? 'DELETE' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    return { ok: false, error: 'Could not reach the server. Check your connection and try again.' }
  }

  const json = (await response.json().catch(() => ({}))) as { error?: string }
  if (!response.ok) {
    return { ok: false, error: json.error ?? 'That did not go through. Try again.' }
  }

  return { ok: true }
}

// ─── Shared classes ───────────────────────────────────────────────────────
const CARD_CLASS = 'rounded-card border border-hair bg-card p-6'
const TAG_BASE = 'rounded-full border px-2 py-0.5 text-[11px] font-medium'
const AUTHORITY_TAG_CLASS = `${TAG_BASE} border-brandindigo/30 bg-brandindigo/10 text-brandindigo`
const SENSITIVE_TAG_CLASS = `${TAG_BASE} border-money/30 bg-money/10 text-money2`
const ERROR_CLASS = 'mt-1 text-xs text-rose-300'

/** Picks a tag's colour from the tag itself, so the two tag strings still
 * have exactly one home. */
export function tagClass(tag: string): string {
  return tag === AUTHORITY_TIER_TAG ? AUTHORITY_TAG_CLASS : SENSITIVE_TAG_CLASS
}

// ─── Row action cells ─────────────────────────────────────────────────────
/**
 * The two decisions on a pending row, or the label they resolved to.
 *
 * The brand gradient appears here and nowhere else on this surface: the
 * Member's affirmative act of granting authority is the one thing on the
 * page that earns the accent. Decline is a plain text button — it removes
 * nothing, so it is not destructive and does not wear the rose family.
 */
export function PendingRowActions({
  status,
  onApprove,
  onDecline,
}: {
  status: RowStatus
  onApprove: () => void
  onDecline: () => void
}) {
  if (status.kind === 'approved') {
    return <span className="text-sm font-medium text-emerald-300">Approved</span>
  }
  if (status.kind === 'declined') {
    return <span className="text-sm font-medium text-white/40">Declined</span>
  }

  const submitting = status.kind === 'submitting'

  return (
    <div className="flex flex-col items-end">
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={submitting}
          onClick={onApprove}
          className="rounded-lg bg-grad px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          Approve
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={onDecline}
          className="px-3 py-2 text-sm font-medium text-white/50 transition hover:text-white/80 disabled:opacity-40"
        >
          Decline
        </button>
      </div>
      {status.kind === 'error' && <p className={ERROR_CLASS}>{status.message}</p>}
    </div>
  )
}

/**
 * The revoke control and its two-step inline confirm, matching
 * `CollaboratorForm`'s delete-confirm exactly: no modal, the confirm swaps
 * in place of this one row, and cancelling puts the row back untouched.
 */
export function ActiveRowActions({
  status,
  confirmCopy,
  onAskToRemove,
  onConfirmRemove,
  onCancelRemove,
}: {
  status: RowStatus
  confirmCopy: string
  onAskToRemove: () => void
  onConfirmRemove: () => void
  onCancelRemove: () => void
}) {
  if (status.kind === 'confirming-revoke' || status.kind === 'submitting') {
    const submitting = status.kind === 'submitting'
    return (
      <div className="flex flex-col items-end gap-2">
        <span className="text-sm text-white/60">{confirmCopy}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={submitting}
            onClick={onConfirmRemove}
            className="rounded-lg bg-rose-500/90 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-40"
          >
            {submitting ? 'Removing…' : 'Yes, remove'}
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={onCancelRemove}
            className="text-sm text-white/50 transition hover:text-white disabled:opacity-40"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-end">
      <button
        type="button"
        onClick={onAskToRemove}
        className="text-sm font-medium text-white/50 transition hover:text-rose-300"
      >
        Remove access
      </button>
      {status.kind === 'error' && <p className={ERROR_CLASS}>{status.message}</p>}
    </div>
  )
}

// ─── The surface ──────────────────────────────────────────────────────────
export function PermissionsTab({
  pending,
  active,
}: {
  pending: PermissionsGroup[]
  active: PermissionsGroup[]
}) {
  const [statuses, setStatuses] = useState<Record<string, RowStatus>>({})

  function statusFor(relationshipId: string, permission: WorkspacePermission): RowStatus {
    return statuses[rowKey(relationshipId, permission)] ?? { kind: 'idle' }
  }

  function setStatus(
    relationshipId: string,
    permission: WorkspacePermission,
    status: RowStatus
  ) {
    setStatuses(previous => ({ ...previous, [rowKey(relationshipId, permission)]: status }))
  }

  /**
   * One row, one request. Deliberately does NOT call `router.refresh()` on
   * success: the row already shows what it resolved to, and re-reading the
   * server payload underneath a live status map is how an approved row's
   * state would land on a different row later in the same session. Approved
   * permissions move into "Active permissions" on the next load, which is
   * what the UI-SPEC describes.
   */
  function act(relationshipId: string, permission: WorkspacePermission, action: RowAction) {
    setStatus(relationshipId, permission, { kind: 'submitting' })
    void (async () => {
      const result = await submitRowDecision({ relationshipId, permission, action })
      setStatus(relationshipId, permission, resolveRowStatus(action, result))
    })()
  }

  const hasPending = pending.length > 0
  const hasActive = active.length > 0

  // The page heading and subhead belong to the server page, which owns the
  // static chrome; everything below this point is the part that needs state.
  return (
    <div>
      {!hasPending && !hasActive && (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-[15px] font-semibold text-white/60">{EMPTY_HEADING}</p>
          <p className="max-w-md text-[13px] text-lavdim">{EMPTY_BODY}</p>
        </div>
      )}

      {hasPending && (
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-white/40">
            {PENDING_HEADING}
          </h3>
          <div className="mt-4 flex flex-col gap-6">
            {pending.map(group => (
              <article key={`pending-${group.relationshipId}`} className={CARD_CLASS}>
                <GroupHeader heading={workspaceHeading(group.workspaceName)} group={group} />
                <ul className="mt-4 flex flex-col gap-4">
                  {group.permissions.map(row => {
                    const described = describePermissionForMember(row.permission)
                    const status = statusFor(group.relationshipId, row.permission)

                    return (
                      <li
                        key={rowKey(group.relationshipId, row.permission)}
                        className="flex items-start justify-between gap-4"
                      >
                        <PermissionLabel copy={described.copy} tags={described.tags} />
                        <PendingRowActions
                          status={status}
                          onApprove={() =>
                            act(group.relationshipId, row.permission, 'approve')
                          }
                          onDecline={() =>
                            act(group.relationshipId, row.permission, 'decline')
                          }
                        />
                      </li>
                    )
                  })}
                </ul>
              </article>
            ))}
          </div>
        </section>
      )}

      {hasActive && (
        <section className="mt-8">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-white/40">
            {ACTIVE_HEADING}
          </h3>
          <div className="mt-4 flex flex-col gap-6">
            {active.map(group => {
              // A card whose every row has been revoked in this session has
              // nothing left to show, and an empty card is never rendered.
              const rows = group.permissions.filter(
                row => statusFor(group.relationshipId, row.permission).kind !== 'revoked'
              )
              if (rows.length === 0) return null

              return (
                <article key={`active-${group.relationshipId}`} className={CARD_CLASS}>
                  <GroupHeader heading={group.workspaceName ?? UNNAMED_WORKSPACE} group={group} />
                  <ul className="mt-4 flex flex-col gap-4">
                    {rows.map(row => {
                      const described = describePermissionForMember(row.permission)
                      const status = statusFor(group.relationshipId, row.permission)

                      return (
                        <li
                          key={rowKey(group.relationshipId, row.permission)}
                          className="flex items-start justify-between gap-4"
                        >
                          <PermissionLabel copy={described.copy} tags={described.tags} />
                          <ActiveRowActions
                            status={status}
                            confirmCopy={revokeConfirmCopy(group.workspaceName, described.copy)}
                            onAskToRemove={() =>
                              setStatus(group.relationshipId, row.permission, {
                                kind: 'confirming-revoke',
                              })
                            }
                            onConfirmRemove={() =>
                              act(group.relationshipId, row.permission, 'revoke')
                            }
                            onCancelRemove={() =>
                              setStatus(group.relationshipId, row.permission, { kind: 'idle' })
                            }
                          />
                        </li>
                      )
                    })}
                  </ul>
                </article>
              )
            })}
          </div>
        </section>
      )}

      {/* Once, at the very bottom, muted. Stating an absence nobody asked
          about on every card would be noise rather than reassurance. */}
      <p className="mt-10 text-xs text-white/30">{STRUCTURAL_EXCLUSION_FOOTNOTE}</p>
    </div>
  )
}

function GroupHeader({ heading, group }: { heading: string; group: PermissionsGroup }) {
  const since = formatRelationshipDate(group.relationshipAcceptedAt)

  return (
    <div>
      <h4 className="text-lg font-semibold text-white">{heading}</h4>
      {since && (
        <p className="mt-1 text-xs font-medium text-white/40">Roster relationship since {since}</p>
      )}
    </div>
  )
}

function PermissionLabel({ copy, tags }: { copy: string; tags: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="text-sm text-white">{copy}</p>
      {tags.map(tag => (
        <span key={tag} className={tagClass(tag)}>
          {tag}
        </span>
      ))}
    </div>
  )
}
