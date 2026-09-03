import { renderToStaticMarkup } from 'react-dom/server'
import { ProducerInbox, type ProducerInboxItem } from './ProducerInbox'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: jest.fn() }),
}))

const item: ProducerInboxItem = {
  id: 'handoff-1',
  workId: 'work-1',
  workTitle: 'Midnight Drive',
  senderName: 'Maya Reyes',
  note: 'Can we bring the drums forward in the hook?',
  sentAt: '2026-09-03T12:00:00Z',
  acknowledgedAt: null,
  workingAt: null,
  roundLabel: 'First pass',
  bpm: 92,
  musicalKey: 'A minor',
  referenceUrl: 'https://example.com/reference',
  feedback: [],
  roughVersionId: 'version-1',
  roughLabel: 'Hook comp',
  roughUrl: 'https://signed.example/rough.wav',
  roughDownloadUrl: 'https://signed.example/rough.wav?download=rough.wav',
  roughAudioExt: 'wav',
  roughAudioSize: 12_000_000,
  roughDurationSeconds: 185,
  vocalUrl: 'https://signed.example/vocal.wav',
  vocalDownloadUrl: 'https://signed.example/vocal.wav?download=vocal.wav',
  vocalSize: 8_000_000,
  returns: [],
}

describe('ProducerInbox', () => {
  it('renders an addressed handoff with both aligned assets and the two response actions', () => {
    const markup = renderToStaticMarkup(<ProducerInbox items={[item]} />)
    expect(markup).toContain('Midnight Drive')
    expect(markup).toContain('From Maya Reyes')
    expect(markup).toContain('Needs your reply')
    expect(markup).toContain('Rough mix · Hook comp')
    expect(markup).toContain('Dry vocal · aligned from 0:00')
    expect(markup).toContain('I got it')
    expect(markup).toContain('Upload next mix')
  })

  it('renders returned mixes and their room-ready status', () => {
    const returned: ProducerInboxItem = {
      ...item,
      acknowledgedAt: '2026-09-03T12:30:00Z',
      returns: [{
        id: 'return-1',
        versionId: 'version-2',
        label: 'Producer mix — drums up',
        note: 'Opened the hook up.',
        createdAt: '2026-09-03T13:00:00Z',
        playbackUrl: 'https://signed.example/return.wav',
        downloadUrl: 'https://signed.example/return.wav?download=return.wav',
        roundLabel: 'Drums up',
        feedbackResponses: [],
        audioExt: 'wav',
        audioSize: 14_000_000,
        durationSeconds: 185,
      }],
    }
    const markup = renderToStaticMarkup(<ProducerInbox items={[returned]} />)
    expect(markup).toContain('1 mix returned')
    expect(markup).toContain('Producer mix — drums up')
    expect(markup).toContain('Opened the hook up.')
    expect(markup).not.toContain('I got it')
  })

  it('explains where future handoffs will arrive when empty', () => {
    const markup = renderToStaticMarkup(<ProducerInbox items={[]} />)
    expect(markup).toContain('No producer handoffs yet')
    expect(markup).toContain('Back to the Sound Vault')
  })
})
