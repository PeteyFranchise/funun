import { extractPublicationMarkdown, markdownHeadingSlug } from '@/lib/playbook/publication-source'

describe('publication source extraction', () => {
  it('uses stable heading slugs for punctuation and diacritics', () => {
    expect(markdownHeadingSlug('1. A&R Doctrine')).toBe('1-a-r-doctrine')
    expect(markdownHeadingSlug('Funūn Deal Flow')).toBe('funun-deal-flow')
  })

  it('extracts only the selected heading body through the next peer heading', () => {
    const source = '# Package\n\n## First\n\n### Detail\n\nKeep this.\n\n## Second\n\nNot this.'
    expect(extractPublicationMarkdown(source, 'first')).toBe('### Detail\n\nKeep this.')
  })

  it('removes a whole document’s leading title without rewriting its body', () => {
    expect(extractPublicationMarkdown('# Plan\n\nIntro.\n\n## Step', null)).toBe('Intro.\n\n## Step')
  })

  it('fails closed when a section is missing or ambiguous', () => {
    expect(() => extractPublicationMarkdown('# Plan\n\nText', 'missing')).toThrow('was not found')
    expect(() => extractPublicationMarkdown('## Same\nOne\n## Same\nTwo', 'same')).toThrow('ambiguous')
  })
})
