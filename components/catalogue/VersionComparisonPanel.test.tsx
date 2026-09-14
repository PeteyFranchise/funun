import { renderToStaticMarkup } from 'react-dom/server'
import { VersionComparisonPanel } from './VersionComparisonPanel'
import { PEAKS_BAR_COUNT } from '@/lib/catalogue/waveform'
import type { WorkVersionCommentView } from '@/types/catalogue'

const samplePeaks = Array.from({ length: PEAKS_BAR_COUNT }, (_, index) => (index % 100) + 1)

const versions = [
  { id: 'v5-id', display: 'v5', description: 'New mix', playbackUrl: 'https://signed.example/v5.mp3', durationSeconds: 180, createdAt: '2026-09-03T11:00:00Z', peaks: samplePeaks },
  { id: 'v4-id', display: 'v4', description: 'Studio bounce', playbackUrl: 'https://signed.example/v4.mp3', durationSeconds: 198, createdAt: '2026-09-03T10:00:00Z', peaks: null },
]

const note: WorkVersionCommentView = {
  id: 'comment-1', versionId: 'v4-id', parentCommentId: null,
  body: '@marcus can we drop the drums here?', timestampMs: 105000,
  author: { userId: 'maya', name: 'Maya', handle: 'maya', avatarUrl: null },
  mentioned: [{ userId: 'marcus', name: 'Marcus', handle: 'marcus', avatarUrl: null }],
  resolvedAt: null, resolvedByName: null, carriedFromVersionId: null,
  carriedFromVersionDisplay: null, createdAt: '2026-09-03T10:05:00Z', canResolve: true,
}

describe('VersionComparisonPanel', () => {
  it('defaults to the newest two takes with one shared seek control', () => {
    const markup = renderToStaticMarkup(
      <VersionComparisonPanel
        workId="work-1"
        versions={versions}
        initialComments={{ 'v4-id': [note], 'v5-id': [] }}
        onClose={() => undefined}
        onActivity={() => undefined}
        onCommentChanged={() => undefined}
        refreshToken={0}
      />
    )
    expect(markup).toContain('Compare two takes')
    expect(markup).toContain('Side A')
    expect(markup).toContain('Side B')
    expect(markup).toContain('v4 · Studio bounce')
    expect(markup).toContain('v5 · New mix')
    expect(markup).toContain('type="range"')
    expect(markup.match(/<audio/g)).toHaveLength(2)
    expect(markup).toContain('≈ Level match')
    expect(markup).toContain('without changing either file')
    expect(markup).toContain('aria-pressed="false"')
  })

  it('opens a producer return beside the current working take', () => {
    const markup = renderToStaticMarkup(
      <VersionComparisonPanel
        workId="work-1"
        versions={versions.map(version => ({ ...version, isWorking: version.id === 'v4-id' }))}
        preferredVersionId="v5-id"
        initialComments={{}}
        onClose={() => undefined}
        onActivity={() => undefined}
        onCommentChanged={() => undefined}
        refreshToken={0}
      />
    )
    expect(markup).toContain('value="v5-id" selected=""')
    expect(markup).toContain('value="v4-id" selected=""')
  })

  it('renders the active version marker without mixing the other version into its timeline', () => {
    const markup = renderToStaticMarkup(
      <VersionComparisonPanel
        workId="work-1"
        versions={versions}
        initialComments={{ 'v4-id': [note], 'v5-id': [{ ...note, id: 'comment-2', versionId: 'v5-id', timestampMs: 120000 }] }}
        onClose={() => undefined}
        onActivity={() => undefined}
        onCommentChanged={() => undefined}
        refreshToken={0}
      />
    )
    expect(markup).toContain('v4 note at 1:45')
    expect(markup).not.toContain('v4 note at 2:00')
  })

  it("draws the active take's real waveform when a valid peaks array exists", () => {
    const versionsActivePeaks = [
      { ...versions[0]!, peaks: null },
      { ...versions[1]!, peaks: samplePeaks },
    ]
    const markup = renderToStaticMarkup(
      <VersionComparisonPanel
        workId="work-1"
        versions={versionsActivePeaks}
        initialComments={{}}
        onClose={() => undefined}
        onActivity={() => undefined}
        onCommentChanged={() => undefined}
        refreshToken={0}
      />
    )
    expect(markup).toContain('rounded-full bg-brandindigo')
    expect(markup).not.toContain('animate-pulse')
  })

  it('renders the structurally-distinct pulsing rest state, with no indigo fill, when the active take has no peaks yet', () => {
    const markup = renderToStaticMarkup(
      <VersionComparisonPanel
        workId="work-1"
        versions={versions}
        initialComments={{}}
        onClose={() => undefined}
        onActivity={() => undefined}
        onCommentChanged={() => undefined}
        refreshToken={0}
      />
    )
    expect(markup).toContain('animate-pulse')
    expect(markup).toContain('bg-lavdim/20')
    expect(markup).not.toContain('rounded-full bg-brandindigo')
  })

  it('contains no raw hex colour', () => {
    const markup = renderToStaticMarkup(
      <VersionComparisonPanel
        workId="work-1"
        versions={versions}
        initialComments={{}}
        onClose={() => undefined}
        onActivity={() => undefined}
        onCommentChanged={() => undefined}
        refreshToken={0}
      />
    )
    expect(markup).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })
})
