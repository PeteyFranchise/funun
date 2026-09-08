import { parsePlaybookVideoBlock, playbookVideoSnippet } from '@/lib/playbook/media'

describe('Playbook video blocks', () => {
  it('converts allowlisted providers to privacy-conscious embeds', () => {
    expect(parsePlaybookVideoBlock('url: https://youtu.be/abc123XYZ\ntitle: YouTube lesson')?.embedUrl).toBe('https://www.youtube-nocookie.com/embed/abc123XYZ')
    expect(parsePlaybookVideoBlock('url: https://vimeo.com/1234567\ntitle: Vimeo lesson')?.embedUrl).toBe('https://player.vimeo.com/video/1234567')
    expect(parsePlaybookVideoBlock('url: https://www.loom.com/share/abc123\ntitle: Loom lesson')?.embedUrl).toBe('https://www.loom.com/embed/abc123')
  })

  it('permits only the authenticated internal stream route for Funūn media', () => {
    const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    expect(parsePlaybookVideoBlock(`url: /api/admin/playbook/media/${id}/stream\ntitle: Private lesson`)?.provider).toBe('funun')
    expect(parsePlaybookVideoBlock('url: /uploads/private.mp4\ntitle: Unsafe path')).toBeNull()
  })

  it('rejects raw or untrusted media sources', () => {
    expect(parsePlaybookVideoBlock('url: http://youtube.com/watch?v=abc123XYZ\ntitle: Insecure')).toBeNull()
    expect(parsePlaybookVideoBlock('url: https://evil.example/video\ntitle: Unknown')).toBeNull()
    expect(parsePlaybookVideoBlock('url: javascript:alert(1)\ntitle: Bad')).toBeNull()
    expect(parsePlaybookVideoBlock('url: https://youtu.be/abc123XYZ')).toBeNull()
  })

  it('provides an authoring snippet with accessible metadata', () => {
    expect(playbookVideoSnippet()).toContain('```video')
    expect(playbookVideoSnippet()).toContain('title:')
    expect(playbookVideoSnippet()).toContain('transcript:')
  })
})
