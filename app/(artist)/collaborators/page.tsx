import { createServerClient } from '@/lib/supabase/server'
import { CollaboratorRoster } from '@/components/collaborators/CollaboratorRoster'
import type { CollaboratorProfile } from '@/lib/collaborators'
import { Topbar } from '@/components/layout/Topbar'

export const dynamic = 'force-dynamic'

export default async function CollaboratorsPage() {
  const supabase = createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data } = await supabase
    .from('collaborators')
    .select('*')
    .eq('user_id', user?.id ?? '')
    .order('name', { ascending: true })

  const collaborators = (data ?? []) as CollaboratorProfile[]

  return (
    <>
      <Topbar
        title="Collaborators"
        subtitle="Your roster — add once, auto-fill everywhere."
      />
      <div className="px-9 py-8">
        <CollaboratorRoster collaborators={collaborators} />
      </div>
    </>
  )
}
