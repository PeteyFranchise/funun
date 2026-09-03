import { createServiceClient } from '@/lib/supabase/server'
import type { LyricCommentParticipant } from '@/types/catalogue'

type ProfileRow = {
  id: string
  artist_name: string | null
  handle: string | null
  avatar_url: string | null
}

function participantFromProfile(profile: ProfileRow): LyricCommentParticipant {
  return {
    userId: profile.id,
    name: profile.artist_name?.trim() || (profile.handle ? `@${profile.handle}` : 'A writer'),
    handle: profile.handle,
    avatarUrl: profile.avatar_url,
  }
}

export async function loadWorkParticipantIds(workId: string): Promise<string[]> {
  const service = createServiceClient()
  const [{ data: work, error: workError }, { data: members, error: membersError }] = await Promise.all([
    service.from('works').select('user_id').eq('id', workId).maybeSingle(),
    service.from('work_members').select('user_id').eq('work_id', workId).not('user_id', 'is', null),
  ])
  if (workError || membersError || !work) {
    throw new Error(workError?.message ?? membersError?.message ?? 'Work not found')
  }
  return Array.from(new Set([work.user_id, ...(members ?? []).map(member => member.user_id as string)]))
}

export async function loadCommentProfiles(
  userIds: string[]
): Promise<Map<string, LyricCommentParticipant>> {
  if (userIds.length === 0) return new Map()
  const service = createServiceClient()
  const { data, error } = await service
    .from('user_profiles')
    .select('id, artist_name, handle, avatar_url')
    .in('id', userIds)
  if (error) throw new Error(error.message)
  return new Map(
    ((data ?? []) as ProfileRow[]).map(profile => {
      const participant = participantFromProfile(profile)
      return [participant.userId, participant] as const
    })
  )
}
