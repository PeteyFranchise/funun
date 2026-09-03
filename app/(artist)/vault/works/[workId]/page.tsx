import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { Topbar } from '@/components/layout/Topbar'
import { resolveWorkAccess, createWorkAccessDeps } from '@/lib/catalogue/access'
import { isSongPassportAvailableForWork, type SongPassportCohortClient } from '@/lib/song-passport/feature'
import { loadSongPassportView } from '@/lib/song-passport/repository'
import { loadWorkSplits } from '@/lib/catalogue/splits-io'
import * as CatalogueAudio from '@/lib/catalogue/audio'
import { deriveVersionNumerals, presentVersion } from '@/lib/catalogue/versions'
import { describeDiaryEvent, type DiaryEventContext, type DiaryEventRowLike } from '@/lib/catalogue/diary'
import * as CatalogueGuidingLine from '@/lib/catalogue/guiding-line'
import type { GuidingLineSnapshot } from '@/lib/catalogue/guiding-line'
import { buildSingerCandidates } from '@/lib/catalogue/singer-options'
import { writersMissingFromSheet, identityKey, type PartyIdentity, type WorkMember as SplitsWorkMember } from '@/lib/catalogue/splits'
import { WorkPage, type VersionCardData } from '@/components/catalogue/WorkPage'
import type { WorkRosterMember } from '@/components/catalogue/WorkRoster'
import type { LyricsPadBlock } from '@/components/catalogue/LyricsPad'
import type { LyricBlockAuthor, LyricBlockSinger } from '@/components/catalogue/LyricBlockCard'
import type { DiaryFeedEntry } from '@/components/catalogue/DiaryFeed'
import type { RoomPresencePerson } from '@/lib/catalogue/room-presence'
import type {
  Work,
  WorkMember as WorkMemberRow,
  WorkVersion,
  LyricBlock,
  AiEntry,
  WorkDiaryEvent,
  PerformerRef,
} from '@/types/catalogue'

export const dynamic = 'force-dynamic'

// A generous but bounded first page — the diary's own volume view
// (pagination beyond this) is 37.2's job (see the threat model's
// T-37-77). This page renders one page of history, newest first.
const DIARY_PAGE_SIZE = 60

// ─── Guiding-line / hum-first state — cookies, not a migration ─────────
// The guiding-line resolver (lib/catalogue/guiding-line.ts) needs three
// durable facts this phase has nowhere else to put without a schema
// change: which
// steps this viewer has dismissed for this work, which contributors the
// splits nudge has already fired for, and whether the hum-first moment has
// already run for this song. 37.1 ships no dedicated column or table for
// any of the three — CONTEXT.md's own open item defers that to 37.2,
// alongside the destination doors, which will want their own per-work
// state too. Cookies are the simplest durable place that needs no
// migration: this Server Component only READS them (Server Components
// cannot set a cookie mid-render); components/catalogue/WorkPage.tsx (the
// client shell) is the one place that WRITES them, via document.cookie,
// after a dismiss / a hum-first completion, then calls router.refresh()
// so this page re-reads the update on the next render. Same shared-cookie
// SSR-reads/client-writes shape as lib/selects/viewer-cookie.ts.
function dismissedCookieName(workId: string) {
  return `catalogue_gl_dismissed_${workId}`
}
function firedCookieName(workId: string) {
  return `catalogue_gl_fired_${workId}`
}
function humFirstCookieName(workId: string) {
  return `catalogue_hum_first_${workId}`
}

function parseCookieList(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map(v => {
      try {
        return decodeURIComponent(v)
      } catch {
        return ''
      }
    })
    .filter(Boolean)
}

function initialOf(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim()
  return trimmed ? trimmed[0]!.toUpperCase() : '?'
}

export default async function WorkComposerPage({
  params,
}: {
  params: Promise<{ workId: string }>
}) {
  const { workId } = await params

  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/signin')

  // ─── Access FIRST, before anything else is loaded ────────────────────
  // A work the viewer is not on must be indistinguishable from a work
  // that does not exist — decideWorkAccess() (lib/catalogue/access.ts)
  // returns 404, never 403, for exactly that case, so the not-found path
  // is used here rather than an explanatory error page. 'contribute' is
  // the minimum tier this page requires: both tiers may view and add to
  // a work (migration 136's posture); only membership management
  // (WorkRoster's own internal gate) needs the administer tier.
  const access = await resolveWorkAccess(createWorkAccessDeps(supabase), workId, user.id, 'contribute')
  if (!access.granted) {
    if (access.status === 401) redirect('/signin')
    notFound()
  }

  // ─── One parallel pass — every entity this page needs ────────────────
  const [workRes, versionsRes, blocksRes, membersRes, aiEntriesRes, diaryRes, aiAccountCountRes, singerRosterRes, suggestionCountsRes, recordingSessionsRes] =
    await Promise.all([
      supabase.from('works').select('*').eq('id', workId).maybeSingle(),
      supabase
        .from('work_versions')
        .select('*')
        .eq('work_id', workId)
        .order('created_at', { ascending: true }),
      supabase
        .from('lyric_blocks')
        .select('*')
        .eq('work_id', workId)
        .order('position', { ascending: true }),
      supabase
        .from('work_members')
        .select('*')
        .eq('work_id', workId)
        .order('created_at', { ascending: true }),
      supabase
        .from('ai_entries')
        .select('*')
        .eq('work_id', workId)
        .order('created_at', { ascending: true }),
      supabase
        .from('work_diary_events')
        .select('*')
        .eq('work_id', workId)
        .order('created_at', { ascending: false })
        .limit(DIARY_PAGE_SIZE),
      // Account-wide, not work-scoped: AiEntryFlow's conversational-vs-
      // two-door split (isFirstEverAiEntry()) is a per-ACCOUNT pacing
      // decision, not a per-song one — a veteran's second song still gets
      // the fast form on their very first entry there.
      supabase.from('ai_entries').select('id', { count: 'exact', head: true }).eq('created_by', user.id),
      // My Roster is broader than this room. A singer may be cast without
      // ever receiving room access or becoming a writer on this work.
      supabase
        .from('collaborators')
        .select('id, name, claimed_by')
        .eq('user_id', user.id)
        .is('archived_at', null)
        .order('name', { ascending: true }),
      supabase
        .from('work_lyric_block_suggestions')
        .select('block_id')
        .eq('work_id', workId)
        .eq('status', 'pending')
        .limit(1000),
      supabase
        .from('work_recording_sessions')
        .select('base_version_id, rendered_version_id, status')
        .eq('work_id', workId)
        .eq('created_by', user.id),
    ])

  const workRow = workRes.data as Work | null
  if (!workRow) notFound() // defensive — access was already granted above
  // Re-bound to a non-null alias: TypeScript's control-flow narrowing does
  // not persist into the function declarations below that close over
  // `work` (a closure could in principle run after further reassignment),
  // even though this binding is a `const` that is never reassigned again.
  const work: Work = workRow

  const versions = (versionsRes.data ?? []) as WorkVersion[]
  const blocks = (blocksRes.data ?? []) as LyricBlock[]
  const members = (membersRes.data ?? []) as WorkMemberRow[]
  const aiEntries = (aiEntriesRes.data ?? []) as AiEntry[]
  const diaryRows = (diaryRes.data ?? []) as WorkDiaryEvent[]
  const priorAiEntryCount = aiAccountCountRes.count ?? 0
  const singerRoster = (singerRosterRes.data ?? []) as {
    id: string
    name: string
    claimed_by: string | null
  }[]
  const suggestionCounts: Record<string, number> = {}
  for (const row of ((suggestionCountsRes.data ?? []) as { block_id: string }[])) {
    suggestionCounts[row.block_id] = (suggestionCounts[row.block_id] ?? 0) + 1
  }
  const recordingSessions = (recordingSessionsRes.data ?? []) as {
    base_version_id: string
    rendered_version_id: string | null
    status: 'draft' | 'saved'
  }[]

  // ─── Display names — collaborator rows + the owner's own profile ─────
  const collaboratorIds = Array.from(
    new Set(members.map(m => m.collaborator_id).filter((id): id is string => Boolean(id)))
  )
  // Claimed collaborators (signed up → have a user_id) carry a profile
  // avatar; invited-but-unclaimed ones don't. The owner's avatar comes
  // from their own profile row (queried alongside their handle/name).
  const memberUserIds = Array.from(
    new Set(
      members
        .map(m => m.user_id)
        .filter((id): id is string => Boolean(id) && id !== work.user_id)
    )
  )
  const [{ data: collabRows }, { data: ownerProfile }, { data: memberAvatarRows }] = await Promise.all([
    collaboratorIds.length > 0
      ? supabase.from('collaborators').select('id, name').in('id', collaboratorIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    supabase.from('user_profiles').select('handle, artist_name, avatar_url').eq('id', work.user_id).maybeSingle(),
    memberUserIds.length > 0
      ? supabase.from('user_profiles').select('id, avatar_url').in('id', memberUserIds)
      : Promise.resolve({ data: [] as { id: string; avatar_url: string | null }[] }),
  ])
  const collabNameById = new Map((collabRows ?? []).map(c => [c.id, c.name]))
  const memberAvatarById = new Map(
    (memberAvatarRows ?? []).map(r => [r.id, r.avatar_url ?? null] as const)
  )
  const ownerHandle = ownerProfile?.handle || ownerProfile?.artist_name || 'artist'
  const ownerDisplayName = ownerProfile?.artist_name || ownerHandle

  function nameForMember(m: WorkMemberRow): string {
    if (!m.collaborator_id) return ownerDisplayName // the owner's own row
    return collabNameById.get(m.collaborator_id) ?? 'A collaborator'
  }

  // Avatar for a roster row: the owner's and a claimed collaborator's come
  // from their profiles; anyone still pending has none (initials monogram).
  function avatarFor(m: WorkMemberRow): string | null {
    if (!m.collaborator_id) return ownerProfile?.avatar_url ?? null
    if (m.user_id) return memberAvatarById.get(m.user_id) ?? null
    return null
  }

  // Every id describeDiaryEvent() or the pad's badges might need a
  // display name for — the owner's own user id, and every member's
  // collaborator id AND user id (once claimed, both point at the same
  // person, so both keys resolve to the same name).
  const namesById: Record<string, string> = { [work.user_id]: ownerDisplayName }
  for (const m of members) {
    const name = nameForMember(m)
    if (m.collaborator_id) namesById[m.collaborator_id] = name
    if (m.user_id) namesById[m.user_id] = name
  }

  // ─── The one service-role read besides URL signing (plan 05) ─────────
  // Precondition satisfied two statements above: access is already
  // resolved. This exists instead of a fourth RLS policy on the
  // recursion-sensitive split_sheets/split_sheet_parties pair — migration
  // 137's own header records why.
  const service = createServiceClient()
  const splitsSheet = await loadWorkSplits(service, workId)
  const songPassportAvailable = await isSongPassportAvailableForWork(service as unknown as SongPassportCohortClient, workId, user.id)
  const songPassport = songPassportAvailable
    ? await loadSongPassportView(service, {
        workId,
        viewerUserId: user.id,
        viewerTier: access.tier,
        viewerIsOwner: access.isOwner,
      })
    : undefined
  const sheetParties: PartyIdentity[] =
    splitsSheet?.parties.map(p => ({ collaboratorId: p.collaboratorId, userId: p.userId, name: p.name })) ?? []

  // ─── Signed playback URLs — ONE batch call, short TTL ─────────────────
  // A per-version signing loop would turn this page's render into N
  // storage calls; plan 06's batch URL signer (imported as a namespace so
  // its name appears exactly once in this file, at the call site below)
  // mints every URL this page and its diary need in a single request.
  const paths = versions.map(v => v.audio_path)
  const signedByPath = await CatalogueAudio.signVersionUrls(paths)

  // ─── Derived presentation — server-side, so the numbers a component
  // renders are byte-identical to what an export would produce ─────────
  // Block numerals and repeat resolution are deliberately NOT re-derived
  // here: components/catalogue/LyricsPad.tsx (plan 08) already calls
  // deriveBlockNumerals()/resolveRepeat() itself over the raw blocks this
  // page hands it — duplicating that walk here would risk the two
  // derivations drifting apart. Version numerals, by contrast, ARE needed
  // here (the diary and the versions column both need them, and neither
  // owns its own copy of work_versions), so they are derived once, below.
  const versionsWithNumerals = deriveVersionNumerals(versions)
  const versionNumerals: Record<string, number> = {}
  for (const v of versionsWithNumerals) versionNumerals[v.id] = v.numeral

  function resolveAuthorDisplay(authorUserId: string | null): LyricBlockAuthor | null {
    if (!authorUserId) return null
    const isOwner = authorUserId === work.user_id
    return {
      initial: initialOf(isOwner ? ownerDisplayName : namesById[authorUserId]),
      name: isOwner ? null : namesById[authorUserId] ?? 'Collaborator',
      isOwner,
    }
  }

  function resolveSingerDisplays(performers: PerformerRef[]): LyricBlockSinger[] {
    return (performers ?? []).map((p, i) => {
      const uid = p.userId ?? null
      const isOwner = p.kind === 'self' || (uid !== null && uid === work.user_id)
      const resolvedName =
        p.kind === 'guest' ? p.name ?? 'Guest' : namesById[uid ?? p.collaboratorId ?? ''] ?? p.name ?? 'Collaborator'
      return {
        key: uid ?? p.collaboratorId ?? `${p.name ?? 'guest'}-${i}`,
        initial: initialOf(isOwner ? ownerDisplayName : resolvedName),
        name: isOwner ? null : resolvedName,
        isOwner,
      }
    })
  }

  // A linked repeat's own author affordance is suppressed entirely
  // (LyricBlockCard's own contract) — attribution stays with the source
  // block, so this page passes null rather than the repeating row's own
  // (empty) author_user_id.
  const lyricsPadBlocks: LyricsPadBlock[] = blocks.map(b => ({
    ...b,
    authorDisplay: b.repeat_of_block_id ? null : resolveAuthorDisplay(b.author_user_id),
    singerDisplays: resolveSingerDisplays(b.performers),
  }))

  // ─── The diary — describeDiaryEvent() does the describing; this page
  // only adds the two facts no diary row carries (a React key, and a
  // version's signed playback URL) ─────────────────────────────────────
  const diaryContext: DiaryEventContext = { names: namesById, versionNumerals }
  const diaryEntries: DiaryFeedEntry[] = diaryRows.map(row => {
    const typed = row as DiaryEventRowLike
    const view = describeDiaryEvent(typed, diaryContext)
    // Only a hand-authored note, and only the viewer's own, may be removed
    // — the delete route enforces the same two facts server-side.
    const canRemove = view.kind === 'note' && typed.actor_user_id === user.id
    if (view.kind === 'version') {
      const payload = (row as { payload: { versionId?: string } }).payload
      const version = payload.versionId ? versions.find(v => v.id === payload.versionId) : undefined
      return {
        ...view,
        id: row.id,
        canRemove,
        versionNumeral: version ? versionNumerals[version.id] ?? null : null,
        playbackUrl: version ? signedByPath[version.audio_path] ?? null : null,
        playbackDurationSeconds: version?.duration_seconds ?? null,
      }
    }
    return { ...view, id: row.id, canRemove }
  })

  // ─── The versions column — newest first, matching sketch 001-C ───────
  const versionCards: VersionCardData[] = [...versionsWithNumerals].reverse().map(v => {
    const presentation = presentVersion(v)
    const isAiTagged = aiEntries.some(e => e.level === 'version' && e.version_id === v.id)
    const recordingSession = recordingSessions.find(session =>
      session.rendered_version_id === v.id || (session.status === 'draft' && session.base_version_id === v.id)
    )
    return {
      id: v.id,
      display: presentation.display,
      description: presentation.description,
      isAiTagged,
      playbackUrl: signedByPath[v.audio_path] ?? null,
      durationSeconds: v.duration_seconds,
      createdAt: v.created_at,
      source: v.source,
      archivedAt: v.archived_at ?? null,
      canManage: access.isOwner || v.user_id === user.id,
      recordingSessionStatus: recordingSession?.status ?? null,
    }
  })

  // ─── The guiding line's snapshot — assembled from data already fetched
  // above; the resolver itself performs no I/O of its own ──────────────
  const cookieStore = await cookies()
  const dismissedStepKeys = parseCookieList(cookieStore.get(dismissedCookieName(workId))?.value)
  const splitsNudgeFiredFor = parseCookieList(cookieStore.get(firedCookieName(workId))?.value)
  const humFirstFiredCookie = cookieStore.get(humFirstCookieName(workId))?.value === '1'

  function memberHasContributed(m: WorkMemberRow): boolean {
    // An unclaimed invitee (no user_id yet) cannot have authored anything
    // — every write in this codebase stamps the authenticated caller's own
    // id, and an invitee has none until they claim their roster row.
    if (!m.user_id) return false
    return blocks.some(b => b.author_user_id === m.user_id) || versions.some(v => v.user_id === m.user_id)
  }

  const partyMembers: SplitsWorkMember[] = members.map(m => ({
    collaboratorId: m.collaborator_id,
    userId: m.user_id,
    name: nameForMember(m),
    hasContributed: memberHasContributed(m),
  }))

  const guidingLineSnapshot: GuidingLineSnapshot = {
    versionCount: versions.length,
    blockCount: blocks.length,
    members: partyMembers,
    writersMissingFromSheet: writersMissingFromSheet(partyMembers, sheetParties),
    unresolvedAiEntries: aiEntries.filter(e => e.mode === 'generate').length,
    dismissedStepKeys,
    splitsNudgeFiredFor,
    // 37.1 ships no per-artist reminder-setting surface — that pairs with
    // the destination doors in 37.2. Until it exists, the courtesy line
    // always shows (never silenced).
    splitReminderSetting: 'on',
    // Only the owner can put themselves on the sheet (the roster self-add is
    // owner-only), so only the owner gets the first-person "add yourself"
    // treatment; every other viewer sees the ordinary third-person nudge.
    viewerIdentityKey:
      user && user.id === work.user_id
        ? identityKey({ collaboratorId: null, userId: user.id, name: '' })
        : undefined,
  }

  const isEmpty = versions.length === 0 && blocks.length === 0
  // The empty state IS the guidance (sketch 005-C) — no guiding line is
  // resolved at all for a brand-new work, so the same "start with a hum"
  // sentence never appears twice on one screen.
  const guidingLineStep = isEmpty ? null : CatalogueGuidingLine.resolveGuidingLine(guidingLineSnapshot)

  // ─── The roster — membership vs. the living split sheet, two facts ───
  const rosterMembers: WorkRosterMember[] = members.map(m => {
    const isOwner = !m.collaborator_id
    // Match against the full sheet party (which carries the designation),
    // not the identity-only `sheetParties` used for the nudge math.
    const party = (splitsSheet?.parties ?? []).find(
      p =>
        (m.collaborator_id && p.collaboratorId === m.collaborator_id) ||
        (m.user_id && p.userId === m.user_id)
    )
    return {
      id: m.id,
      collaboratorId: m.collaborator_id,
      name: nameForMember(m),
      avatarUrl: avatarFor(m),
      tier: m.tier,
      isOwner,
      isPending: !isOwner && !m.user_id,
      isOnSheet: !!party,
      isWriterBadge: !!party,
      writerDesignation: party?.writerDesignation ?? null,
    }
  })

  const contributorNames = Array.from(
    new Set(members.filter(m => m.collaborator_id).map(nameForMember))
  )

  // Realtime payloads deliberately carry no identity details. This trusted,
  // access-checked server roster is the only source of names and avatars in
  // the live room panel. Pending invitees have no user session and therefore
  // cannot be present yet.
  const presenceByUserId = new Map<string, RoomPresencePerson>()
  for (const member of members) {
    if (!member.user_id) continue
    presenceByUserId.set(member.user_id, {
      userId: member.user_id,
      name: nameForMember(member),
      avatarUrl: avatarFor(member),
      isViewer: member.user_id === user.id,
    })
  }
  if (!presenceByUserId.has(work.user_id)) {
    presenceByUserId.set(work.user_id, {
      userId: work.user_id,
      name: ownerDisplayName,
      avatarUrl: ownerProfile?.avatar_url ?? null,
      isViewer: work.user_id === user.id,
    })
  }
  const presencePeople = Array.from(presenceByUserId.values())
  const presenceViewer = presenceByUserId.get(user.id) ?? {
    userId: user.id,
    name: namesById[user.id] ?? 'Collaborator',
    avatarUrl: memberAvatarById.get(user.id) ?? null,
    isViewer: true,
  }
  const singerCandidates = buildSingerCandidates({
    viewer: { userId: user.id, name: presenceViewer.name },
    room: members.map(member => ({
      userId: member.user_id,
      collaboratorId: member.collaborator_id,
      name: nameForMember(member),
    })),
    roster: singerRoster.map(person => ({
      userId: person.claimed_by,
      collaboratorId: person.id,
      name: person.name,
    })),
  })

  function labelForPerformerRef(ref: PerformerRef | null): string | null {
    if (!ref) return null
    if (ref.kind === 'self') return ownerHandle
    if (ref.kind === 'guest') return ref.name ?? null
    const collabName = ref.collaboratorId ? collabNameById.get(ref.collaboratorId) : null
    return collabName ?? ref.name ?? null
  }

  // loadWorkSplits() only ever returns a LIVING-DRAFT sheet (status in
  // 'draft'/'countered') — the one accessor this plan is told to use. A
  // sheet this work's owner has since sent for approval or executed
  // through the separate, pre-existing split-sheet flow elsewhere in the
  // app reads here as 'none' rather than its real status. That is a known
  // limitation of reusing the single 37.1 accessor rather than adding a
  // second read, not an oversight — see this plan's own SUMMARY.
  const splitsStatus = splitsSheet?.status ?? 'none'

  return (
    <>
      <Topbar title={work.title} subtitle="Unreleased work — The Writer's Room">
        <Link href="/vault" className="text-sm text-white/60 transition hover:text-white">
          ← Sound Vault
        </Link>
      </Topbar>
      <div className="mx-auto max-w-5xl px-6 py-8 sm:px-9">
        <WorkPage
          workId={work.id}
          songTitle={work.title}
          isEmpty={isEmpty}
          header={{
            title: work.title,
            ownerHandle,
            contributorNames,
            splitsStatus,
            vocalState: work.vocal_state,
            primaryPerformerLabel: labelForPerformerRef(work.primary_performer),
            canEdit: true, // both tiers may edit content — administer is membership-only (136's posture)
          }}
          roster={{
            members: rosterMembers,
            // `access` is narrowed to the granted branch here — every
            // `!access.granted` path above ends in `redirect()`/`notFound()`,
            // both typed `never`.
            viewerTier: access.tier,
            viewerIsOwner: access.isOwner,
          }}
          singerCandidates={singerCandidates}
          presence={{ viewer: presenceViewer, people: presencePeople }}
          guidingLineStep={guidingLineStep}
          diaryEntries={diaryEntries}
          versions={versionCards}
          lyricsBlocks={lyricsPadBlocks}
          suggestionCounts={suggestionCounts}
          vocalState={work.vocal_state}
          priorAiEntryCount={priorAiEntryCount}
          hasHumFirstFired={humFirstFiredCookie || aiEntries.length > 0}
          songPassport={songPassport}
        />
      </div>
    </>
  )
}
