import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/server'
import { resolveSelectsByToken } from '@/lib/selects/public-resolve'
import { isLegalSelectsTransition } from '@/lib/selects/stage-machine'
import type { SelectsStatus } from '@/lib/selects/types'

// ─── POST /api/selects/[token]/respond — Approve / Request changes ────────
// Public, token-gated, NO login required (must_haves truth — Approve/
// Request changes are open to everyone, same as play/keep/pass). Resolves
// the Selects ONLY via share_token (resolveSelectsByToken), then gates the
// status move through isLegalSelectsTransition — the SAME state-machine
// authority app/api/admin/selects/[id]/send/route.ts uses for the AE side,
// so an illegal move (e.g. an already-'approved' Selects re-approved, or a
// 'draft' — which resolveSelectsByToken already makes unreachable) is
// rejected identically regardless of which side of the flow moved it.
const RespondBodySchema = z
  .object({
    action: z.enum(['approve', 'request_changes']),
    reason: z.union([z.string().trim().max(2000, 'reason is too long'), z.null()]).optional(),
  })
  .strict()

const TARGET_STATUS: Record<'approve' | 'request_changes', SelectsStatus> = {
  approve: 'approved',
  request_changes: 'changes_requested',
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const service = createServiceClient()

  const selects = await resolveSelectsByToken(service, token)
  if (!selects) {
    return NextResponse.json({ error: "This link isn't live." }, { status: 404 })
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const parsed = RespondBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request.' }, { status: 400 })
  }

  const target = TARGET_STATUS[parsed.data.action]
  if (!isLegalSelectsTransition(selects.status, target)) {
    return NextResponse.json({ error: 'This Selects can’t take that action right now.' }, { status: 400 })
  }

  // Compare-and-swap: only move if the row is STILL the status we validated the
  // transition against. Without the status guard, two concurrent responses (an
  // approve and a request-changes) both pass isLegalSelectsTransition from the
  // same read 'sent' and last-write-wins nondeterministically (audit #10).
  const { data, error } = await service
    .from('selects')
    .update({ status: target })
    .eq('id', selects.id)
    .eq('status', selects.status)
    .select('id, status')
    .maybeSingle()
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    // 0 rows updated = the status changed under us (a concurrent response, or the
    // AE moved it). Fail closed with a retryable conflict instead of clobbering.
    return NextResponse.json(
      { error: 'This Selects was just updated — refresh and try again.' },
      { status: 409 }
    )
  }

  // Best-effort, isolated from the primary status write above (migration
  // 113 — the changes_requested_reason column — is HUMAN-GATED and may not
  // be pushed live yet; a missing-column error here must never roll back
  // or fail the status transition that already succeeded, see CLAUDE.md's
  // "best-effort error recovery" convention).
  if (parsed.data.action === 'request_changes' && parsed.data.reason) {
    try {
      await service.from('selects').update({ changes_requested_reason: parsed.data.reason }).eq('id', selects.id)
    } catch {
      // Swallowed intentionally — the status move above is the contract.
    }
  }

  return NextResponse.json({ data })
}
