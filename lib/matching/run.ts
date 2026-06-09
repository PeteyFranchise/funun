import type { SupabaseClient } from '@supabase/supabase-js'
import type { Opportunity, VaultProjectType } from '@/types'
import { createNotification } from '@/lib/notifications'
import { deadlineLabel } from '@/lib/antenna/display'
import {
  matchOpportunityToVault,
  type MatchableArtist,
  type MatchableProject,
} from './antenna'

type ArtistRow = {
  id: string
  genre: string | null
  monthly_listeners: number | null
  career_stage: number
  location: string | null
  sound_identity: { mood_tags?: string[] } | null
}

type ProjectRow = {
  id: string
  user_id: string
  title: string
  type: VaultProjectType
  genre: string | null
  vault_readiness_score: number
}

/**
 * Run the Antenna matching engine for one opportunity across every artist's
 * vault, then persist results into opportunity_matches and fire notifications.
 *
 *   - New matches are inserted; existing ones have their score/breakdown
 *     refreshed (no duplicate notification).
 *   - score >= 70            → in-app notification.
 *   - score >= 85 && pete_exclusive → email copy too.
 *
 * Requires a SERVICE-ROLE client (reads across all users, bypasses RLS).
 */
export async function runMatchingForOpportunity(
  service: SupabaseClient,
  opportunity: Opportunity
): Promise<{ matched: number }> {
  if (!opportunity.active) return { matched: 0 }

  const [{ data: artists }, { data: projects }] = await Promise.all([
    service
      .from('artist_profiles')
      .select('id, genre, monthly_listeners, career_stage, location, sound_identity'),
    service
      .from('vault_projects')
      .select('id, user_id, title, type, genre, vault_readiness_score'),
  ])

  const artistRows = (artists ?? []) as ArtistRow[]
  const projectRows = (projects ?? []) as ProjectRow[]
  const artistById = new Map(artistRows.map(a => [a.id, a]))

  const projectsByUser = new Map<string, ProjectRow[]>()
  for (const p of projectRows) {
    const list = projectsByUser.get(p.user_id) ?? []
    list.push(p)
    projectsByUser.set(p.user_id, list)
  }

  // Which (opportunity, project) pairs already have a match row?
  const { data: existing } = await service
    .from('opportunity_matches')
    .select('id, project_id')
    .eq('opportunity_id', opportunity.id)
  const existingByProject = new Map(
    ((existing ?? []) as { id: string; project_id: string }[]).map(m => [m.project_id, m.id])
  )

  let matched = 0

  for (const [userId, userProjects] of projectsByUser) {
    const artist = artistById.get(userId)
    if (!artist) continue

    const matchable: MatchableArtist = {
      genre: artist.genre,
      monthly_listeners: artist.monthly_listeners,
      career_stage: artist.career_stage,
      location: artist.location,
      mood_tags: artist.sound_identity?.mood_tags ?? [],
    }
    const mappedProjects: MatchableProject[] = userProjects.map(p => ({
      id: p.id,
      title: p.title,
      type: p.type,
      genre: p.genre,
      vault_readiness_score: p.vault_readiness_score,
      mood_tags: [],
    }))

    const results = matchOpportunityToVault(opportunity, mappedProjects, matchable)

    for (const r of results) {
      matched++
      const existingId = existingByProject.get(r.projectId)

      if (existingId) {
        await service
          .from('opportunity_matches')
          .update({ match_score: r.score, breakdown: r.breakdown })
          .eq('id', existingId)
        continue
      }

      await service.from('opportunity_matches').insert({
        opportunity_id: opportunity.id,
        project_id: r.projectId,
        user_id: userId,
        match_score: r.score,
        breakdown: r.breakdown,
        status: r.score >= 70 ? 'notified' : 'matched',
      })

      // Notify on strong matches only.
      if (r.score >= 70) {
        const dl = deadlineLabel(opportunity.response_deadline ?? opportunity.deadline)
        const body = `${opportunity.title} is a ${r.score}% match for "${r.projectTitle}".${
          dl ? ` ${dl}.` : ''
        }`
        const sendEmailCopy = r.score >= 85 && opportunity.pete_exclusive
        let email: string | null = null
        if (sendEmailCopy) {
          const { data: u } = await service.auth.admin.getUserById(userId)
          email = u.user?.email ?? null
        }
        await createNotification(service, {
          userId,
          type: 'antenna_match',
          title: `New ${r.score}% Antenna match`,
          body,
          link: `/antenna/${opportunity.id}`,
          data: { opportunityId: opportunity.id, projectId: r.projectId, score: r.score },
          email,
          sendEmailCopy,
        })
      }
    }
  }

  return { matched }
}
