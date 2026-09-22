import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { sanitizeCollaborator } from '@/lib/collaborators'
import { requireMemberApiAccount } from '@/lib/accounts/member-api-gate'
import {
  mustBlockActionForEmail,
  BLOCKED_ACTION_ERROR,
  BLOCKED_ACTION_STATUS,
} from '@/lib/trust-safety/block-check'

// ─── GET /api/collaborators ───────────────────────────────────
// Returns the authenticated user's full collaborator roster,
// ordered alphabetically by name.
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
  return NextResponse.json({ data })
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
