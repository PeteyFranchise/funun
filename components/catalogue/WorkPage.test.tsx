import { renderToStaticMarkup } from 'react-dom/server'
import { WorkPage, Toast, type VersionCardData, type WorkPageProps } from './WorkPage'
import type { GuidingLineStep } from '@/lib/catalogue/guiding-line'
import type { LyricsPadBlock } from './LyricsPad'
import type { DiaryFeedEntry } from './DiaryFeed'
import type { StudioNoteThreadView } from '@/types/catalogue'

// No jsdom in this repo (testEnvironment: 'node') — asserted as static
// markup, same treatment as every other components/catalogue/*.test.tsx
// suite in this phase.
//
// WorkPage calls next/navigation's useRouter() (it originates writes —
// same "component owns its own mutation" shape as WorkHeader/WorkRoster),
// which throws outside an AppRouterContext provider. Mocked here, matching
// components/handles/ChooseHandleGate.test.tsx's own precedent for exactly
// this constraint.
jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: jest.fn(), push: jest.fn() }),
}))

const baseHeader: WorkPageProps['header'] = {
  title: 'Midnight',
  ownerHandle: 'peterzora',
  contributorNames: ['Ben Cooke'],
  splitsStatus: 'draft',
  vocalState: 'primary',
  primaryPerformerLabel: 'peterzora',
  canEdit: true,
}

const administerRoster: WorkPageProps['roster'] = {
  members: [
    {
      id: 'm1',
      name: 'peterzora',
      tier: 'administer',
      isOwner: true,
      isPending: false,
      isOnSheet: true,
      isWriterBadge: true,
    },
    {
      id: 'm2',
      name: 'Ben Cooke',
      tier: 'contribute',
      isOwner: false,
      isPending: false,
      isOnSheet: false,
      isWriterBadge: false,
    },
  ],
  viewerTier: 'administer',
  viewerIsOwner: true,
}

const contributeRoster: WorkPageProps['roster'] = {
  members: administerRoster.members,
  viewerTier: 'contribute',
  viewerIsOwner: false,
}

// A valid 200-length peaks array (isValidPeaksPayload's own bar count) —
// exercises the real plumbing path rather than falling back to the rest
// state's own validator gate.
const SAMPLE_PEAKS = Array.from({ length: 200 }, (_, i) => i % 100)

const baseVersions: VersionCardData[] = [
  {
    id: 'v1',
    display: 'v1',
    description: 'Scratch hum',
    isAiTagged: false,
    playbackUrl: 'https://signed.example/v1.webm',
    downloadUrl: 'https://signed.example/v1.webm?download=Midnight-v1.webm',
    durationSeconds: 42,
    createdAt: '2026-01-01T00:00:00Z',
    source: 'upload',
    peaks: SAMPLE_PEAKS,
  },
]

const baseBlocks: LyricsPadBlock[] = [
  {
    id: 'b1',
    work_id: 'work-1',
    block_type: 'verse',
    custom_label: null,
    position: 0,
    text: 'la la la',
    author_kind: 'human',
    author_user_id: 'user-1',
    performers: [],
    repeat_of_block_id: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    authorDisplay: { initial: 'P', name: null, isOwner: true },
    singerDisplays: [],
  },
]

const baseDiary: DiaryFeedEntry[] = [
  {
    id: 'd1',
    kind: 'version',
    headline: 'v1 — hum recorded',
    consequence: "A hum's timestamp is the authorship evidence.",
    date: '2026-01-01T00:00:00Z',
    accent: 'brandindigo',
    versionNumeral: 1,
    playbackUrl: 'https://signed.example/v1.webm',
    playbackDurationSeconds: 42,
  },
]

const HUM_TO_CLAIM_STEP: GuidingLineStep = {
  key: 'hum_to_claim',
  headline: 'Protect your melody — hum it in',
  actionLabel: 'Hum it in',
  actionTarget: 'hum',
}

function makeProps(overrides: Partial<WorkPageProps> = {}): WorkPageProps {
  return {
    workId: 'work-1',
    songTitle: 'Midnight',
    isEmpty: false,
    header: baseHeader,
    roster: administerRoster,
    singerCandidates: [
      {
        key: 'user:user-1',
        name: 'peterzora',
        source: 'self',
        performer: { kind: 'self', userId: 'user-1', name: 'peterzora' },
      },
      {
        key: 'user:user-2',
        name: 'Ben Cooke',
        source: 'room',
        performer: { kind: 'collaborator', userId: 'user-2', name: 'Ben Cooke' },
      },
    ],
    presence: {
      viewer: { userId: 'user-1', name: 'peterzora', avatarUrl: null, isViewer: true },
      people: [
        { userId: 'user-1', name: 'peterzora', avatarUrl: null, isViewer: true },
        { userId: 'user-2', name: 'Ben Cooke', avatarUrl: null, isViewer: false },
      ],
    },
    guidingLineStep: null,
    diaryEntries: baseDiary,
    versions: baseVersions,
    lyricsBlocks: baseBlocks,
    vocalState: 'primary',
    priorAiEntryCount: 3,
    hasHumFirstFired: true,
    ...overrides,
  }
}

// ─── Studio Notes scoped by kind (261004-snk) ──────────────────────────
// One thread per kind, unresolved, with a distinctive body each so a test
// can assert a body is shown (or conspicuously absent) without depending
// on any other fixture text.
const songThread: StudioNoteThreadView = {
  id: 'note-song-1',
  source: 'song',
  parentId: null,
  body: 'SONG_NOTE_BODY_UNIQUE',
  author: null,
  recipients: [],
  resolvedAt: null,
  resolvedByName: null,
  createdAt: '2026-01-01T00:00:00Z',
  context: { kind: 'song', label: 'Whole song' },
  canResolve: false,
  reactions: [],
  replies: [],
}

const audioThread: StudioNoteThreadView = {
  id: 'note-audio-1',
  source: 'audio',
  parentId: null,
  body: 'AUDIO_NOTE_BODY_UNIQUE',
  author: null,
  recipients: [],
  resolvedAt: null,
  resolvedByName: null,
  createdAt: '2026-01-01T00:01:00Z',
  context: { kind: 'audio', label: 'v1 · 0:05', versionId: 'v1', timestampMs: 5000 },
  canResolve: false,
  reactions: [],
  replies: [],
}

const lyricThread: StudioNoteThreadView = {
  id: 'note-lyric-1',
  source: 'lyrics',
  parentId: null,
  body: 'LYRIC_NOTE_BODY_UNIQUE',
  author: null,
  recipients: [],
  resolvedAt: null,
  resolvedByName: null,
  createdAt: '2026-01-01T00:02:00Z',
  context: { kind: 'lyrics', label: 'Verse 1', blockId: 'b1' },
  canResolve: false,
  reactions: [],
  replies: [],
}

describe('WorkPage — Studio Notes scoped by kind', () => {
  it('shows only the song thread in the Studio Notes module, and counts only it', () => {
    const markup = renderToStaticMarkup(
      <WorkPage {...makeProps({ studioNotes: [songThread, audioThread, lyricThread] })} />
    )
    expect(markup).toContain('SONG_NOTE_BODY_UNIQUE')
    expect(markup).not.toContain('AUDIO_NOTE_BODY_UNIQUE')
    expect(markup).not.toContain('LYRIC_NOTE_BODY_UNIQUE')
    expect(markup).toContain('1 open thread')
    expect(markup).not.toContain('3 open threads')
  })

  it('reads 0 open threads when there are no unresolved song threads, even with unresolved audio and lyric threads', () => {
    const resolvedSong: StudioNoteThreadView = { ...songThread, resolvedAt: '2026-01-01T00:05:00Z', resolvedByName: 'Shane' }
    const markup = renderToStaticMarkup(
      <WorkPage {...makeProps({ studioNotes: [resolvedSong, audioThread, lyricThread] })} />
    )
    expect(markup).toContain('0 open threads')
  })

  it('agrees on plural for two unresolved song threads', () => {
    const secondSong: StudioNoteThreadView = { ...songThread, id: 'note-song-2', body: 'SONG_NOTE_BODY_TWO', createdAt: '2026-01-01T00:03:00Z' }
    const markup = renderToStaticMarkup(
      <WorkPage {...makeProps({ studioNotes: [songThread, secondSong] })} />
    )
    expect(markup).toContain('2 open threads')
  })

  it('names unresolved audio-comment threads across active and archived takes in the Versions description', () => {
    const archivedVersion: VersionCardData = {
      ...baseVersions[0]!,
      id: 'v0',
      display: 'v0',
      description: 'Old demo',
      archivedAt: '2026-01-02T00:00:00Z',
      canManage: false,
    }
    const audioOnActive: StudioNoteThreadView = {
      ...audioThread,
      id: 'note-audio-active',
      context: { kind: 'audio', label: 'v1 · 0:05', versionId: 'v1', timestampMs: 5000 },
    }
    const audioOnArchived: StudioNoteThreadView = {
      ...audioThread,
      id: 'note-audio-archived',
      context: { kind: 'audio', label: 'v0 · 0:10', versionId: 'v0', timestampMs: 10000 },
    }
    const markup = renderToStaticMarkup(
      <WorkPage
        {...makeProps({
          versions: [baseVersions[0]!, archivedVersion],
          studioNotes: [audioOnActive, audioOnArchived],
        })}
      />
    )
    expect(markup).toContain('1 active take · 2 unresolved comments')
  })

  it('keeps the Versions description byte-identical to before when there are no unresolved audio threads', () => {
    // The exact-close assertion below is what makes this byte-identical:
    // any appended " · N unresolved comment(s)" clause would land before
    // the closing tag and break the match. (TimedTrackPlayer separately
    // renders its own "0 unresolved comments" line regardless of this
    // description — unrelated pre-existing text, not asserted against here.)
    const markup = renderToStaticMarkup(<WorkPage {...makeProps()} />)
    expect(markup).toContain('>1 active take<')
  })

  it('shows the per-take unresolved count only on the archived row that has one', () => {
    const archivedWithNote: VersionCardData = {
      ...baseVersions[0]!,
      id: 'v0',
      display: 'v0',
      description: 'Old demo',
      archivedAt: '2026-01-02T00:00:00Z',
      canManage: false,
    }
    const archivedWithoutNote: VersionCardData = {
      ...baseVersions[0]!,
      id: 'v-2',
      display: 'v-2',
      description: 'Another old demo',
      archivedAt: '2026-01-03T00:00:00Z',
      canManage: false,
    }
    const audioOnArchived: StudioNoteThreadView = {
      ...audioThread,
      id: 'note-audio-archived-row',
      context: { kind: 'audio', label: 'v0 · 0:10', versionId: 'v0', timestampMs: 10000 },
    }
    const markup = renderToStaticMarkup(
      <WorkPage
        {...makeProps({
          versions: [baseVersions[0]!, archivedWithNote, archivedWithoutNote],
          studioNotes: [audioOnArchived],
        })}
      />
    )
    const archivedSection = markup.slice(markup.indexOf('Archived takes'))
    const oldDemoIndex = archivedSection.indexOf('Old demo')
    const anotherOldDemoIndex = archivedSection.indexOf('Another old demo')
    expect(oldDemoIndex).toBeGreaterThan(-1)
    expect(anotherOldDemoIndex).toBeGreaterThan(oldDemoIndex)
    const withNoteRow = archivedSection.slice(oldDemoIndex, anotherOldDemoIndex)
    const withoutNoteRow = archivedSection.slice(anotherOldDemoIndex)
    expect(withNoteRow).toContain('1 unresolved comment')
    expect(withoutNoteRow).not.toContain('unresolved')
  })

  it('renders an unresolved count on a lyric block’s own Comments control, matching the Studio Notes count for that block', () => {
    const lyricOnBlockFirst: StudioNoteThreadView = { ...lyricThread, id: 'note-lyric-a' }
    const lyricOnBlockSecond: StudioNoteThreadView = { ...lyricThread, id: 'note-lyric-b', createdAt: '2026-01-01T00:03:00Z' }
    const markup = renderToStaticMarkup(
      <WorkPage {...makeProps({ studioNotes: [lyricOnBlockFirst, lyricOnBlockSecond] })} />
    )
    expect(markup).toContain('💬 Comments (2)')
  })

  it('renders the lyric block’s Comments control exactly as today when it has no unresolved threads', () => {
    const markup = renderToStaticMarkup(<WorkPage {...makeProps()} />)
    expect(markup).toContain('💬 Comments<')
    expect(markup).not.toContain('💬 Comments (')
  })

  // The deep-link routing itself fires from a useEffect (D-SNK-05), which
  // this harness cannot observe — renderToStaticMarkup never runs effects.
  // That decision is already covered by resolveLyricNoteDeepLink's own
  // cases in lib/catalogue/studio-notes.test.ts. What this harness CAN
  // assert is that supplying a lyric-kind highlightedStudioNoteId renders
  // no crash and does not highlight anything inside the (now song-only)
  // Studio Notes module, since the id will never match a song thread.
  it('does not crash or highlight anything in Studio Notes for a lyric-kind highlightedStudioNoteId', () => {
    const markup = renderToStaticMarkup(
      <WorkPage
        {...makeProps({
          studioNotes: [songThread, lyricThread],
          highlightedStudioNoteId: lyricThread.id,
        })}
      />
    )
    expect(markup).toContain('SONG_NOTE_BODY_UNIQUE')
    expect(markup).not.toContain(`border-brandindigo ring-2 ring-brandindigo/20`)
  })
})

describe('WorkPage', () => {
  it('renders the header, the composer card, the diary and the versions list for a populated work', () => {
    const markup = renderToStaticMarkup(<WorkPage {...makeProps()} />)
    expect(markup).toContain('aria-label="Song title"') // WorkHeader's live title input
    expect(markup).toContain('Add to this song') // ComposerCard
    expect(markup).toContain('Scratch hum') // the versions column
    expect(markup).toContain('v1 — hum recorded') // DiaryFeed
  })

  it('orders the page composer-first, guiding line second, diary after (005-C)', () => {
    const markup = renderToStaticMarkup(<WorkPage {...makeProps({ guidingLineStep: HUM_TO_CLAIM_STEP })} />)
    const composerIndex = markup.indexOf('Add to this song')
    const guidingLineIndex = markup.indexOf(HUM_TO_CLAIM_STEP.headline)
    const diaryIndex = markup.indexOf('v1 — hum recorded')
    expect(composerIndex).toBeGreaterThan(-1)
    expect(guidingLineIndex).toBeGreaterThan(composerIndex)
    expect(diaryIndex).toBeGreaterThan(guidingLineIndex)
  })

  it('renders exactly one guiding line when a step was supplied, and none when null was supplied', () => {
    const withStep = renderToStaticMarkup(<WorkPage {...makeProps({ guidingLineStep: HUM_TO_CLAIM_STEP })} />)
    const matches = withStep.match(/Protect your melody — hum it in/g) ?? []
    expect(matches).toHaveLength(1)

    const withoutStep = renderToStaticMarkup(<WorkPage {...makeProps({ guidingLineStep: null })} />)
    expect(withoutStep).not.toContain(HUM_TO_CLAIM_STEP.headline)
  })

  it('renders the empty-state hero and no guiding line for a work with no versions and no blocks', () => {
    const markup = renderToStaticMarkup(
      <WorkPage
        {...makeProps({
          isEmpty: true,
          versions: [],
          lyricsBlocks: [],
          diaryEntries: [],
          guidingLineStep: HUM_TO_CLAIM_STEP, // even if the resolver returned one, isEmpty suppresses it
        })}
      />
    )
    expect(markup).toContain('Start your song')
    // Node has no MediaRecorder, so the first tile truthfully degrades to
    // upload in this static render; ComposerCard's own supported-browser
    // test asserts that the same tile says “Hum it” in production.
    expect(markup).toContain('Upload it')
    expect(markup).toContain('Write lyrics')
    expect(markup).toContain('Add audio')
    expect(markup).toContain('Note')
    expect(markup).not.toContain(HUM_TO_CLAIM_STEP.headline)
  })

  it('still spends exactly one gradient on the empty state, even for a canManage (administer) viewer', () => {
    // Regression guard: WorkRoster (mounted for a canManage viewer) spends
    // its own bg-grad on "Send invite" the moment it renders. Left mounted
    // on the empty state, that would double the single-gradient budget
    // alongside ComposerCardEmptyState's own hero button — this is why
    // WorkPage suppresses WorkRoster entirely while isEmpty is true.
    const markup = renderToStaticMarkup(
      <WorkPage {...makeProps({ isEmpty: true, versions: [], lyricsBlocks: [], diaryEntries: [] })} />
    )
    const matches = markup.match(/\bbg-grad\b(?!ient)/g) ?? []
    expect(matches).toHaveLength(1)
    expect(markup).not.toContain('Add a collaborator')
  })

  it('renders a play control only when a version carries a signed URL, and none when it does not', () => {
    const withUrl = renderToStaticMarkup(<WorkPage {...makeProps()} />)
    expect(withUrl).toContain('<audio')

    const withoutUrl = renderToStaticMarkup(
      <WorkPage {...makeProps({ versions: [{ ...baseVersions[0]!, playbackUrl: null, downloadUrl: null }] })} />
    )
    expect(withoutUrl).not.toContain('<audio')
  })

  it('plumbs peaks from the version card to the player — a take with peaks renders different markup than one without', () => {
    const withPeaks = renderToStaticMarkup(<WorkPage {...makeProps()} />)
    const withoutPeaks = renderToStaticMarkup(
      <WorkPage {...makeProps({ versions: [{ ...baseVersions[0]!, peaks: null }] })} />
    )
    expect(withPeaks).not.toBe(withoutPeaks)
  })

  it('offers Lyric Lift on uploaded audio and renders a review draft beside the pad', () => {
    const markup = renderToStaticMarkup(
      <WorkPage
        {...makeProps({
          lyricLift: {
            id: 'lift-1',
            workId: 'work-1',
            versionId: 'v1',
            status: 'review',
            language: 'en',
            errorMessage: null,
            createdAt: '2026-01-01T00:00:00Z',
            completedAt: '2026-01-01T00:01:00Z',
            appliedAt: null,
            sections: [{
              id: '11111111-1111-4111-8111-111111111111',
              position: 0,
              blockType: 'verse',
              customLabel: null,
              text: 'I came in through the side door',
              startMs: 15000,
              endMs: 31000,
              confidence: 0.51,
              needsReview: true,
              included: true,
              repeatOfSectionId: null,
            }],
          },
        })}
      />
    )
    expect(markup).toContain('>Lyric Lift<')
    expect(markup).toContain('Your lyric draft is ready to review')
    expect(markup).toContain('▶ 0:15')
    expect(markup).toContain('Check this')
    expect(markup).toContain('current lyrics stay exactly where they are')
    expect(markup).toContain('Add 1 section to Lyric Blocks')
  })

  it('offers private downloads for active and archived takes without changing archive authority', () => {
    const markup = renderToStaticMarkup(
      <WorkPage
        {...makeProps({
          versions: [
            baseVersions[0]!,
            {
              ...baseVersions[0]!,
              id: 'v0',
              display: 'v0',
              description: 'Old demo',
              archivedAt: '2026-01-02T00:00:00Z',
              canManage: false,
              downloadUrl: 'https://signed.example/v0.wav?download=Midnight-v0-Old-demo.wav',
            },
          ],
        })}
      />
    )
    expect(markup).toContain('aria-label="Download v1 Scratch hum"')
    expect(markup).toContain('aria-label="Download archived v0 Old demo"')
    expect(markup).toContain('Archived takes (1)')
    expect(markup).not.toContain('>Restore<')
  })

  it('offers version comparison only when two takes are playable', () => {
    const oneTake = renderToStaticMarkup(<WorkPage {...makeProps()} />)
    expect(oneTake).not.toContain('Compare two takes')

    const twoTakes = renderToStaticMarkup(
      <WorkPage
        {...makeProps({
          versions: [
            { ...baseVersions[0]!, id: 'v2', display: 'v2', description: 'New mix', createdAt: '2026-01-02T00:00:00Z' },
            baseVersions[0]!,
          ],
        })}
      />
    )
    expect(twoTakes).toContain('Compare two takes')

    const onePlayable = renderToStaticMarkup(
      <WorkPage
        {...makeProps({
          versions: [baseVersions[0]!, { ...baseVersions[0]!, id: 'v0', playbackUrl: null }],
        })}
      />
    )
    expect(onePlayable).not.toContain('Compare two takes')
  })

  it('puts the shared working take first without renumbering the versions', () => {
    const markup = renderToStaticMarkup(
      <WorkPage
        {...makeProps({
          versions: [
            { ...baseVersions[0]!, id: 'v3', display: 'v3', description: 'Newest take', createdAt: '2026-01-03T00:00:00Z' },
            { ...baseVersions[0]!, id: 'v2', display: 'v2', description: 'Working hook', createdAt: '2026-01-02T00:00:00Z', isWorking: true },
          ],
        })}
      />
    )
    expect(markup).toContain('Working take')
    expect(markup.indexOf('v2 Working hook')).toBeLessThan(markup.indexOf('v3 Newest take'))
  })

  it('offers a returned-mix decision without turning it into a gate', () => {
    const markup = renderToStaticMarkup(
      <WorkPage
        {...makeProps({
          returnedMixReviews: [{
            returnId: 'return-1',
            versionId: 'v2',
            versionDisplay: 'v2',
            versionLabel: 'Drums up mix',
            producerName: 'Ben Cooke',
            note: 'Try the hook against this one.',
            returnedAt: '2026-09-03T10:00:00Z',
            isWorking: false,
          }],
          versions: [
            { ...baseVersions[0]!, id: 'v2', display: 'v2', description: 'Drums up mix', createdAt: '2026-01-02T00:00:00Z' },
            { ...baseVersions[0]!, isWorking: true },
          ],
        })}
      />
    )
    expect(markup).toContain('Ben Cooke brought back “Drums up mix”')
    expect(markup).toContain('Compare with working take')
    expect(markup).toContain('Make this the working take')
    expect(markup).toContain('Keep current working take')
    expect(markup).toContain('>Later<')
    expect(markup).toContain('never blocks writing, recording, comments, or another upload')
  })

  it('surfaces alternate lyric suggestions on original sections', () => {
    const markup = renderToStaticMarkup(
      <WorkPage {...makeProps({ suggestionCounts: { b1: 2 } })} />
    )
    expect(markup).toContain('Suggest alternate lyrics for Verse')
    expect(markup).toContain('Alternates (2)')
  })

  // 261004-wr2 slice 2: Takes/Diary/Notes left the canvas and became real
  // tabs (WriterRoomTabs) — this replaces the retired hybrid-grid
  // assertion above. The hybrid grid itself (data-writer-room-grid,
  // per-module drag handles, "Snap lyrics together") only ever renders
  // from LyricsPad's `hybridEnabled` branch (`roomModules.length > 0`),
  // which WorkPage now permanently keeps off by passing it no roomModules
  // — dead code until Slice 4 retires it, unreachable from here either way.
  it('moves Takes, Diary, and Notes above the canvas as tabs, leaving the lyric canvas blocks-only', () => {
    const markup = renderToStaticMarkup(<WorkPage {...makeProps()} />)
    expect(markup).toMatch(/role="tablist"/)
    expect(markup).toContain('>Takes<')
    expect(markup).toContain('>Diary<')
    expect(markup).toContain('>Notes<')
    expect(markup).not.toContain('data-writer-room-grid')
    expect(markup).not.toContain('Snap lyrics together')
    expect(markup).not.toContain('aria-label="Drag to move Versions"')
    expect(markup).not.toContain('aria-label="Drag to move Diary"')
  })

  // The three panel-wrapper divs WriterRoomTabs renders for Takes/Diary/
  // Notes carry EXACTLY `class=""` (active) or `class="hidden"` (inactive)
  // — no other class is ever mixed in (confirmed against the real render;
  // WriterRoomTabs' own door-chrome wrapper always carries additional
  // breakpoint classes, so this literal string never matches it). Default:
  // Takes active, Diary and Notes hidden.
  it('shows the Takes tab panel by default and keeps Diary/Notes hidden', () => {
    const markup = renderToStaticMarkup(<WorkPage {...makeProps()} />)
    const activeIndex = markup.indexOf('<div class="">')
    const hiddenIndices = [...markup.matchAll(/<div class="hidden">/g)].map(m => m.index!)
    expect(activeIndex).toBeGreaterThan(-1)
    expect(hiddenIndices.length).toBeGreaterThanOrEqual(2)
    // Takes' panel (the active one) renders before Diary's and Notes'
    // (both hidden) — document order matches the Takes/Diary/Notes item
    // order passed to WriterRoomTabs.
    expect(activeIndex).toBeLessThan(hiddenIndices[0]!)
  })

  // Done criterion for 261004-wr2 slice 2: a notification's
  // highlightedStudioNoteId deep link must render the Notes tab's panel
  // active (no hidden class), not merely scroll to a ref CSS now hides.
  it('renders the Notes tab panel active (not hidden) when highlightedStudioNoteId targets a song thread', () => {
    const markup = renderToStaticMarkup(
      <WorkPage {...makeProps({ studioNotes: [songThread], highlightedStudioNoteId: songThread.id })} />
    )
    const activeIndex = markup.indexOf('<div class="">')
    const noteBodyIndex = markup.indexOf('SONG_NOTE_BODY_UNIQUE')
    expect(activeIndex).toBeGreaterThan(-1)
    expect(noteBodyIndex).toBeGreaterThan(activeIndex)
    // And the two OTHER panels (Takes, Diary) are the ones now hidden.
    const hiddenIndices = [...markup.matchAll(/<div class="hidden">/g)].map(m => m.index!)
    expect(hiddenIndices.length).toBeGreaterThanOrEqual(2)
    expect(hiddenIndices[0]).toBeLessThan(activeIndex)
  })

  // Done criterion for 261004-wr2 slice 3: selecting the right tab isn't
  // enough on a phone — the shared panel container also sits behind a
  // closed door (WriterRoomTabs' own `doorOpen` state) until something
  // opens it. A page-load deep link must not land invisible behind a door
  // nobody tapped.
  it('opens the mobile door on first render when highlightedStudioNoteId targets a song thread', () => {
    const markup = renderToStaticMarkup(
      <WorkPage {...makeProps({ studioNotes: [songThread], highlightedStudioNoteId: songThread.id })} />
    )
    expect(markup).toMatch(/<div class="fixed inset-0[^"]*lg:static/)
    expect(markup).not.toMatch(/<div class="hidden lg:static/)
  })

  it('leaves the mobile door closed on the default render, with no deep link', () => {
    const markup = renderToStaticMarkup(<WorkPage {...makeProps()} />)
    expect(markup).toMatch(/<div class="hidden lg:static/)
    expect(markup).not.toMatch(/<div class="fixed inset-0/)
  })

  it('spends exactly one gradient on the default render', () => {
    // administerRoster puts a canManage viewer on the page, whose
    // WorkRoster "Send invite" button is this render's one legitimate
    // gradient spend (ComposerCard's non-empty treatment spends none;
    // GuidingLine never spends the full bg-grad — see that component's
    // own test). Word-boundary match so "bg-gradient-to-r" (GuidingLine's
    // faint wash) is never mistaken for "bg-grad" itself.
    const markup = renderToStaticMarkup(<WorkPage {...makeProps()} />)
    const matches = markup.match(/\bbg-grad\b(?!ient)/g) ?? []
    expect(matches).toHaveLength(1)
  })

  it('renders no destination-door chips — those are 37.2', () => {
    const markup = renderToStaticMarkup(<WorkPage {...makeProps()} />)
    expect(markup).not.toContain('Crate ✓')
    expect(markup).not.toContain('Dist ✓')
    expect(markup).not.toMatch(/Registration|Distribution door/)
  })

  it('contains no raw hex colour', () => {
    const markup = renderToStaticMarkup(<WorkPage {...makeProps()} />)
    expect(markup).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })

  it("renders no membership-management control for a contribute-tier viewer", () => {
    const markup = renderToStaticMarkup(<WorkPage {...makeProps({ roster: contributeRoster })} />)
    expect(markup).not.toContain('Add a collaborator')
    expect(markup).not.toContain('Mark as writer')
  })

  // The machine-checkable form of "the diary stays clean" (005-C). No
  // active hygiene flow and no guiding line are supplied, so the diary is
  // the only additive surface being asserted against. A play control (a
  // real `<audio>` element) is NOT a nudge — it is playback, present in
  // the sketches themselves; what must never appear on a diary row is a
  // call-to-action (re-author, add-to-sheet, a fix, a warning). This is
  // the rule most likely to be eroded by a later well-meant change.
  it('renders no nudge affordance anywhere in the diary', () => {
    const markup = renderToStaticMarkup(<WorkPage {...makeProps({ guidingLineStep: null })} />)
    expect(markup).not.toContain('Re-author')
    expect(markup).not.toContain('Add to the sheet')
    expect(markup).not.toContain('Keep as-is')
  })

  it('does not show a toast until something triggers one', () => {
    const markup = renderToStaticMarkup(<WorkPage {...makeProps()} />)
    expect(markup).not.toContain('Saved to the diary')
  })
})

describe('Toast', () => {
  const noop = () => {}

  it('renders its message with a View jump and a dismiss control', () => {
    const markup = renderToStaticMarkup(
      <Toast message="Saved to the diary" onView={noop} onDismiss={noop} />
    )
    expect(markup).toContain('Saved to the diary')
    expect(markup).toContain('View')
    expect(markup).toContain('aria-label="Dismiss"')
  })

  it('renders the message as escaped text, never as live HTML (audit L-01)', () => {
    const markup = renderToStaticMarkup(
      <Toast message="<img src=x onerror=alert(1)>" onView={noop} onDismiss={noop} />
    )
    expect(markup).not.toContain('<img src=x')
    expect(markup).toContain('&lt;img')
  })
})
