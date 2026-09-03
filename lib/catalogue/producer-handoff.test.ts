import {
  buildProducerHandoffRecap,
  buildProducerVocalPath,
  normalizeHandoffNote,
  normalizeHandoffRoundLabel,
  normalizeMusicalKey,
  normalizeProducerBpm,
  normalizeReferenceUrl,
  producerHandoffAttention,
  producerHandoffStage,
  producerInboxStatus,
  producerReturnLabel,
  safeAudioDownloadName,
} from './producer-handoff'

const workId = '00000000-0000-4000-8000-000000000001'
const sessionId = '00000000-0000-4000-8000-000000000002'
const handoffId = '00000000-0000-4000-8000-000000000003'

describe('producer handoff helpers', () => {
  it('builds one exact private vocal-stem path', () => {
    expect(buildProducerVocalPath(workId, sessionId, handoffId)).toBe(
      `${workId}/recording-sessions/${sessionId}/handoffs/${handoffId}-dry-vocal.wav`
    )
    expect(() => buildProducerVocalPath(workId, 'bad', handoffId)).toThrow('Invalid producer handoff reference.')
  })

  it('bounds notes and creates safe download names', () => {
    expect(normalizeHandoffNote('  Drop the drums in the hook.  ')).toBe('Drop the drums in the hook.')
    expect(normalizeHandoffNote('   ')).toBeNull()
    expect(normalizeHandoffNote('x'.repeat(1200))).toHaveLength(1000)
    expect(safeAudioDownloadName('Maya’s Song!', 'dry-vocal')).toBe('Mayas-Song-dry-vocal.wav')
  })

  it('turns an uploaded mix filename into a bounded take name', () => {
    expect(producerReturnLabel('midnight_mix-v3.wav')).toBe('Producer mix — midnight mix v3')
    expect(producerReturnLabel('   .wav')).toBe('Producer mix — new return')
    expect(producerReturnLabel(`${'x'.repeat(300)}.wav`)).toHaveLength(190)
  })

  it('prioritizes returned-mix state over receipt state', () => {
    expect(producerInboxStatus({ acknowledgedAt: null, returnCount: 0 })).toBe('Needs your reply')
    expect(producerInboxStatus({ acknowledgedAt: '2026-09-03T12:00:00Z', returnCount: 0 })).toBe('Received')
    expect(producerInboxStatus({ acknowledgedAt: null, returnCount: 2 })).toBe('2 mixes returned')
  })

  it('normalizes an entirely optional production brief', () => {
    expect(normalizeHandoffRoundLabel('  Vocal-up revision  ')).toBe('Vocal-up revision')
    expect(normalizeMusicalKey('  F#   minor ')).toBe('F# minor')
    expect(normalizeProducerBpm('92')).toBe(92)
    expect(normalizeProducerBpm('')).toBeNull()
    expect(normalizeReferenceUrl(' https://open.spotify.com/track/example ')).toBe('https://open.spotify.com/track/example')
    expect(() => normalizeProducerBpm(301)).toThrow('between 20 and 300')
    expect(() => normalizeReferenceUrl('javascript:alert(1)')).toThrow('http or https')
  })

  it('derives the flexible handoff stage and a useful next action', () => {
    expect(producerHandoffStage({ acknowledgedAt: null, workingAt: null, returnCount: 0, reviewCount: 0 })).toBe('sent')
    expect(producerHandoffStage({ acknowledgedAt: 'now', workingAt: 'now', returnCount: 1, reviewCount: 0 })).toBe('returned')
    expect(producerHandoffStage({ acknowledgedAt: 'now', workingAt: 'now', returnCount: 1, reviewCount: 1 })).toBe('reviewed')
    expect(producerHandoffAttention({ isRecipient: false, stage: 'sent', unreviewedReturnCount: 0, recipientName: 'Marcus' })).toBe('Waiting for Marcus to receive the files')
    expect(producerHandoffAttention({ isRecipient: false, stage: 'returned', unreviewedReturnCount: 2, recipientName: 'Marcus' })).toBe('2 mixes are ready to review')
  })

  it('creates a plain-text recap without introducing a formal decision', () => {
    const recap = buildProducerHandoffRecap({
      songTitle: 'Midnight', senderName: 'Maya', recipientName: 'Marcus', stage: 'working',
      roundLabel: 'First pass', bpm: 92, musicalKey: 'F# minor',
      referenceUrl: 'https://example.com/reference', direction: 'Open the hook up.', feedbackCount: 2,
    })
    expect(recap).toContain('Midnight — producer handoff (First pass)')
    expect(recap).toContain('92 BPM · F# minor')
    expect(recap).toContain('2 timed production notes attached')
    expect(recap).toContain('not master, rights, split or release approval')
  })
})
