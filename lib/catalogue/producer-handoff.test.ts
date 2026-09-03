import {
  buildProducerVocalPath,
  normalizeHandoffNote,
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
})
