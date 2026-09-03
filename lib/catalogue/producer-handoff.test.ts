import { buildProducerVocalPath, normalizeHandoffNote, safeAudioDownloadName } from './producer-handoff'

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
})
