import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyAdmin } from '@/lib/admin/gate'
import { loadCompletions, type AssignmentKind } from '@/lib/playbook/plays'

// ─── GET /api/admin/plays/[id]/completions (D-31.2-11, 31.2 plan 09) ──────
// Leadership-only (verifyAdmin) "who's acted" rollup for a play — reads
// play_assignments for the given play id, then loadCompletions (plan 06)
// across the team's book, and returns per-assignment completed-by-AE lists +
// counts. This is the measurement half of the coaching loop: leadership sees
// exactly who acted on each assignment PlayComposer's active-play panel
// already renders. T-31.2-24 (Elevation of Privilege): verifyAdmin gates
// this route — a non-leadership caller never reaches play_assignment_completions.

type CompletionRollupRow = {
  assignmentId: string
  title: string
  kind: AssignmentKind
  completedCount: number
  completedBy: { aeUserId: string; aeName: string; completedAt: string }[]
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyAdmin()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id: playId } = await params
  const service = createServiceClient()

  const { data: playRow, error: playError } = await service.from('plays').select('id, title').eq('id', playId).maybeSingle()
  if (playError) return NextResponse.json({ error: playError.message }, { status: 500 })
  if (!playRow) return NextResponse.json({ error: 'Play not found' }, { status: 404 })

  const { data: assignmentRows, error: assignmentsError } = await service
    .from('play_assignments')
    .select('id, title, kind')
    .eq('play_id', playId)
    .order('sort_order', { ascending: true })
  if (assignmentsError) return NextResponse.json({ error: assignmentsError.message }, { status: 500 })

  const assignments = (assignmentRows ?? []) as { id: string; title: string; kind: AssignmentKind }[]
  const assignmentIds = assignments.map(a => a.id)
  const completions = await loadCompletions(service, assignmentIds)

  const aeIds = Array.from(new Set(completions.map(c => c.aeUserId)))
  let aeNameById = new Map<string, string>()
  if (aeIds.length > 0) {
    const { data: staffRows } = await service.from('funun_staff').select('user_id, display_name').in('user_id', aeIds)
    aeNameById = new Map(((staffRows ?? []) as { user_id: string; display_name: string }[]).map(r => [r.user_id, r.display_name]))
  }

  const rollup: CompletionRollupRow[] = assignments.map(a => {
    const completedFor = completions.filter(c => c.assignmentId === a.id)
    return {
      assignmentId: a.id,
      title: a.title,
      kind: a.kind,
      completedCount: completedFor.length,
      completedBy: completedFor.map(c => ({
        aeUserId: c.aeUserId,
        aeName: aeNameById.get(c.aeUserId) ?? 'Unknown',
        completedAt: c.completedAt,
      })),
    }
  })

  return NextResponse.json({ data: { playId: (playRow as { id: string }).id, title: (playRow as { title: string }).title, assignments: rollup } })
}
