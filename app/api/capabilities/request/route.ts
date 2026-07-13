import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'
import { requestCapability, DuplicateCapabilityRequestError } from '@/lib/capabilities/grant'
import { isValidCapability } from '@/lib/capabilities/check'
import { isValidRoleSlugList } from '@/lib/industry/roleMapping'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

// ─── POST /api/capabilities/request ─────────────────────────────────────
// Implements D-02: asymmetric capability gate.
//   - artist capability → granted instantly (self_serve_instant source)
//   - industry capability → queued as pending, requires admin approval
//
// V4 access-control: the grant target is ALWAYS the signed-in user's own id
// from auth.getUser(). The body must never supply a profile_id / profileId —
// any such field is ignored; T-15-05 elevation-of-privilege mitigation.
export async function POST(request: Request) {
  if (DEMO) {
    return NextResponse.json(
      { error: 'Capability requests are disabled in demo mode' },
      { status: 400 }
    )
  }

  // Derive identity from session — never from the request body (T-15-05).
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>

  // Validate capability via the strict literal guard (T-15-08).
  if (!isValidCapability(body.capability)) {
    return NextResponse.json({ error: 'A valid capability is required.' }, { status: 400 })
  }

  // Validate role_slugs against the known industry-role allowlist (T-15-08).
  if (!isValidRoleSlugList(body.role_slugs)) {
    return NextResponse.json({ error: 'Select at least one role.' }, { status: 400 })
  }

  try {
    // profileId is always the session user — body.profile_id is never read.
    const result = await requestCapability({
      profileId: user.id,
      capability: body.capability,
      roleSlugs: body.role_slugs,
    })

    // result.status is 'approved' (artist instant) or 'pending' (industry review)
    return NextResponse.json({ data: result }, { status: 201 })
  } catch (err) {
    if (err instanceof DuplicateCapabilityRequestError) {
      return NextResponse.json(
        { error: 'You already have or have requested this capability.' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: 'Something went wrong — please try again.' }, { status: 500 })
  }
}
