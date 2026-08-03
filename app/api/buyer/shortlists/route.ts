import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { authorizeRequestTarget } from '@/lib/deals/request-target'
import { loadShortlistEntries } from '@/lib/deals/shortlists'

// ─── Org-shared shortlists (D-14c, T-16-19) ────────────────────────────────
// Both requester and approver may save/remove (D-14c: a scout saves, an
// approver reviews) — no role gate beyond org membership. org_id is ALWAYS
// derived from the caller's own buyer_members row, never the request body,
// so a member cannot write into another company's shortlist (T-16-19).
// Writes go through the service-role client after the membership check,
// since buyer_shortlists revokes client writes (migration 083). Shortlists
// are invisible to artists: no notification, no artist-facing surface, no
// write path from this feature into any artist-visible table.
//
// The read/re-evaluation logic lives in lib/deals/shortlists.ts's
// loadShortlistEntries (a Next.js route module may only export HTTP method
// handlers plus a small route-config set, so it cannot live here) — GET
// below and the shortlists page (16-05 Task 3) import the exact same
// function, so the "re-evaluate rights-readiness at render time" rule
// (D-14c) never drifts between the two surfaces.

export const dynamic = 'force-dynamic'

type MemberRow = { org_id: string; buyer_role: string }

async function resolveMember(supabase: SupabaseClient, userId: string): Promise<MemberRow | null> {
  const { data } = await supabase
    .from('buyer_members')
    .select('org_id, buyer_role')
    .eq('user_id', userId)
    .maybeSingle()
  return (data as MemberRow | null) ?? null
}

export async function GET() {
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const member = await resolveMember(supabase, user.id)
  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const service = createServiceClient()
  const entries = await loadShortlistEntries(service, member.org_id)
  return NextResponse.json({ data: entries })
}

export async function POST(request: Request) {
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const member = await resolveMember(supabase, user.id)
  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = (await request.json().catch(() => null)) as { vault_project_id?: unknown } | null
  const vaultProjectId = typeof body?.vault_project_id === 'string' ? body.vault_project_id : null
  if (!vaultProjectId) {
    return NextResponse.json({ error: 'vault_project_id is required.' }, { status: 400 })
  }

  const service = createServiceClient()

  // Re-run the SAME rights-ready + Phase 13 visibility + block gate the
  // catalog route applies — a buyer cannot shortlist a project they could
  // not legitimately browse (the "admin-curated placement promotes a
  // target that later becomes private" abuse case, 16-VALIDATION).
  const target = await authorizeRequestTarget(service, user.id, vaultProjectId)
  if (!target.ok) {
    return NextResponse.json({ error: 'This project is not available to shortlist.' }, { status: 404 })
  }

  const { error } = await service
    .from('buyer_shortlists')
    .upsert(
      { org_id: member.org_id, vault_project_id: vaultProjectId, created_by: user.id },
      { onConflict: 'org_id,vault_project_id', ignoreDuplicates: true }
    )

  if (error) {
    return NextResponse.json({ error: 'Failed to save — please try again.' }, { status: 500 })
  }

  return NextResponse.json({ data: { ok: true } }, { status: 201 })
}

export async function DELETE(request: Request) {
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const member = await resolveMember(supabase, user.id)
  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const vaultProjectId = new URL(request.url).searchParams.get('vault_project_id')
  if (!vaultProjectId) {
    return NextResponse.json({ error: 'vault_project_id is required.' }, { status: 400 })
  }

  const service = createServiceClient()
  // Scoped to the caller's OWN org_id (never trusted from the client) —
  // any member may remove any org entry (D-14c), but never another
  // company's shortlist row (T-16-19).
  const { error } = await service
    .from('buyer_shortlists')
    .delete()
    .eq('org_id', member.org_id)
    .eq('vault_project_id', vaultProjectId)

  if (error) {
    return NextResponse.json({ error: 'Failed to remove — please try again.' }, { status: 500 })
  }

  return NextResponse.json({ data: { ok: true } })
}
