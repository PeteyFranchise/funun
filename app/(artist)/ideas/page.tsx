import { notFound, redirect } from 'next/navigation'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { signVersionUrls } from '@/lib/catalogue/audio'
import { IdeasInbox } from '@/components/ideas/IdeasInbox'
import { safeIdeaDownloadName, type IdeaPermission, type IdeaRecordingKind, type IdeaRating, type IdeaState, type IdeaView } from '@/lib/ideas/schema'

export const dynamic = 'force-dynamic'

type Row = Record<string, any>

export default async function IdeasPage({ searchParams }: { searchParams: Promise<{ idea?: string }> }) {
  const { idea: requestedIdeaId } = await searchParams
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/signin')

  const service = createServiceClient()
  const { data: viewerProfile } = await service.from('user_profiles').select('id').eq('id', user.id).maybeSingle()
  if (!viewerProfile) notFound()

  const { data: ideaRows } = await supabase.from('ideas').select('*').order('pinned', { ascending: false }).order('captured_at', { ascending: false })
  const ideas = (ideaRows ?? []) as Row[]
  const ideaIds = ideas.map(idea => idea.id as string)
  const [recordingResult, markerResult, memberResult, commentResult, referenceResult, collectionResult, itemResult, collaboratorResult, workResult] = await Promise.all([
    ideaIds.length ? service.from('idea_recordings').select('*').in('idea_id', ideaIds).order('captured_at', { ascending: false }) : Promise.resolve({ data: [] }),
    ideaIds.length ? service.from('idea_markers').select('*').in('idea_id', ideaIds).order('timestamp_ms') : Promise.resolve({ data: [] }),
    ideaIds.length ? service.from('idea_members').select('*').in('idea_id', ideaIds) : Promise.resolve({ data: [] }),
    ideaIds.length ? service.from('idea_comments').select('*').in('idea_id', ideaIds).order('created_at') : Promise.resolve({ data: [] }),
    ideaIds.length ? service.from('idea_references').select('*').in('idea_id', ideaIds).order('created_at') : Promise.resolve({ data: [] }),
    service.from('idea_collections').select('id, name').eq('user_id', user.id).order('name'),
    service.from('idea_collection_items').select('collection_id, idea_id').in('idea_id', ideaIds.length ? ideaIds : ['00000000-0000-0000-0000-000000000000']),
    supabase.from('collaborators').select('id, name, claimed_by').eq('user_id', user.id).is('archived_at', null).not('claimed_by', 'is', null).order('name'),
    supabase.from('works').select('id, title').eq('user_id', user.id).order('updated_at', { ascending: false }).limit(100),
  ])

  const recordings = (recordingResult.data ?? []) as Row[]
  const markers = (markerResult.data ?? []) as Row[]
  const members = (memberResult.data ?? []) as Row[]
  const comments = (commentResult.data ?? []) as Row[]
  const references = (referenceResult.data ?? []) as Row[]
  const collections = (collectionResult.data ?? []) as Row[]
  const items = (itemResult.data ?? []) as Row[]
  const paths = Array.from(new Set(recordings.map(recording => recording.audio_path as string)))
  const signedByPath = await signVersionUrls(paths)

  const profileIds = Array.from(new Set([
    ...ideas.map(idea => idea.user_id as string),
    ...recordings.map(recording => recording.created_by as string | null),
    ...members.map(member => member.user_id as string),
    ...comments.map(comment => comment.author_user_id as string | null),
  ].filter((value): value is string => Boolean(value))))
  const { data: profileRows } = profileIds.length
    ? await service.from('user_profiles').select('id, artist_name, handle').in('id', profileIds)
    : { data: [] }
  const names = new Map<string, string>((profileRows ?? []).map((profile: Row) => [profile.id, profile.artist_name || (profile.handle ? `@${profile.handle}` : 'Funūn member')]))
  function downloadUrl(url: string | null, title: string, recording: { label: string | null; audio_ext: string }): string | null {
    if (!url) return null
    try {
      const download = new URL(url)
      download.searchParams.set('download', safeIdeaDownloadName(title, { label: recording.label, audioExt: recording.audio_ext }))
      return download.toString()
    } catch {
      return null
    }
  }
  const markersByRecording = new Map<string, Row[]>()
  for (const marker of markers) markersByRecording.set(marker.recording_id, [...(markersByRecording.get(marker.recording_id) ?? []), marker])
  const collectionsByIdea = new Map<string, Row[]>()
  for (const item of items) {
    const collection = collections.find(value => value.id === item.collection_id)
    if (collection) collectionsByIdea.set(item.idea_id, [...(collectionsByIdea.get(item.idea_id) ?? []), collection])
  }

  const view: IdeaView[] = ideas.map(idea => {
    const member = members.find(value => value.idea_id === idea.id && value.user_id === user.id)
    return {
      id: idea.id, ownerId: idea.user_id, ownerName: names.get(idea.user_id) ?? 'Funūn member',
      viewerPermission: idea.user_id === user.id ? 'owner' : (member?.permission as IdeaPermission),
      title: idea.title, note: idea.note, transcript: idea.transcript, moods: idea.moods ?? [],
      state: idea.state as IdeaState, pinned: idea.pinned, snoozedUntil: idea.snoozed_until,
      parentIdeaId: idea.parent_idea_id, promotedWorkId: idea.promoted_work_id, capturedAt: idea.captured_at,
      recordings: recordings.filter(recording => recording.idea_id === idea.id).map(recording => {
        const playbackUrl = signedByPath[recording.audio_path] ?? null
        return {
          id: recording.id, createdBy: recording.created_by,
          creatorName: names.get(recording.created_by) ?? 'Funūn member', parentRecordingId: recording.parent_recording_id,
          playbackUrl, downloadUrl: downloadUrl(playbackUrl, idea.title, {
            label: typeof recording.label === 'string' ? recording.label : null,
            audio_ext: String(recording.audio_ext),
          }),
          audioExt: recording.audio_ext, audioSize: Number(recording.audio_size), durationSeconds: recording.duration_seconds,
          label: recording.label, kind: recording.kind as IdeaRecordingKind, rating: recording.rating as IdeaRating | null,
          archivedAt: recording.archived_at, capturedAt: recording.captured_at,
          markers: (markersByRecording.get(recording.id) ?? []).map(marker => ({ id: marker.id, timestampMs: marker.timestamp_ms, label: marker.label })),
        }
      }),
      members: members.filter(value => value.idea_id === idea.id).map(value => ({
        userId: value.user_id, name: names.get(value.user_id) ?? 'Funūn member', permission: value.permission as IdeaPermission,
      })),
      comments: comments.filter(comment => comment.idea_id === idea.id).map(comment => ({
        id: comment.id, recordingId: comment.recording_id, authorName: names.get(comment.author_user_id) ?? 'Funūn member',
        timestampMs: comment.timestamp_ms, body: comment.body, createdAt: comment.created_at,
      })),
      references: references.filter(reference => reference.idea_id === idea.id).map(reference => ({
        id: reference.id, kind: reference.kind, label: reference.label, value: reference.value,
      })),
      collections: (collectionsByIdea.get(idea.id) ?? []).map(collection => ({ id: collection.id, name: collection.name })),
    }
  })

  const collaboratorOptions = Array.from(new Map((collaboratorResult.data ?? []).map((collaborator: Row) => [collaborator.claimed_by, {
    userId: collaborator.claimed_by as string, name: collaborator.name as string,
  }])).values())

  return (
    <main className="flex-1 px-5 py-7 sm:px-9">
      <IdeasInbox
        ideas={view}
        requestedIdeaId={requestedIdeaId ?? null}
        collaboratorOptions={collaboratorOptions}
        works={(workResult.data ?? []).map((work: Row) => ({ id: work.id as string, title: work.title as string }))}
        collectionNames={collections.map(collection => collection.name as string)}
      />
    </main>
  )
}
