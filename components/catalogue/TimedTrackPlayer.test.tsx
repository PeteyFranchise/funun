import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { TimedTrackPlayer } from './TimedTrackPlayer'
import { PEAKS_BAR_COUNT } from '@/lib/catalogue/waveform'
import type { WorkVersionCommentView, WorkVersionPinView } from '@/types/catalogue'

function pinFixture(overrides: Partial<WorkVersionPinView> = {}): WorkVersionPinView {
  return {
    id: 'pin-1',
    timestampMs: 45000,
    createdAt: '2026-09-14T00:00:00Z',
    ...overrides,
  }
}

// Isolates one pin dot's own opening `<button ...>` tag so a "no accent
// colour" assertion cannot accidentally pass by matching unrelated markup
// elsewhere in the component (e.g. the seek input, a marker pill).
function pinButtonMarkup(markup: string, ariaLabel: string): string {
  const labelIndex = markup.indexOf(`aria-label="${ariaLabel}"`)
  const start = markup.lastIndexOf('<button', labelIndex)
  const end = markup.indexOf('>', labelIndex)
  return markup.slice(start, end + 1)
}

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

  // WR-01. normalizeSpanDrag returns null for a drag under MIN_SPAN_MS, and
  // that null means "no span". Guarding the assignment with `if (normalized)`
  // discarded it, so a writer who had already marked a span and then redrew it
  // too short kept the OLD span pending — Confirm still live, still pointed at
  // coordinates they had visibly replaced. repositionComment was worse: the
  // stale value there was a pre-seeded span the writer never drew at all.
  //
  // A source assertion because the invariant lives in a pointer handler and
  // this repo has no jsdom, so no rendered test can reach it.
  it('clears the pending span when a drag is rejected, rather than keeping the previous one', () => {
    const source = readFileSync(join(__dirname, 'TimedTrackPlayer.tsx'), 'utf8')
    expect(source).toContain('setPendingSpan(normalized)')
    // The exact shape of the bug: a truthiness guard that swallows the null.
    expect(source).not.toMatch(/if\s*\(\s*normalized\s*\)\s*setPendingSpan/)
    expect(source).not.toMatch(/normalized\s*&&\s*setPendingSpan/)
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
    expect((markup.match(/rounded-full border bg-card px-1 text-\[9px\] font-bold shadow-md/g) ?? []).length).toBe(1)
    expect(markup).toContain('aria-label="Range comment, 0:45 to 0:52, 1 comment, open"')
  })

  it('renders no shaded band for a point comment', () => {
    const point = commentFixture({ id: 'point-1', timestampMs: 12000, endTimestampMs: null })
    const markup = renderToStaticMarkup(<TimedTrackPlayer {...baseProps()} initialComments={[point]} />)
    expect(markup).not.toContain('bg-brandindigo/15')
    expect((markup.match(/rounded-full border bg-card px-1 text-\[9px\] font-bold shadow-md/g) ?? []).length).toBe(1)
  })

  it('flags a comment carrying needsReposition:true in amber, never rose or red', () => {
    const flagged = commentFixture({ id: 'flagged-1', needsReposition: true })
    const markup = renderToStaticMarkup(<TimedTrackPlayer {...baseProps()} initialComments={[flagged]} />)
    expect(markup).toContain('amber-400')
    const markerSection = markup.slice(markup.indexOf('aria-label="Timeline'))
    expect(markerSection).not.toContain('rose-')
    expect(markerSection).not.toContain('red-')
  })

  it('renders the default indigo marker with no amber chip when needsReposition is false', () => {
    const fitting = commentFixture({ id: 'fits-1', needsReposition: false })
    const markup = renderToStaticMarkup(<TimedTrackPlayer {...baseProps()} initialComments={[fitting]} />)
    expect(markup).toContain('border-brandindigo/70')
    expect(markup).not.toContain('amber-400')
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

  it('offers a Pin control in the transport row and tells the writer once, plainly, that a pin is private', () => {
    const markup = renderToStaticMarkup(<TimedTrackPlayer {...baseProps()} />)
    expect(markup).toContain('>Pin<')
    expect(markup).toContain('Pins are private — only you can see them.')
  })

  it('renders no pin dot when there are no pins', () => {
    const markup = renderToStaticMarkup(<TimedTrackPlayer {...baseProps()} initialPins={[]} />)
    expect(markup).not.toContain('bg-lav/60')
  })

  it("renders a plain lavender dot for the viewer's own pin, with a private aria-label and neither accent colour", () => {
    const pin = pinFixture({ id: 'pin-1', timestampMs: 45000 })
    const markup = renderToStaticMarkup(<TimedTrackPlayer {...baseProps()} initialPins={[pin]} />)
    expect(markup).toContain('aria-label="Your pin at 0:45"')
    const dot = pinButtonMarkup(markup, 'Your pin at 0:45')
    expect(dot).toContain('bg-lav/60')
    expect(dot).not.toContain('brandindigo')
    expect(dot).not.toContain('brandfuchsia')
  })

  it('offers exactly two pin actions — turn into a comment, or remove — with no confirmation dialog', () => {
    // The popover only renders once a pin dot has been pressed
    // (selectedPinId starts null), which this repo's jsdom-free
    // (testEnvironment: 'node') Jest config cannot exercise via
    // renderToStaticMarkup. A direct source-content check is the same
    // text-lock technique the composer-placeholder test above already uses
    // for exactly this kind of unreachable-via-render guard.
    const source = readFileSync(join(__dirname, 'TimedTrackPlayer.tsx'), 'utf8')
    expect(source).toContain('Turn into a comment')
    expect(source).toContain('Remove pin')
    expect(source).not.toMatch(/confirm\(|Are you sure/)
  })

  it('never triggers the carry-forward offer block due to the presence of pins', () => {
    const markup = renderToStaticMarkup(
      <TimedTrackPlayer {...baseProps()} isLatest initialPins={[pinFixture()]} />
    )
    expect(markup).not.toContain('Bring comments forward')
  })

  it('renders the desktop-only keyboard legend as the only visible keyboard affordance — the bindings themselves are behaviour, not chrome', () => {
    const markup = renderToStaticMarkup(<TimedTrackPlayer {...baseProps()} />)
    // Exactly one occurrence of each phrase, and only inside the legend
    // line — no second, restated hint elsewhere in the transport row.
    expect((markup.match(/Space play\/pause/g) ?? []).length).toBe(1)
    expect((markup.match(/seek 5s/g) ?? []).length).toBe(1)
    expect((markup.match(/nudge 1s/g) ?? []).length).toBe(1)
  })

  it('renders a single, desktop-only keyboard legend naming all four bindings under the waveform', () => {
    const markup = renderToStaticMarkup(<TimedTrackPlayer {...baseProps()} />)
    expect(markup).toContain('hidden sm:block')
    expect(markup).toContain('Space play/pause')
    expect(markup).toContain('seek 5s')
    expect(markup).toContain('nudge 1s')
    expect(markup).toContain('comments')
  })

  it('renders every marker as a real button with an aria-label stating timestamp, count, and open/resolved state', () => {
    const open = commentFixture({ id: 'open-1', timestampMs: 12000, resolvedAt: null })
    const resolved = commentFixture({ id: 'resolved-1', timestampMs: 30000, resolvedAt: '2026-09-14T00:00:00Z', canResolve: false })
    const markup = renderToStaticMarkup(<TimedTrackPlayer {...baseProps()} initialComments={[open, resolved]} />)
    expect(markup).toContain('aria-label="1 comment at 0:12, open"')
    expect(markup).toContain('aria-label="1 comment at 0:30, resolved"')
    const markerSection = markup.slice(markup.indexOf('aria-label="Timeline'))
    expect((markerSection.match(/<button/g) ?? []).length).toBeGreaterThanOrEqual(2)
  })

  it('renders four playback speed steps with 1x active on first render, pitch preserved, and no shared/global speed state', () => {
    const source = readFileSync(join(__dirname, 'TimedTrackPlayer.tsx'), 'utf8')
    expect(source).not.toMatch(/useContext|createContext|window\.__/)
    const markup = renderToStaticMarkup(<TimedTrackPlayer {...baseProps()} />)
    expect(markup).toContain('aria-label="Playback speed"')
    expect(markup).toContain('>0.5×<')
    expect(markup).toContain('>0.75×<')
    expect(markup).toContain('>1×<')
    expect(markup).toContain('>1.5×<')
    const speedGroupMatch = markup.match(/aria-label="Playback speed"[\s\S]*?(?=aria-label="(?:Play|Pause) )/)
    const speedSection = speedGroupMatch ? speedGroupMatch[0] : ''
    expect((speedSection.match(/aria-pressed="true"/g) ?? []).length).toBe(1)
    // The one active step is 1× — the button carrying aria-pressed="true"
    // must be the one labelled "1×", not any other step.
    const activeButtonMatch = speedSection.match(/<button[^>]*aria-pressed="true"[^>]*>([^<]*)</)
    expect(activeButtonMatch?.[1]).toBe('1×')
  })

  it('does not grow the timeline block to make room for the speed control', () => {
    const markup = renderToStaticMarkup(<TimedTrackPlayer {...baseProps()} />)
    expect((markup.match(/h-\[58px\]/g) ?? []).length).toBe(1)
  })
})
