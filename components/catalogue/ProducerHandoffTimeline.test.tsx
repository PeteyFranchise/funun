import { renderToStaticMarkup } from 'react-dom/server'
import { ProducerHandoffTimeline, type ProducerHandoffTimelineItem } from './ProducerHandoffTimeline'

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))

const item: ProducerHandoffTimelineItem = {
  id: 'handoff-1', workId: 'work-1', songTitle: 'Midnight', senderId: 'maya', senderName: 'Maya', recipientId: 'marcus', recipientName: 'Marcus',
  viewerIsSender: true, viewerIsRecipient: false, sentAt: '2026-09-03T10:00:00Z', acknowledgedAt: '2026-09-03T10:30:00Z',
  workingAt: '2026-09-03T11:00:00Z', canNudge: true, roundLabel: 'First pass', bpm: 92, musicalKey: 'F# minor',
  referenceUrl: 'https://example.com/reference', direction: 'Bring the drums forward.',
  feedback: [{ feedbackId: 'comment-1', versionId: 'version-1', versionDisplay: 'v3', timestampMs: 105000, body: 'Drop the drums here?', authorUserId: 'maya', authorName: 'Maya' }],
  rough: { versionId: 'version-1', versionDisplay: 'v3', label: 'Rough vocal', playbackUrl: 'https://signed/rough', downloadUrl: 'https://signed/rough?download=rough.wav', audioExt: 'wav', audioSize: 10_000_000, durationSeconds: 180 },
  vocalDownloadUrl: 'https://signed/vocal?download=vocal.wav', vocalSize: 2_000_000,
  returns: [{ returnId: 'return-1', versionId: 'version-2', versionDisplay: 'v4', label: 'Drums up mix', roundLabel: 'Vocal-up revision', note: 'Opened the hook.', returnedAt: '2026-09-03T12:00:00Z', playbackUrl: 'https://signed/return', downloadUrl: 'https://signed/return?download=return.wav', audioExt: 'wav', audioSize: 12_000_000, durationSeconds: 180, feedbackResponses: [{ feedbackId: 'comment-1', status: 'tried' }], review: null }],
  activities: [{ actorName: 'Marcus', kind: 'listened', versionDisplay: 'v3', lastAt: '2026-09-03T11:30:00Z' }],
}

describe('ProducerHandoffTimeline', () => {
  it('renders the full optional production context and contextual actions', () => {
    const markup = renderToStaticMarkup(<ProducerHandoffTimeline items={[item]} onCompare={() => undefined} />)
    expect(markup).toContain('Sent')
    expect(markup).toContain('Received')
    expect(markup).toContain('Mix returned')
    expect(markup).toContain('Reviewed')
    expect(markup).toContain('v3 rough → v4 Vocal-up revision')
    expect(markup).toContain('92 BPM')
    expect(markup).toContain('F# minor')
    expect(markup).toContain('Drop the drums here?')
    expect(markup).toContain('Tried another way')
    expect(markup).toContain('Compare latest return')
    expect(markup).toContain('Copy recap')
    expect(markup).toContain('not master approval')
  })

  it('keeps older rounds collapsed and renders nothing without handoffs', () => {
    const markup = renderToStaticMarkup(<ProducerHandoffTimeline items={[item, { ...item, id: 'handoff-2' }]} onCompare={() => undefined} />)
    expect(markup).toContain('Earlier handoffs (1)')
    expect(renderToStaticMarkup(<ProducerHandoffTimeline items={[]} onCompare={() => undefined} />)).toBe('')
  })

  it('contains no raw hex colour', () => {
    expect(renderToStaticMarkup(<ProducerHandoffTimeline items={[item]} onCompare={() => undefined} />)).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })
})
