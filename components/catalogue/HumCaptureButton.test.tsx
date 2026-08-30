import { renderToStaticMarkup } from 'react-dom/server'
import { HumCaptureButton } from './HumCaptureButton'

// No jsdom in this repo (testEnvironment: 'node') — asserted as static
// markup, same treatment as ComposerCard.test.tsx and
// components/handles/ChooseHandleGate.test.tsx. There is no real
// MediaRecorder/getUserMedia to drive here, so every state below is
// reached through the component's own injectable seams
// (isTypeSupported / initialError) rather than a simulated recording.

describe('HumCaptureButton', () => {
  const noop = () => {}

  it('idle state: renders the record affordance when a codec is supported', () => {
    const markup = renderToStaticMarkup(
      <HumCaptureButton workId="w1" onCaptured={noop} isTypeSupported={() => true} />
    )
    expect(markup).toContain('tap to record')
    expect(markup).toContain('⏺')
  })

  it('unsupported state: renders nothing when no candidate is supported', () => {
    const markup = renderToStaticMarkup(
      <HumCaptureButton workId="w1" onCaptured={noop} isTypeSupported={() => false} />
    )
    expect(markup).toBe('')
  })

  it('unsupported state (default, no browser API present): renders nothing', () => {
    // No isTypeSupported passed at all — falls through to hum-capture.ts's
    // own default, which is false in this Node test environment.
    const markup = renderToStaticMarkup(<HumCaptureButton workId="w1" onCaptured={noop} />)
    expect(markup).toBe('')
  })

  it('denied state: renders the inline error with a way forward, not a dead end', () => {
    const markup = renderToStaticMarkup(
      <HumCaptureButton
        workId="w1"
        onCaptured={noop}
        isTypeSupported={() => true}
        initialError="Microphone access was denied or unavailable — you can upload a file instead."
      />
    )
    expect(markup).toContain('Microphone access was denied or unavailable')
    expect(markup).toContain('upload a file instead')
    expect(markup).not.toContain('tap to record')
  })

  it('contains no raw hex colour', () => {
    const markup = renderToStaticMarkup(
      <HumCaptureButton workId="w1" onCaptured={noop} isTypeSupported={() => true} />
    )
    expect(markup).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })
})
