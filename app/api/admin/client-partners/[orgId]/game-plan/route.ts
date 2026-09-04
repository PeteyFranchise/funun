import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/admin/gate'
import { appendRelationshipLog, canAccessOrgContacts } from '@/lib/client-partners/contacts'
import {
  SEEDED_GAME_PLAN_TOPICS,
  GamePlanTopicsSchema,
  buildDefaultGamePlanTopics,
  buildGamePlanLogBody,
  buildPickerTopics,
  loadAuthoredGamePlanTopics,
  loadGamePlan,
  normalizeGamePlanTopics,
} from '@/lib/client-partners/game-plan'

// ─── /api/admin/client-partners/[orgId]/game-plan (R14/D-31.1-06) ─────────
// GET loads the org's saved Game Plan (or seeds a fresh default set when
// none exists yet); PUT saves the edited topic list (upsert, one row per
// org); POST log-conversation appends a kind='conversation' relationship-log
// entry recording "X of N covered" + per-topic notes, then retires the
// logged plan so the next visit starts from the seeded defaults again.
// Own-book-scoped (R5) via the SAME canAccessOrgContacts predicate the
// contacts/relationship-log routes use — an out-of-book AE gets 404, never
// 403, on every handler.
//
// pickerTopics (31.2-08, D-31.2-07/Pitfall 4): GET additionally returns the
// picker's option menu — the 31.1 seeded starters concatenated with
// published playbook_entries(entry_type='topic'), via buildPickerTopics.
// This is a SEPARATE field from `topics` (the saved/seeded plan itself);
// the merge happens HERE, at the point the picker's option set is built —
// never inside buildDefaultGamePlanTopics(), which stays the "no saved row
// yet" seeding path untouched.

const GAME_PLAN_COLUMNS = 'id, buyer_org_id, topics, updated_by, created_at, updated_at'

async function resolveScopedOrg(service: ReturnType<typeof createServiceClient>, orgId: string) {
  const { data: orgRow } = await service
    .from('buyer_orgs')
    .select('id, ae_user_id')
    .eq('id', orgId)
    .maybeSingle()
  return orgRow as { id: string; ae_user_id: string | null } | null
}

const PutSchema = z.object({ topics: GamePlanTopicsSchema }).strict()
const PostSchema = z.object({ topics: GamePlanTopicsSchema }).strict()

export async function GET(_request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const auth = await requireStaff()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { orgId } = await params
  const service = createServiceClient()
  const org = await resolveScopedOrg(service, orgId)
  if (!org || !canAccessOrgContacts(auth.staffRole, org, auth.user.id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { topics, seeded } = await loadGamePlan(service, orgId)
  const authoredTopics = await loadAuthoredGamePlanTopics(service)
  const pickerTopics = buildPickerTopics(SEEDED_GAME_PLAN_TOPICS, authoredTopics)
  return NextResponse.json({ data: { topics, seeded, pickerTopics } })
}

export async function PUT(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const auth = await requireStaff()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { orgId } = await params
  const service = createServiceClient()
  const org = await resolveScopedOrg(service, orgId)
  if (!org || !canAccessOrgContacts(auth.staffRole, org, auth.user.id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const parsed = PutSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid game plan.' },
      { status: 400 }
    )
  }

  const topics = normalizeGamePlanTopics(parsed.data.topics)

  const { data, error } = await service
    .from('game_plans')
    .upsert(
      { buyer_org_id: orgId, topics, updated_by: auth.user.id },
      { onConflict: 'buyer_org_id' }
    )
    .select(GAME_PLAN_COLUMNS)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function POST(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const auth = await requireStaff()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { orgId } = await params
  const service = createServiceClient()
  const org = await resolveScopedOrg(service, orgId)
  if (!org || !canAccessOrgContacts(auth.staffRole, org, auth.user.id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const parsed = PostSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid game plan.' },
      { status: 400 }
    )
  }

  const topics = normalizeGamePlanTopics(parsed.data.topics)

  try {
    const logEntry = await appendRelationshipLog(service, {
      orgId,
      kind: 'conversation',
      body: buildGamePlanLogBody(topics),
      authorUserId: auth.user.id,
    })

    // D-31.1-06: "Log conversation" retires the logged plan — the next GET
    // reseeds from the defaults. Best-effort cleanup: the log entry above is
    // the authority write and has already committed; a failure clearing the
    // row here must not turn a successful log into an error response.
    await service.from('game_plans').delete().eq('buyer_org_id', orgId)

    return NextResponse.json(
      { data: { logEntry, topics: buildDefaultGamePlanTopics() } },
      { status: 201 }
    )
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to log conversation' },
      { status: 500 }
    )
  }
}
