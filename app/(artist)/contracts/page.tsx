import type { SupabaseClient } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase/server'
import type { DocumentType, VerificationCheck, VerificationStatus } from '@/types'
import { readComposers } from '@/lib/metadata/schema'
import { getDemoProjects } from '@/lib/vault/demo-store'
import type { VaultProjectRow } from '@/lib/vault/demo'
import { Topbar } from '@/components/layout/Topbar'
import { ContractLocker, type ContractRow } from '@/components/contracts/ContractLocker'
import { ContractUpload } from '@/components/contracts/ContractUpload'

export const dynamic = 'force-dynamic'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

const DOC_LABELS: Record<DocumentType, string> = {
  split_sheet: 'Split Sheet',
  copyright_registration: 'Copyright Registration',
  hire_right: 'Work-for-Hire',
  sample_clearance: 'Sample Clearance',
  distribution_agreement: 'Distribution Agreement',
}

type DocRow = {
  id: string
  type: DocumentType
  status: 'pending' | 'signed' | 'verified'
  signed_at?: string | null
  source?: 'generated' | 'uploaded'
  verification_status?: VerificationStatus
  verification_checks?: VerificationCheck[]
  verification_summary?: string | null
  document_data?: Record<string, unknown> | null
}
type Proj = VaultProjectRow & { vault_documents?: DocRow[] }

// For split-sheet docs, compute the project's representative split picture.
function splitPicture(project: Proj): { total: number | null; writers: number | null } {
  const tracks = project.tracks ?? []
  const withComposers = tracks
    .map(t => readComposers(t.metadata))
    .filter(cs => cs.length > 0)
  if (withComposers.length === 0) return { total: null, writers: null }
  const totals = withComposers.map(cs => Math.round(cs.reduce((s, c) => s + (c.split || 0), 0) * 100) / 100)
  const allHundred = totals.every(t => t === 100)
  const writers = new Set(withComposers.flat().map(c => c.name)).size
  return { total: allHundred ? 100 : Math.min(...totals), writers }
}

function detailFor(type: DocumentType, projectTitle: string, sp: { total: number | null; writers: number | null }): string {
  switch (type) {
    case 'split_sheet':
      return sp.total != null
        ? `${projectTitle} · ${sp.writers} writer${sp.writers === 1 ? '' : 's'} · ${sp.total}%`
        : `${projectTitle} · splits not captured`
    case 'sample_clearance':
      return `${projectTitle} · sample license`
    case 'copyright_registration':
      return `${projectTitle} · copyright record`
    case 'hire_right':
      return `${projectTitle} · contributor agreement`
    case 'distribution_agreement':
      return `${projectTitle} · distribution terms`
  }
}

function rowsFromProjects(projects: Proj[]): ContractRow[] {
  const rows: ContractRow[] = []
  for (const project of projects) {
    const sp = splitPicture(project)
    for (const doc of project.vault_documents ?? []) {
      const uploaded = doc.source === 'uploaded'
      const needsFixing = uploaded
        ? doc.verification_status === 'failed'
        : doc.type === 'split_sheet' && sp.total != null && sp.total !== 100
      rows.push({
        id: doc.id,
        type: doc.type,
        label: DOC_LABELS[doc.type],
        projectTitle: project.title,
        status: doc.status,
        source: uploaded ? 'uploaded' : 'generated',
        detail: uploaded ? `${project.title} · uploaded from outside` : detailFor(doc.type, project.title, sp),
        needsFixing,
        splitTotal: doc.type === 'split_sheet' && !uploaded ? sp.total : null,
        writers: doc.type === 'split_sheet' && !uploaded ? sp.writers : null,
        signedAt: doc.signed_at ?? null,
        verificationStatus: doc.verification_status,
        verificationChecks: doc.verification_checks ?? undefined,
        verificationSummary: doc.verification_summary ?? null,
        unattached: false,
        splitSheetId: null,
      })
    }
  }
  return rows
}

// RESEARCH Pitfall 2 / gap fix 2 (P17-05): a vault_documents row with
// project_id IS NULL has no parent vault_projects row to be nested under,
// so the project-nested query above can never reach it no matter how
// correctly it was inserted. Build its row shape from the direct query.
function standaloneRow(doc: DocRow): ContractRow {
  const uploaded = doc.source === 'uploaded'
  const splitSheetId =
    typeof doc.document_data?.split_sheet_id === 'string' ? (doc.document_data.split_sheet_id as string) : null
  return {
    id: doc.id,
    type: doc.type,
    label: DOC_LABELS[doc.type],
    projectTitle: '',
    status: doc.status,
    source: uploaded ? 'uploaded' : 'generated',
    detail: 'Unattached · not linked to a release yet',
    needsFixing: false,
    splitTotal: null,
    writers: null,
    signedAt: doc.signed_at ?? null,
    verificationStatus: doc.verification_status,
    verificationChecks: doc.verification_checks ?? undefined,
    verificationSummary: doc.verification_summary ?? null,
    unattached: true,
    splitSheetId,
  }
}

/** Merge two row sources, de-duplicating by id (a document must never appear twice). */
export function mergeContractRows(existing: ContractRow[], standalone: ContractRow[]): ContractRow[] {
  const seen = new Set(existing.map(r => r.id))
  const merged = [...existing]
  for (const row of standalone) {
    if (seen.has(row.id)) continue
    seen.add(row.id)
    merged.push(row)
  }
  return merged
}

/**
 * Fetches BOTH the project-nested vault_documents rows AND a second, direct
 * query of standalone (project_id IS NULL) vault_documents rows, then merges
 * them into the single row list Contract Locker renders. Exported for
 * query-shape/merge testing against a mocked Supabase client.
 */
export async function fetchContractRows(
  supabase: Pick<SupabaseClient, 'from'>,
  userId: string
): Promise<{ rows: ContractRow[]; projects: Proj[] }> {
  const { data: projectData } = await supabase
    .from('vault_projects')
    .select(
      `id, title, tracks (id, metadata),
       vault_documents (id, type, status, signed_at, source, verification_status, verification_checks, verification_summary)`
    )
    .eq('user_id', userId)
  const projects = (projectData ?? []) as unknown as Proj[]

  const { data: standaloneData } = await supabase
    .from('vault_documents')
    .select(
      'id, type, status, signed_at, source, verification_status, verification_checks, verification_summary, document_data'
    )
    .eq('user_id', userId)
    .is('project_id', null)
  const standalone = ((standaloneData ?? []) as DocRow[]).map(standaloneRow)

  return { rows: mergeContractRows(rowsFromProjects(projects), standalone), projects }
}

export default async function ContractsPage() {
  let projects: Proj[] = []
  let rows: ContractRow[] = []
  if (DEMO) {
    projects = (await getDemoProjects()) as Proj[]
    rows = rowsFromProjects(projects)
  } else {
    const supabase = await createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const result = await fetchContractRows(supabase, user?.id ?? '')
    projects = result.projects
    rows = result.rows
  }

  // Verified first, then signed, then pending; needs-fixing floats to top.
  const order = { verified: 1, signed: 2, pending: 3 } as const
  rows.sort((a, b) => (a.needsFixing === b.needsFixing ? order[a.status] - order[b.status] : a.needsFixing ? -1 : 1))

  const verified = rows.filter(r => r.status === 'verified' && !r.needsFixing).length
  const projectOptions = projects.map(p => ({ id: p.id, title: p.title }))

  return (
    <>
      <Topbar
        title="Contract Locker"
        subtitle={`${rows.length} document${rows.length === 1 ? '' : 's'} · ${verified} verified — the paperwork behind your money`}
      >
        <ContractUpload projects={projectOptions} />
      </Topbar>
      <div className="flex-1 px-9 py-[30px]">
        <ContractLocker rows={rows} projects={projectOptions} />
      </div>
    </>
  )
}
