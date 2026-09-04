import Link from 'next/link'
import { AcceptIdeaInvite } from '@/components/ideas/AcceptIdeaInvite'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'

export default async function JoinIdeaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    const next = `/ideas/join/${token}`
    return (
      <main className="flex-1 px-6">
        <div className="mx-auto mt-24 max-w-lg rounded-[28px] border border-white/10 bg-card p-8 text-center">
          <div className="text-xs font-bold uppercase tracking-[.24em] text-lav">Private idea</div>
          <h1 className="mt-3 text-3xl font-black">A spark is waiting for you.</h1>
          <p className="mt-3 text-sm leading-6 text-white/55">Sign in with your existing Funūn account to accept this one-use invitation.</p>
          <Link href={`/signin?next=${encodeURIComponent(next)}`} className="mt-7 inline-block rounded-full bg-white px-6 py-3 font-bold text-black">Sign in to continue</Link>
        </div>
      </main>
    )
  }
  const { data: viewerProfile } = await createServiceClient().from('user_profiles').select('id').eq('id', user.id).maybeSingle()
  if (!viewerProfile) notFound()
  return <main className="flex-1 px-6"><AcceptIdeaInvite token={token} /></main>
}
