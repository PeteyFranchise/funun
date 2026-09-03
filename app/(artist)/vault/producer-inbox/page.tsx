import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Topbar } from '@/components/layout/Topbar'
import { ProducerInbox, type ProducerInboxItem } from '@/components/catalogue/ProducerInbox'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { signVersionUrls } from '@/lib/catalogue/audio'
import { safeAudioDownloadName } from '@/lib/catalogue/producer-handoff'
import { profileDisplayTitle } from '@/lib/profile/display-name'

export const dynamic = 'force-dynamic'

function downloadUrl(url: string | null | undefined, fileName: string): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    parsed.searchParams.set('download', fileName)
    return parsed.toString()
  } catch {
    return null
  }
}

export default async function ProducerInboxPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/signin')

  // RLS still resolves current room membership; the recipient filter then
  // limits the inbox to handoffs addressed to this exact account.
  const { data: handoffRows } = await supabase
    .from('work_recording_handoffs')
    .select('id, work_id, rough_version_id, created_by, vocal_path, note, created_at')
    .eq('recipient_user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100)

  const handoffs = (handoffRows ?? []) as {
    id: string
    work_id: string
    rough_version_id: string
    created_by: string
    vocal_path: string
    note: string | null
    created_at: string
  }[]

  const handoffIds = handoffs.map(row => row.id)
  const workIds = Array.from(new Set(handoffs.map(row => row.work_id)))
  const roughVersionIds = handoffs.map(row => row.rough_version_id)
  const senderIds = Array.from(new Set(handoffs.map(row => row.created_by)))
  const service = createServiceClient()
  const [worksRes, roughsRes, receiptsRes, returnsRes, profilesRes] = await Promise.all([
    workIds.length ? supabase.from('works').select('id, title').in('id', workIds) : Promise.resolve({ data: [] }),
    roughVersionIds.length ? supabase.from('work_versions').select('id, label, audio_path').in('id', roughVersionIds) : Promise.resolve({ data: [] }),
    handoffIds.length ? supabase.from('work_recording_handoff_receipts').select('handoff_id, acknowledged_at').in('handoff_id', handoffIds) : Promise.resolve({ data: [] }),
    handoffIds.length ? supabase.from('work_recording_handoff_returns').select('id, handoff_id, version_id, note, created_at').in('handoff_id', handoffIds).order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
    senderIds.length ? service.from('user_profiles').select('id, artist_name, handle').in('id', senderIds) : Promise.resolve({ data: [] }),
  ])

  const returns = (returnsRes.data ?? []) as {
    id: string
    handoff_id: string
    version_id: string
    note: string | null
    created_at: string
  }[]
  const returnVersionIds = returns.map(row => row.version_id)
  const { data: returnVersionRows } = returnVersionIds.length
    ? await supabase.from('work_versions').select('id, label, audio_path').in('id', returnVersionIds)
    : { data: [] }

  const worksById = new Map(((worksRes.data ?? []) as { id: string; title: string }[]).map(row => [row.id, row]))
  const roughsById = new Map(((roughsRes.data ?? []) as { id: string; label: string | null; audio_path: string }[]).map(row => [row.id, row]))
  const receiptsByHandoff = new Map(((receiptsRes.data ?? []) as { handoff_id: string; acknowledged_at: string }[]).map(row => [row.handoff_id, row.acknowledged_at]))
  const returnVersionsById = new Map(((returnVersionRows ?? []) as { id: string; label: string | null; audio_path: string }[]).map(row => [row.id, row]))
  const profilesById = new Map(((profilesRes.data ?? []) as { id: string; artist_name: string | null; handle: string | null }[]).map(row => [row.id, row]))
  const returnRowsByHandoff = new Map<string, typeof returns>()
  for (const returned of returns) {
    const current = returnRowsByHandoff.get(returned.handoff_id) ?? []
    current.push(returned)
    returnRowsByHandoff.set(returned.handoff_id, current)
  }

  const paths = [
    ...handoffs.flatMap(handoff => {
      const rough = roughsById.get(handoff.rough_version_id)
      return rough ? [rough.audio_path, handoff.vocal_path] : [handoff.vocal_path]
    }),
    ...Array.from(returnVersionsById.values()).map(version => version.audio_path),
  ]
  const signedByPath = await signVersionUrls(Array.from(new Set(paths)))

  const items: ProducerInboxItem[] = handoffs.flatMap(handoff => {
    const work = worksById.get(handoff.work_id)
    const rough = roughsById.get(handoff.rough_version_id)
    if (!work || !rough) return []
    const sender = profilesById.get(handoff.created_by)
    const senderName = profileDisplayTitle({ artistName: sender?.artist_name ?? null, handle: sender?.handle ?? null }) || 'A collaborator'
    const returnedMixes = (returnRowsByHandoff.get(handoff.id) ?? []).flatMap(returned => {
      const version = returnVersionsById.get(returned.version_id)
      if (!version) return []
      return [{
        id: returned.id,
        versionId: returned.version_id,
        label: version.label?.trim() || 'Producer mix',
        note: returned.note,
        createdAt: returned.created_at,
        playbackUrl: signedByPath[version.audio_path] ?? null,
      }]
    })
    const roughUrl = signedByPath[rough.audio_path] ?? null
    const vocalUrl = signedByPath[handoff.vocal_path] ?? null
    return [{
      id: handoff.id,
      workId: handoff.work_id,
      workTitle: work.title,
      senderName,
      note: handoff.note,
      sentAt: handoff.created_at,
      acknowledgedAt: receiptsByHandoff.get(handoff.id) ?? null,
      roughLabel: rough.label?.trim() || 'Rough vocal take',
      roughUrl,
      roughDownloadUrl: downloadUrl(roughUrl, safeAudioDownloadName(work.title, 'rough-mix')),
      vocalUrl,
      vocalDownloadUrl: downloadUrl(vocalUrl, safeAudioDownloadName(work.title, 'dry-vocal')),
      returns: returnedMixes,
    }]
  })

  const waitingCount = items.filter(item => !item.acknowledgedAt && item.returns.length === 0).length
  const subtitle = waitingCount > 0
    ? `${waitingCount} ${waitingCount === 1 ? 'handoff needs' : 'handoffs need'} your reply`
    : `${items.length} ${items.length === 1 ? 'producer handoff' : 'producer handoffs'}`

  return (
    <>
      <Topbar title="Producer inbox" subtitle={subtitle}>
        <Link href="/vault" className="rounded-[9px] border border-hairstrong bg-lav/[.05] px-4 py-2.5 text-[12px] font-semibold text-lav hover:text-white">Sound Vault</Link>
      </Topbar>
      <main className="flex-1 px-9 py-[30px]">
        <div className="mb-6 max-w-2xl">
          <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-brandindigo">Creative handoffs</p>
          <h1 className="mt-1 text-[23px] font-bold tracking-[-.02em] text-white">Pick up the pack. Bring the next mix back.</h1>
          <p className="mt-2 text-[12px] leading-5 text-lavdim">Everything stays attached to the original song and visible to its Writer’s Room. Receiving or returning a mix does not approve a master, split, or right.</p>
        </div>
        <ProducerInbox items={items} />
      </main>
    </>
  )
}
