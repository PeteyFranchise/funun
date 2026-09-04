import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'
import { sanitizeCollaborator } from '@/lib/collaborators'
import { requireMemberApiAccount } from '@/lib/accounts/member-api-gate'

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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data, reused: false })
}
