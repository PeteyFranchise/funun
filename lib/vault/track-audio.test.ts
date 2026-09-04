import {
  buildTrackAudioPath,
  resolveTrackAudioType,
  validateTrackAudioPath,
} from './track-audio'

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const PROJECT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const TRACK = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const OBJECT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

describe('vault track audio references', () => {
  it('builds and validates an owned share path', () => {
    const path = buildTrackAudioPath(USER, PROJECT, TRACK, 'share', OBJECT, 'mp3')
    expect(validateTrackAudioPath(path, USER, PROJECT, TRACK, 'share')).toEqual({
      ext: 'mp3',
      contentType: 'audio/mpeg',
    })
    expect(validateTrackAudioPath(path, USER, PROJECT, TRACK, 'master')).toBeNull()
  })

  it('builds and validates an owned master path', () => {
    const path = buildTrackAudioPath(USER, PROJECT, TRACK, 'master', OBJECT, 'wav')
    expect(path).toContain(`${TRACK}.master.${OBJECT}.wav`)
    expect(validateTrackAudioPath(path, USER, PROJECT, TRACK, 'master')).not.toBeNull()
  })

  it('rejects unknown formats and paths owned by another user', () => {
    expect(resolveTrackAudioType('application/octet-stream', 'payload.exe')).toBeNull()
    expect(resolveTrackAudioType('application/octet-stream', '')).toBeNull()
    const path = buildTrackAudioPath(USER, PROJECT, TRACK, 'share', OBJECT, 'flac')
    expect(validateTrackAudioPath(path, 'other-user', PROJECT, TRACK, 'share')).toBeNull()
  })
})
