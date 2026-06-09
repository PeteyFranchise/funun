import type { Opportunity } from '@/types'
import { DEMO_VAULT_PROJECTS } from '@/lib/vault/demo'
import {
  matchOpportunityToVault,
  type MatchableArtist,
  type MatchableProject,
} from '@/lib/matching/antenna'

/**
 * Demo seed for the Antenna (NEXT_PUBLIC_VAULT_DEMO=true). Lets the artist
 * Antenna render a populated, ranked list locally without a Supabase backend.
 * Scores are computed by the real matching engine against the demo vault.
 */

function opp(partial: Partial<Opportunity> & Pick<Opportunity, 'id' | 'title' | 'type'>): Opportunity {
  return {
    created_by: 'demo-industry',
    industry_profile_id: 'demo-industry-profile',
    description: '',
    genres: [],
    mood_tags: [],
    bpm_min: null,
    bpm_max: null,
    deadline: null,
    active: true,
    exclusive: false,
    compensation: null,
    submission_requirements: null,
    min_readiness_score: 60,
    min_monthly_listeners: null,
    max_monthly_listeners: null,
    career_stages: [1, 2, 3, 4],
    location_preference: null,
    response_deadline: null,
    slots_available: 1,
    slots_filled: 0,
    platform: null,
    compensation_type: null,
    pete_exclusive: false,
    pete_note: null,
    created_at: '2026-05-01T00:00:00Z',
    ...partial,
  }
}

export const DEMO_OPPORTUNITIES: Opportunity[] = [
  opp({
    id: 'demo-opp-sync',
    title: 'Late-night R&B for a streaming drama trailer',
    type: 'sync',
    description: 'Seeking moody, vocal-forward R&B for a key trailer moment. Paid sync placement.',
    genres: ['R&B', 'Alt R&B'],
    mood_tags: ['late-night', 'moody', 'introspective'],
    compensation: '$3,500 sync fee',
    compensation_type: 'paid',
    response_deadline: '2026-06-20T00:00:00Z',
    pete_exclusive: true,
    pete_note: 'Direct line to the music supervisor — Pete vouched for this one.',
    min_readiness_score: 70,
  }),
  opp({
    id: 'demo-opp-playlist',
    title: 'Editorial-style R&B mood playlist — adds open',
    type: 'playlist',
    description: 'Independent curator building a 40k-follower late-night R&B playlist.',
    genres: ['R&B'],
    mood_tags: ['late-night', 'smooth'],
    compensation: 'Editorial placement',
    compensation_type: 'credit_only',
    response_deadline: '2026-06-15T00:00:00Z',
    slots_available: 3,
    min_readiness_score: 60,
  }),
  opp({
    id: 'demo-opp-label',
    title: 'Boutique label A&R — single deal scouting',
    type: 'label',
    description: 'A&R scouting release-ready singles from rising R&B and pop artists.',
    genres: ['R&B', 'Pop'],
    mood_tags: [],
    compensation: 'Single deal + marketing',
    compensation_type: 'rev_share',
    min_readiness_score: 75,
  }),
]

const DEMO_ARTIST: MatchableArtist = {
  genre: 'R&B',
  monthly_listeners: 8200,
  career_stage: 2,
  location: 'Atlanta, GA',
  mood_tags: ['late-night', 'introspective', 'moody'],
}

export type DemoAntennaMatch = {
  opportunity: Opportunity
  score: number
  projectTitle: string
  breakdown: ReturnType<typeof matchOpportunityToVault>[number]['breakdown']
}

export function getDemoAntenna(): DemoAntennaMatch[] {
  const projects: MatchableProject[] = DEMO_VAULT_PROJECTS.map(p => ({
    id: p.id,
    title: p.title,
    type: p.type,
    genre: p.genre,
    vault_readiness_score: p.vault_readiness_score,
    mood_tags: [],
  }))

  const out: DemoAntennaMatch[] = []
  for (const o of DEMO_OPPORTUNITIES) {
    const results = matchOpportunityToVault(o, projects, DEMO_ARTIST)
    if (results.length === 0) continue
    const best = results[0]
    out.push({
      opportunity: o,
      score: best.score,
      projectTitle: best.projectTitle,
      breakdown: best.breakdown,
    })
  }
  // Pete's Network pinned to the top, then by score.
  return out.sort((a, b) => {
    if (a.opportunity.pete_exclusive !== b.opportunity.pete_exclusive) {
      return a.opportunity.pete_exclusive ? -1 : 1
    }
    return b.score - a.score
  })
}

export function getDemoOpportunity(id: string): Opportunity | null {
  return DEMO_OPPORTUNITIES.find(o => o.id === id) ?? null
}
