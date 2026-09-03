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
        durationSeconds={198}
        isLatest
        isAiTagged={false}
        refreshToken={0}
        onActivity={() => undefined}
        onCommentChanged={() => undefined}
        onArchive={async () => undefined}
      />
    )
    expect(markup).toContain('<audio')
    expect(markup).toContain('type="range"')
    expect(markup).toContain('Comment at 0:00')
    expect(markup).toContain('Record over this beat')
    expect(markup).toContain('Archive')
    expect(markup).toContain('3:18')
    expect(markup).toContain('Studio bounce')
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
  })
})
