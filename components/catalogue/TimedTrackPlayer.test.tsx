import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { TimedTrackPlayer } from './TimedTrackPlayer'
import { PEAKS_BAR_COUNT } from '@/lib/catalogue/waveform'
import type { WorkVersionCommentView } from '@/types/catalogue'

function commentFixture(overrides: Partial<WorkVersionCommentView> = {}): WorkVersionCommentView {
  return {
    id: 'comment-1',
    versionId: 'version-1',
    parentCommentId: null,
    body: 'Lower the guitars here',
    timestampMs: 45000,
    author: null,
    mentioned: [],
    resolvedAt: null,
    resolvedByName: null,
    carriedFromVersionId: null,
    carriedFromVersionDisplay: null,
    createdAt: '2026-09-14T00:00:00Z',
    canResolve: true,
    endTimestampMs: null,
    needsReposition: false,
    ...overrides,
  }
}

function baseProps() {
  return {
    workId: 'work-1',
    versionId: 'version-1',
    display: 'v1',
    description: 'Scratch hum',
    playbackUrl: 'https://signed.example/scratch.webm',
    durationSeconds: 42,
    isLatest: false,
    isAiTagged: false,
    refreshToken: 0,
    onActivity: () => undefined,
    onCommentChanged: () => undefined,
  } as const
}

// The bar row is the first `aria-hidden="true"` block, ending right before
// the seek `<input type="range">` — isolating it keeps a "no bg-brandindigo"
// assertion from tripping on unrelated slash-suffixed uses elsewhere in the
// file (`bg-brandindigo/10`, `/15`, `/80`).
function barRow(markup: string): string {
  return markup.slice(markup.indexOf('aria-hidden="true"'), markup.indexOf('type="range"'))
}

describe('TimedTrackPlayer', () => {
  it('renders real playback, a seek timeline, and a timestamp comment action', () => {
    const markup = renderToStaticMarkup(
      <TimedTrackPlayer
        workId="work-1"
        versionId="version-1"
        display="v4"
        description="Studio bounce"
        playbackUrl="https://signed.example/studio-bounce.mp3"
        downloadUrl="https://signed.example/studio-bounce.mp3?download=Midnight-v4-Studio-bounce.mp3"
        durationSeconds={198}
        isLatest
        isAiTagged={false}
        refreshToken={0}
        onActivity={() => undefined}
        onCommentChanged={() => undefined}
        onPullLyrics={() => undefined}
        onArchive={async () => undefined}
        onRename={async () => ({ ok: true })}
        onMakeWorking={async () => ({ ok: true })}
      />
    )
    expect(markup).toContain('<audio')
    expect(markup).toContain('type="range"')
    expect(markup).toContain('Comment at 0:00')
    expect(markup).toContain('0 unresolved comments')
    expect(markup).toContain('Record over this beat')
    expect(markup).toContain('>Lyric Lift<')
    expect(markup).toContain('aria-label="Use Lyric Lift to pull lyrics from v4"')
    expect(markup).toContain('Archive')
    expect(markup).toContain('Name')
    expect(markup).toContain('Make working')
    expect(markup).toContain('>Download<')
    expect(markup).toContain('aria-label="Download v4 Studio bounce"')
    expect(markup).toContain('download=""')
    expect(markup).toContain('3:18')
    expect(markup).toContain('Studio bounce')
  })

  it('marks a working take as creative context without another make-working action', () => {
    const markup = renderToStaticMarkup(
      <TimedTrackPlayer
        workId="work-1"
        versionId="version-1"
        display="v2"
        description="Hook idea"
        label="Hook idea"
        playbackUrl="https://signed.example/hook.wav"
        durationSeconds={30}
        isLatest
        isAiTagged={false}
        isWorking
        refreshToken={0}
        onActivity={() => undefined}
        onCommentChanged={() => undefined}
        onMakeWorking={async () => ({ ok: true })}
      />
    )
    expect(markup).toContain('Working take')
    expect(markup).not.toContain('Make working')
  })

  it('does not use a native controls-only player', () => {
    const markup = renderToStaticMarkup(
      <TimedTrackPlayer
        workId="work-1"
        versionId="version-1"
        display="v1"
        description="Scratch hum"
        playbackUrl="https://signed.example/scratch.webm"
        durationSeconds={42}
        isLatest={false}
        isAiTagged
        refreshToken={0}
        onActivity={() => undefined}
        onCommentChanged={() => undefined}
      />
    )
    expect(markup).not.toContain(' controls=""')
    expect(markup).toContain('AI noted')
    expect(markup).not.toContain('>Download<')
  })

  it('draws the real waveform from a valid stored peaks array', () => {
    const distinctivePeaks = Array.from({ length: PEAKS_BAR_COUNT }, (_, index) => (index === 5 ? 42 : 10))
    const markup = renderToStaticMarkup(<TimedTrackPlayer {...baseProps()} peaks={distinctivePeaks} />)
    const row = barRow(markup)
    expect(row).toContain('height:42%')
    expect(row).toContain('bg-brandindigo')
  })

  it('renders an honestly empty, pulsing rest state — never a fabricated shape — when no peaks exist', () => {
    const markup = renderToStaticMarkup(<TimedTrackPlayer {...baseProps()} peaks={null} />)
    const row = barRow(markup)
    expect(row).toContain('animate-pulse')
    expect(row).toContain('bg-lavdim/20')
    expect(row).toContain('height:15%')
    expect(row).not.toContain('bg-brandindigo')
  })

  it('treats a wrongly sized peaks array as no peaks at all, not a partial waveform', () => {
    const markup = renderToStaticMarkup(<TimedTrackPlayer {...baseProps()} peaks={[10, 20, 30]} />)
    const row = barRow(markup)
    expect(row).toContain('animate-pulse')
    expect(row).toContain('height:15%')
    expect(row).not.toContain('bg-brandindigo')
  })

  it('never calls a work_version_comments record a "note" anywhere in its rendered markup', () => {
    const markup = renderToStaticMarkup(
      <TimedTrackPlayer {...baseProps()} downloadUrl="https://signed.example/scratch.webm?download=Midnight-v1.webm" />
    )
    expect(markup).not.toContain('timed notes')
  })

  it('offers Mark span mode in the transport row without ever auto-activating it', () => {
    const markup = renderToStaticMarkup(<TimedTrackPlayer {...baseProps()} />)
    expect(markup).toContain('Mark span')
    expect(markup).not.toContain('cursor-crosshair')
    expect(markup).not.toContain('ring-brandfuchsia')
    expect(markup).not.toContain('disabled=""')
  })

  it('renders a committed range comment as a shaded band at its true bounds with one start-only marker pill', () => {
    const span = commentFixture({ id: 'span-1', timestampMs: 45000, endTimestampMs: 52000 })
    const markup = renderToStaticMarkup(<TimedTrackPlayer {...baseProps()} initialComments={[span]} />)
    expect(markup).toContain('bg-brandindigo/15')
    expect((markup.match(/border-brandindigo\/70 bg-card px-1/g) ?? []).length).toBe(1)
    expect(markup).toContain('aria-label="Range comment, 0:45 to 0:52, 1 comment"')
  })

  it('renders no shaded band for a point comment', () => {
    const point = commentFixture({ id: 'point-1', timestampMs: 12000, endTimestampMs: null })
    const markup = renderToStaticMarkup(<TimedTrackPlayer {...baseProps()} initialComments={[point]} />)
    expect(markup).not.toContain('bg-brandindigo/15')
    expect((markup.match(/border-brandindigo\/70 bg-card px-1/g) ?? []).length).toBe(1)
  })

  it('uses the phase\'s comment vocabulary for the composer placeholder', () => {
    // The composer only renders once `open` is true, which this file only
    // ever sets from a click handler or the URL-linked-comment effect —
    // neither reachable from a pure `renderToStaticMarkup` pass in this
    // repo's jsdom-free (`testEnvironment: 'node'`) Jest config. A direct
    // source-content check is the same text-lock technique this repo's own
    // migration tests already use for exactly this kind of unreachable-via-
    // render guard.
    const source = readFileSync(join(__dirname, 'TimedTrackPlayer.tsx'), 'utf8')
    expect(source).toContain('Leave a comment at ${formatTrackTimestamp(positionMs)}')
    expect(source).not.toContain('timed notes')
  })
})
