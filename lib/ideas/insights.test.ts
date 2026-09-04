import { contributionReceipt, ideaSimilarity, nextMoveForIdea } from './insights'
import type { IdeaView } from './schema'

const base: IdeaView = {
  id: 'a', ownerId: 'u', ownerName: 'Maya', viewerPermission: 'owner', title: 'Dark gospel hook', note: 'choir entrance', transcript: null,
  moods: ['Dark', 'Gospel'], state: 'active', pinned: false, snoozedUntil: null, parentIdeaId: null, promotedWorkId: null,
  capturedAt: '2026-09-03T00:00:00Z', recordings: [], members: [], comments: [], references: [], collections: [],
}

describe('idea insights', () => {
  it('offers one contextual move without making a checklist', () => {
    expect(nextMoveForIdea(base)).toEqual({ key: 'record', label: 'Capture the first sound' })
    expect(nextMoveForIdea({ ...base, note: null, recordings: [{ id: 'r', createdBy: 'u', creatorName: 'Maya', parentRecordingId: null, playbackUrl: null, downloadUrl: null, audioExt: 'webm', audioSize: 10, durationSeconds: 4, label: null, kind: 'voice', rating: null, archivedAt: null, capturedAt: base.capturedAt, markers: [] }] }).key).toBe('note')
  })

  it('finds related ideas from private metadata and reports actual contributions', () => {
    expect(ideaSimilarity(base, { ...base, id: 'b', title: 'Gospel melody', moods: ['Gospel'] })).toBeGreaterThan(0)
    const receipt = contributionReceipt({ ...base, recordings: [{ id: 'r', createdBy: 'u', creatorName: 'Maya', parentRecordingId: null, playbackUrl: null, downloadUrl: null, audioExt: 'webm', audioSize: 10, durationSeconds: 4, label: null, kind: 'voice', rating: null, archivedAt: null, capturedAt: base.capturedAt, markers: [] }] })
    expect(receipt).toEqual([{ name: 'Maya', recordings: 1, comments: 0 }])
  })
})
