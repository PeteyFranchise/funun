import { renderToStaticMarkup } from 'react-dom/server'
import { WorkPage, Toast, type VersionCardData, type WorkPageProps } from './WorkPage'
import type { GuidingLineStep } from '@/lib/catalogue/guiding-line'
import type { LyricsPadBlock } from './LyricsPad'
import type { DiaryFeedEntry } from './DiaryFeed'

// No jsdom in this repo (testEnvironment: 'node') — asserted as static
// markup, same treatment as every other components/catalogue/*.test.tsx
// suite in this phase. `initialViewport` is the test-only seam WorkPage.tsx
// documents on its own props type — a production caller never sets it.
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

const baseVersions: VersionCardData[] = [
  {
    id: 'v1',
    display: 'v1',
    description: 'Scratch hum',
    isAiTagged: false,
    playbackUrl: 'https://signed.example/v1.webm',
    durationSeconds: 42,
    createdAt: '2026-01-01T00:00:00Z',
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
    initialViewport: 'desktop',
    ...overrides,
  }
}

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
      <WorkPage {...makeProps({ versions: [{ ...baseVersions[0]!, playbackUrl: null }] })} />
    )
    expect(withoutUrl).not.toContain('<audio')
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

  it('surfaces alternate lyric suggestions on original sections', () => {
    const markup = renderToStaticMarkup(
      <WorkPage {...makeProps({ suggestionCounts: { b1: 2 } })} />
    )
    expect(markup).toContain('Suggest alternate lyrics for Verse')
    expect(markup).toContain('Alternates (2)')
  })

  it('renders the Diary|Versions toggle on the mobile treatment and not on the desktop treatment', () => {
    const mobile = renderToStaticMarkup(<WorkPage {...makeProps({ initialViewport: 'mobile' })} />)
    expect(mobile).toContain('role="tablist"')
    expect(mobile).toContain('>Diary<')
    expect(mobile).toContain('>Versions<')

    const desktop = renderToStaticMarkup(<WorkPage {...makeProps({ initialViewport: 'desktop' })} />)
    expect(desktop).not.toContain('role="tablist"')
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
