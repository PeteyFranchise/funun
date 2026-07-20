import { createServerClient } from '@/lib/supabase/server'
import { getDemoProjects } from '@/lib/vault/demo-store'
import { Topbar } from '@/components/layout/Topbar'
import { ContractLocker, type ContractRow } from '@/components/contracts/ContractLocker'
import { ContractUpload } from '@/components/contracts/ContractUpload'
// Row derivation lives in lib/ because a Next.js page module may only
// export a fixed set of names — exporting these from here fails the build.
import { fetchContractRows, rowsFromProjects, type Proj } from '@/lib/contracts/locker-rows'

export const dynamic = 'force-dynamic'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

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
