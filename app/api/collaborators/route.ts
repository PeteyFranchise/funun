import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { sanitizeCollaborator } from '@/lib/collaborators'
import type { CollaboratorProfile } from '@/lib/collaborators'
import { resolveCollaboratorIdentityHints } from '@/lib/collaborators/identity-hints.server'
import { requireMemberApiAccount } from '@/lib/accounts/member-api-gate'
import {
  mustBlockActionForEmail,
  BLOCKED_ACTION_ERROR,
  BLOCKED_ACTION_STATUS,
} from '@/lib/trust-safety/block-check'

// ─── GET /api/collaborators ───────────────────────────────────
// Returns the authenticated user's full collaborator roster,
// ordered alphabetically by name, plus the viewer-scoped identity hints the
// pickers need to tell two same-named collaborators apart.
//
// `identityHints` is an ADDITIVE top-level field keyed by collaborator ROW id:
// every existing consumer reads `json.data` and is unaffected. It carries the
// member's public @handle and nothing else — never an email, legal name,
// phone, address, PRO, IPI, publisher, MLC/SoundExchange id, or internal UUID
// (Phase 41 D-10/D-22) — and only for rows whose handle this viewer is allowed
// to see (lib/collaborators/identity-hints.server.ts).
//
// The resolver never throws: when profile/connection/block resolution fails it
// returns NO hints and the roster still renders. Chosen over failing the whole
// request so an unreadable `blocks` table degrades to "no handles" rather than
// an empty picker — and because one uniform empty-hint outcome cannot be read
// as "this person blocked you".
export async function GET() {
  const supabase = await createApiClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  const member = await requireMemberApiAccount(supabase, authUser)
  if (!member.ok) return NextResponse.json({ error: member.error }, { status: member.status })
  const { user } = member

  const { data, error } = await supabase
    .from('collaborators')
    .select('*')
    .eq('user_id', user.id)
    .is('archived_at', null)
    .order('name', { ascending: true })

  if (error) return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })

  const identityHints = await resolveCollaboratorIdentityHints(
    supabase,
    createServiceClient(),
    user.id,
    (data ?? []) as CollaboratorProfile[]
  )

  return NextResponse.json({ data, identityHints })
}

// ─── POST /api/collaborators ──────────────────────────────────
// Creates a new collaborator in the user's global roster.
// Body fields are validated through the COLLABORATOR_EDITABLE_FIELDS
// allowlist — unknown keys are silently dropped (T-01-02).
export async function POST(request: Request) {
  const supabase = await createApiClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  const member = await requireMemberApiAccount(supabase, authUser)
  if (!member.ok) return NextResponse.json({ error: member.error }, { status: member.status })
  const { user } = member

  const body = (await request.json()) as Record<string, unknown>
  const update = sanitizeCollaborator(body)
  if (!update.name) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  // A collaborator is a reusable identity, not a new card per workflow.
  // Match only within the authenticated user's roster and only by normalized
  // email; names are not unique enough to establish identity.
  if (typeof update.email === 'string') {
    const email = update.email.trim().toLowerCase()
    update.email = email

    // Block gate — BEFORE the lookup and the insert. This route carries no
    // `alreadyMember` flag, which is exactly what makes its disclosure easy
    // to miss: the insert below uses `.select()`, and migration 179's
    // BEFORE INSERT trigger has already set claimed_by from this email with
    // no block predicate, so the returned row confirms a blocked member's
    // Funūn account to the person they blocked. Checking first means no row
    // is ever created. Same generic, block-state-agnostic error as
    // follows/connections/endorsements/wall/release-comments (13-03).
    if (await mustBlockActionForEmail(createServiceClient(), user.id, email)) {
      return NextResponse.json({ error: BLOCKED_ACTION_ERROR }, { status: BLOCKED_ACTION_STATUS })
    }

    const { data: existing, error: lookupError } = await supabase
      .from('collaborators')
      .select('*')
      .eq('user_id', user.id)
      .ilike('email', email)
      .is('archived_at', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    // A failed lookup is not evidence that no collaborator exists. Refuse to
    // insert rather than manufacture a duplicate card from an unknown state.
    if (lookupError) {
      return NextResponse.json({ error: 'Could not check the existing roster' }, { status: 500 })
    }
    if (existing) {
      return NextResponse.json({ data: existing, reused: true })
    }
  }

  const { data, error } = await supabase
    .from('collaborators')
    .insert({ ...update, user_id: user.id })
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
  return NextResponse.json({ data, reused: false })
}
