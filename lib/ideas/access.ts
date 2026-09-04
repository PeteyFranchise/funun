import type { SupabaseClient } from '@supabase/supabase-js'
import type { IdeaPermission } from '@/lib/ideas/schema'

export type IdeaAccess = { granted: true; permission: 'owner' | IdeaPermission; ownerId: string } | { granted: false }

export async function resolveIdeaAccess(supabase: SupabaseClient, ideaId: string, userId: string): Promise<IdeaAccess> {
  const { data: idea } = await supabase.from('ideas').select('id, user_id').eq('id', ideaId).maybeSingle()
  if (!idea) return { granted: false }
  if (idea.user_id === userId) return { granted: true, permission: 'owner', ownerId: idea.user_id }
  const { data: member } = await supabase
    .from('idea_members')
    .select('permission')
    .eq('idea_id', ideaId)
    .eq('user_id', userId)
    .maybeSingle()
  const permission = member?.permission
  if (permission !== 'listen' && permission !== 'comment' && permission !== 'contribute') return { granted: false }
  return { granted: true, permission, ownerId: idea.user_id }
}
