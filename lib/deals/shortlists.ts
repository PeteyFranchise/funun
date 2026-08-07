import type { SupabaseClient } from '@supabase/supabase-js'
import { computeStage3 } from '@/lib/vault/stage3'
import { isRightsReady } from '@/lib/deals/catalog'

// ─── loadShortlistEntries (D-14c) ──────────────────────────────────────────
// Re-evaluates rights-readiness at READ time (not save time) — a project
// that has since gone private or fallen below the readiness threshold is
// marked stillRightsReady: false, never silently dropped from the list
// (a stale entry must degrade loudly).
//
// Lives in lib/ (not the route.ts file) because Next.js route modules may
// only export HTTP method handlers plus a small route-config set — any
// other export fails Next's route type-checking at build time. Both
// GET /api/buyer/shortlists and app/sync/shortlists/page.tsx's (23-02:
// renamed from app/(buyer-portal)/buyers/shortlists/page.tsx)
// server-rendered list import this one implementation, so the
// re-evaluation rule and dual-level attribution can never drift between
// the two surfaces.

export type ShortlistEntry = {
  id: string
  vaultProjectId: string
  projectTitle: string
  savedBy: string | null
  savedAt: string
  stillRightsReady: boolean
}

type ShortlistProjectRow = {
  id: string
  title: string
  type: string
  is_public: boolean | null
  vault_readiness_score: number | null
  content_id_registered: boolean | null
  content_id_dismissed_until: string | null
  tracks: {
    id: string
    title: string | null
    writers: string[] | null
    producers: string[] | null
    mixing_engineer: string | null
    mastering_engineer: string | null
    has_sample: boolean | null
    sample_details: string | null
  }[]
  vault_documents: {
    id: string
    type: string
    status: string
    track_id: string | null
    document_data: Record<string, unknown> | null
  }[]
}

export async function loadShortlistEntries(service: SupabaseClient, orgId: string): Promise<ShortlistEntry[]> {
  const { data } = await service
    .from('buyer_shortlists')
    .select('id, vault_project_id, created_by, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

  const rows = (data ?? []) as { id: string; vault_project_id: string; created_by: string; created_at: string }[]
  if (rows.length === 0) return []

  const projectIds = Array.from(new Set(rows.map(r => r.vault_project_id)))
  const { data: projectRows } = await service
    .from('vault_projects')
    .select(
      `
      id, title, type, is_public, vault_readiness_score, content_id_registered, content_id_dismissed_until,
      tracks (id, title, writers, producers, mixing_engineer, mastering_engineer, has_sample, sample_details),
      vault_documents (id, type, status, track_id, document_data)
      `
    )
    .in('id', projectIds)
  const projectById = new Map(((projectRows ?? []) as ShortlistProjectRow[]).map(p => [p.id, p]))

  const saverIds = Array.from(new Set(rows.map(r => r.created_by)))
  const saverNameById = new Map<string, string | null>()
  await Promise.all(
    saverIds.map(async id => {
      try {
        const { data: authUser } = await service.auth.admin.getUserById(id)
        saverNameById.set(
          id,
          (authUser?.user?.user_metadata as { display_name?: string } | undefined)?.display_name ?? null
        )
      } catch {
        saverNameById.set(id, null)
      }
    })
  )

  return rows.map(r => {
    const project = projectById.get(r.vault_project_id)
    let stillRightsReady = false
    let projectTitle = 'Unknown project'
    if (project) {
      projectTitle = project.title
      const stage3 = computeStage3(
        project,
        project.tracks ?? [],
        project.vault_documents ?? [],
        project.vault_readiness_score ?? 0
      )
      stillRightsReady = isRightsReady(project, stage3)
    }
    return {
      id: r.id,
      vaultProjectId: r.vault_project_id,
      projectTitle,
      savedBy: saverNameById.get(r.created_by) ?? null,
      savedAt: r.created_at,
      stillRightsReady,
    }
  })
}
