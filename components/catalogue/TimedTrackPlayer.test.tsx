import { renderToStaticMarkup } from 'react-dom/server'
import { TimedTrackPlayer } from './TimedTrackPlayer'

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
})
