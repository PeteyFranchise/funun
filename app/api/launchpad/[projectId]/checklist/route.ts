import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'

// GET /api/launchpad/[projectId]/checklist
// Returns all checklist items ordered by sort_order, merged with the
// authenticated user's per-project completion state. Tips are gated:
// tip_body is null unless tip_approved is true (LAUNCH-03). tip_draft,
// tip_drafted_at, and author are never included in artist-facing responses.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params

  const supabase = createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Ownership check — 404 if project does not belong to the authenticated user
  const { data: project } = await supabase
    .from('vault_projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Parallel fetch: all items in sort order + this user's progress for this project
  const [{ data: items }, { data: progress }] = await Promise.all([
    supabase.from('launchpad_checklist_items').select('*').order('sort_order'),
    supabase
      .from('launchpad_progress')
      .select('item_key, completed, completed_at')
      .eq('project_id', projectId)
      .eq('user_id', user.id),
  ])

  // Build an O(1) lookup for progress rows by item_key
  const progressMap = new Map((progress ?? []).map((p) => [p.item_key, p]))

  // Merge items with progress; gate tip_body and strip admin-only fields
  const merged = (items ?? []).map((item) => {
    // Destructure to exclude admin-only columns from the response object
    const {
      tip_draft: _tipDraft,
      tip_drafted_at: _tipDraftedAt,
      author: _author,
      ...safeItem
    } = item as typeof item & {
      tip_draft: unknown
      tip_drafted_at: unknown
      author: unknown
    }
    void _tipDraft
    void _tipDraftedAt
    void _author

    const prog = progressMap.get(item.key)
    return {
      ...safeItem,
      // LAUNCH-03: expose tip_body only when approved
      tip_body: item.tip_approved ? item.tip_body : null,
      completed: prog?.completed ?? false,
      completed_at: prog?.completed_at ?? null,
    }
  })

  return NextResponse.json({ data: merged })
}
