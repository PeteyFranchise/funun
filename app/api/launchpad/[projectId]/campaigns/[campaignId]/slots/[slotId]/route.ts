import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'
import { readPosts, sanitizeSlotEdit } from '@/lib/launchpad/campaigns'

// PATCH /api/launchpad/[projectId]/campaigns/[campaignId]/slots/[slotId]
// Mutates a single slot's caption / posting_time / completed behind an
// ownership-first IDOR guard (T-07-07).
//
// Security properties:
//   1. Campaign loaded with .eq('user_id', user.id) BEFORE any posts access —
//      a bare slotId is never trusted independently of its parent campaign owner.
//   2. Only sanitizeSlotEdit()'s allowlisted fields (caption, posting_time,
//      completed) are applied — a body carrying { posts: [...], is_active: false }
//      mutates none of those fields.
//   3. completed_at is set / cleared server-side; source is set to 'manual'
//      when caption is edited (D-03 provenance tracking).
//   4. The full posts array is re-saved — a raw client-supplied posts array
//      is NEVER accepted as the column value (T-07-08).
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string; campaignId: string; slotId: string }> }
) {
  const { projectId, campaignId, slotId } = await params

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // IDOR guard: re-derive ownership from the parent campaign row FIRST.
  // A caller who knows a slotId but not the owning campaign cannot reach posts[].
  const { data: campaign } = await supabase
    .from('social_campaigns')
    .select('id, posts')
    .eq('id', campaignId)
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

  // Parse current posts through the typed read helper (never raw JSONB)
  const currentPosts = readPosts(campaign.posts)

  // Locate the target slot by its stable id (assigned at generation time)
  const slotIndex = currentPosts.findIndex(p => p.id === slotId)
  if (slotIndex === -1) return NextResponse.json({ error: 'Slot not found' }, { status: 404 })

  // Allowlist-only field extraction — rejects posts[], is_active, platform, etc.
  const body = (await request.json()) as Record<string, unknown>
  const edits = sanitizeSlotEdit(body)

  // Apply allowlisted edits to a shallow copy of the located slot
  const updatedSlot = { ...currentPosts[slotIndex] }

  if (edits.caption !== undefined) {
    updatedSlot.caption = edits.caption
    // D-03: hand-edited captions are flagged as 'manual' for provenance tracking
    updatedSlot.source = 'manual'
  }

  if (edits.posting_time !== undefined) {
    updatedSlot.posting_time = edits.posting_time
  }

  if (edits.completed !== undefined) {
    updatedSlot.completed = edits.completed
    // D-13: completed_at is set server-side on a true-flip, cleared on false-flip
    updatedSlot.completed_at = edits.completed ? new Date().toISOString() : null
  }

  // Re-save the full posts array — never a client-supplied replacement (T-07-08)
  const updatedPosts = [
    ...currentPosts.slice(0, slotIndex),
    updatedSlot,
    ...currentPosts.slice(slotIndex + 1),
  ]

  const { error: updateError } = await supabase
    .from('social_campaigns')
    .update({ posts: updatedPosts })
    .eq('id', campaignId)
    .eq('user_id', user.id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ data: updatedSlot })
}
