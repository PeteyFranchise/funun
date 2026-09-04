import { readFileSync } from 'fs'
import path from 'path'

describe('vault track audio upload flow', () => {
  it('uploads browser-to-storage through an intent and completes the database pointer separately', () => {
    const source = readFileSync(
      path.join(process.cwd(), 'components/vault/TrackList.tsx'),
      'utf8'
    )
    expect(source).toContain('/audio/upload-intent')
    expect(source).toContain('.uploadToSignedUrl(')
    expect(source).toContain('/audio/complete')
    expect(source).not.toContain("fd.append('file', file)")
  })
})
