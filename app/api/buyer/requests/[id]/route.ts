import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'

// Explicit, client-safe column list (migration 081's GRANT SELECT
// allowlist) — never admin_notes/owner_id/commission_pct/artist_net_cents.
const LICENSE_REQUEST_COLUMNS =
  'id, buyer_org_id, created_by, vault_project_id, usage_types, territories, term_months, exclusivity, budget_cents, need_by, buyer_notes, stage, matched_precleared, gross_fee_cents, contract_document_id, created_at, updated_at'

// ─── GET /api/buyer/requests/[id] ──────────────────────────────────────────
// Read-only. Scoped to the caller's own buyer org (buyer_org_id derived from
// the caller's OWN buyer_members row, never from the request) and returns
// 404 — never 403 — for a request belonging to another org, matching the
// 10-03 precedent and the "buyer sees another buyer's request" abuse case
// in 16-VALIDATION (no existence leak).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: member } = await supabase
    .from('buyer_members')
    .select('org_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!member) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: licenseRequest } = await supabase
    .from('license_requests')
    .select(LICENSE_REQUEST_COLUMNS)
    .eq('id', id)
    .eq('buyer_org_id', member.org_id)
    .maybeSingle()

  if (!licenseRequest) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ data: licenseRequest })
}
