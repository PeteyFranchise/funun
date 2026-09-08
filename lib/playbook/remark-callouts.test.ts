import {
  extractPlaybookHeadings,
  remarkPlaybookCallouts,
  remarkPlaybookHeadingIds,
} from './remark-callouts'

describe('remarkPlaybookCallouts', () => {
  it('turns an allowlisted marker into a typed aside and removes the marker', () => {
    const tree = {
      type: 'root',
      children: [
        {
          type: 'blockquote',
          children: [{ type: 'paragraph', children: [{ type: 'text', value: '[!TIP] Keep it concise.' }] }],
        },
      ],
    }

    remarkPlaybookCallouts()(tree)

    expect(tree.children[0]).toMatchObject({
      data: { hName: 'aside', hProperties: { 'data-callout': 'tip' } },
      children: [{ children: [{ value: 'Keep it concise.' }] }],
    })
  })

  it('leaves ordinary blockquotes untouched', () => {
    const tree = {
      type: 'root',
      children: [
        {
          type: 'blockquote',
          children: [{ type: 'paragraph', children: [{ type: 'text', value: 'Quoted guidance.' }] }],
        },
      ],
    }

    remarkPlaybookCallouts()(tree)

    expect(tree.children[0]).not.toHaveProperty('data')
  })
})

describe('Playbook heading anchors', () => {
  it('creates deterministic unique ids for duplicate headings', () => {
    const tree = {
      type: 'root',
      children: [
        { type: 'heading', depth: 2, children: [{ type: 'text', value: 'Response SLAs' }] },
        { type: 'heading', depth: 3, children: [{ type: 'text', value: 'Response SLAs' }] },
      ],
    }

    remarkPlaybookHeadingIds()(tree)

    expect(tree.children[0]).toMatchObject({ data: { hProperties: { id: 'response-slas' } } })
    expect(tree.children[1]).toMatchObject({ data: { hProperties: { id: 'response-slas-2' } } })
  })

  it('extracts the same headings for the article table of contents and skips fenced code', () => {
    const markdown = [
      '## Response **SLAs**',
      '```md',
      '## Not a heading',
      '```',
      '### [Response SLAs](/admin/playbook)',
    ].join('\n')

    expect(extractPlaybookHeadings(markdown)).toEqual([
      { depth: 2, text: 'Response SLAs', id: 'response-slas' },
      { depth: 3, text: 'Response SLAs', id: 'response-slas-2' },
    ])
  })
})
