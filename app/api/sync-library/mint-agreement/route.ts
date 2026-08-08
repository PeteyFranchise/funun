import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'
import { mintOrGetBlanketAgreement } from '@/lib/sync-library/mint-agreement'

// ─── POST /api/sync-library/mint-agreement ─────────────────────────────
// Thin auth-gate + NextResponse wrapper. All mint-or-get logic (sign-once
// idempotency, gates-before-spend, DocuSeal mint, persistence, cohort
// advance) lives in lib/sync-library/mint-agreement.ts — extracted in
// 26-07-PLAN so the signing page can call the same core directly,
// server-side, without a same-origin HTTP self-call. This route remains
// the entry point for any other/future caller; behavior is unchanged.
//
// Server-owned-write doctrine, mirroring
// app/api/split-sheets/[id]/mint-envelope/route.ts:108-134: SESSION
// client verifies identity here; every write inside
// mintOrGetBlanketAgreement uses a SERVICE client.
//
// RUNTIME: default Node, deliberately — see lib/sync-library/mint-
// agreement.ts's header comment. NEVER add `export const runtime = 'edge'`
// to this file.

export async function POST(_request: Request) {
  // ── 1. Auth gate ───────────────────────────────────────────────────
  const apiClient = await createApiClient()
  const {
    data: { user },
  } = await apiClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await mintOrGetBlanketAgreement(user.id, user.email ?? null)
  return NextResponse.json(result.body, { status: result.status })
}
