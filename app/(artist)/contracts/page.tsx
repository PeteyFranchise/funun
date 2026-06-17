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

export default async function ContractsPage() {
  let projects: Proj[] = []
  if (DEMO) {
    projects = (await getDemoProjects()) as Proj[]
  } else {
    const supabase = createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const { data } = await supabase
      .from('vault_projects')
      .select(
        `id, title, tracks (id, metadata),
         vault_documents (id, type, status, signed_at, source, verification_status, verification_checks, verification_summary)`
      )
      .eq('user_id', user?.id ?? '')
    projects = (data ?? []) as unknown as Proj[]
  }

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
      })
    }
  }

  // Verified first, then signed, then pending; needs-fixing floats to top.
  const order = { verified: 1, signed: 2, pending: 3 } as const
  rows.sort((a, b) => (a.needsFixing === b.needsFixing ? order[a.status] - order[b.status] : a.needsFixing ? -1 : 1))

  const verified = rows.filter(r => r.status === 'verified' && !r.needsFixing).length

  return (
    <>
      <Topbar
        title="Contract Locker"
        subtitle={`${rows.length} document${rows.length === 1 ? '' : 's'} · ${verified} verified — the paperwork behind your money`}
      >
        <ContractUpload projects={projects.map(p => ({ id: p.id, title: p.title }))} />
      </Topbar>
      <div className="flex-1 px-9 py-[30px]">
        <ContractLocker rows={rows} />
      </div>
    </>
  )
}
