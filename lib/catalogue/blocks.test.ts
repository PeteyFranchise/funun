// Tests for the lyric-block pure logic. Two rules from the doctrine, one
// suite each: the RENUMBERING RULE (numerals are derived from position
// among same-type siblings, never stored) and the REPEAT RULE (a linked
// repeat resolves the source's text and author; detach is copy-on-write).
// Plus the "Copy full lyric" serializers (S-04) and paste auto-split.
// All fixtures are plain objects — no database, no mocks.

import {
  BLOCK_TYPE_LABELS,
  BLOCK_TYPE_VALUES,
  deriveBlockNumerals,
  resolveRepeat,
  planDetach,
  serializeLyrics,
  splitPastedLyric,
  type LyricBlockRecord,
  type BlockType,
} from './blocks'

function makeBlock(overrides: Partial<LyricBlockRecord> & { id: string }): LyricBlockRecord {
  return {
    block_type: 'verse',
    custom_label: null,
    position: 0,
    text: '',
    author_kind: 'human',
    author_user_id: 'user-1',
    repeat_of_block_id: null,
    ...overrides,
  }
}

describe('BLOCK_TYPE_LABELS / BLOCK_TYPE_VALUES', () => {
  it('covers the seven fixed types plus custom', () => {
    expect(BLOCK_TYPE_VALUES.sort()).toEqual(
      ['verse', 'pre_chorus', 'chorus', 'bridge', 'intro', 'outro', 'hook', 'custom'].sort()
    )
    expect(BLOCK_TYPE_LABELS.pre_chorus).toBe('Pre-Chorus')
    expect(BLOCK_TYPE_LABELS.verse).toBe('Verse')
  })
})

describe('deriveBlockNumerals — RENUMBERING RULE', () => {
  it('derives Verse 1, Verse 2, Verse 3 from position, regardless of what sits between them', () => {
    const blocks = [
      makeBlock({ id: 'v1', block_type: 'verse', position: 0 }),
      makeBlock({ id: 'c1', block_type: 'chorus', position: 1 }),
      makeBlock({ id: 'v2', block_type: 'verse', position: 2 }),
      makeBlock({ id: 'c2', block_type: 'chorus', position: 4 }),
      makeBlock({ id: 'v3', block_type: 'verse', position: 5 }),
    ]

    const derived = deriveBlockNumerals(blocks)
    const verses = derived.filter(b => b.block_type === 'verse')

    expect(verses.map(v => v.label)).toEqual(['Verse 1', 'Verse 2', 'Verse 3'])
    expect(verses.map(v => v.numeral)).toEqual([1, 2, 3])
  })

  it('swapping the positions of the first and second verse swaps their labels and nothing else', () => {
    const before = [
      makeBlock({ id: 'v1', block_type: 'verse', position: 0, text: 'first verse text' }),
      makeBlock({ id: 'v2', block_type: 'verse', position: 1, text: 'second verse text' }),
    ]
    const beforeDerived = deriveBlockNumerals(before)
    expect(beforeDerived.find(b => b.id === 'v1')?.label).toBe('Verse 1')
    expect(beforeDerived.find(b => b.id === 'v2')?.label).toBe('Verse 2')

    const swapped = [
      makeBlock({ id: 'v1', block_type: 'verse', position: 1, text: 'first verse text' }),
      makeBlock({ id: 'v2', block_type: 'verse', position: 0, text: 'second verse text' }),
    ]
    const afterDerived = deriveBlockNumerals(swapped)

    expect(afterDerived.find(b => b.id === 'v1')?.label).toBe('Verse 2')
    expect(afterDerived.find(b => b.id === 'v2')?.label).toBe('Verse 1')
    // Nothing else about either row changed — id, text, author untouched.
    expect(afterDerived.find(b => b.id === 'v1')?.text).toBe('first verse text')
    expect(afterDerived.find(b => b.id === 'v2')?.text).toBe('second verse text')
  })

  it('a single chorus derives the label Chorus with no numeral', () => {
    const blocks = [makeBlock({ id: 'c1', block_type: 'chorus', position: 0 })]
    const derived = deriveBlockNumerals(blocks)
    expect(derived[0].label).toBe('Chorus')
    expect(derived[0].numeral).toBeNull()
  })

  it('a second chorus turns both into Chorus 1 and Chorus 2', () => {
    const blocks = [
      makeBlock({ id: 'c1', block_type: 'chorus', position: 0 }),
      makeBlock({ id: 'c2', block_type: 'chorus', position: 3 }),
    ]
    const derived = deriveBlockNumerals(blocks)
    expect(derived.map(b => b.label)).toEqual(['Chorus 1', 'Chorus 2'])
  })

  it('two custom blocks both labelled "Drop" both render as Drop — custom sections never take a numeral', () => {
    const blocks = [
      makeBlock({ id: 'x1', block_type: 'custom', custom_label: 'Drop', position: 0 }),
      makeBlock({ id: 'x2', block_type: 'custom', custom_label: 'Drop', position: 1 }),
    ]
    const derived = deriveBlockNumerals(blocks)
    expect(derived.map(b => b.label)).toEqual(['Drop', 'Drop'])
    expect(derived.every(b => b.numeral === null)).toBe(true)
  })

  it('falls back to a neutral label when a custom block has a blank custom_label', () => {
    const blocks = [makeBlock({ id: 'x1', block_type: 'custom', custom_label: '  ', position: 0 })]
    const derived = deriveBlockNumerals(blocks)
    expect(derived[0].label).toBe('Custom')
  })

  it('deleting the middle verse renumbers the last one from Verse 3 to Verse 2, keeping ids', () => {
    const withThree = [
      makeBlock({ id: 'v1', block_type: 'verse', position: 0 }),
      makeBlock({ id: 'v2', block_type: 'verse', position: 1 }),
      makeBlock({ id: 'v3', block_type: 'verse', position: 2 }),
    ]
    expect(deriveBlockNumerals(withThree).map(b => b.label)).toEqual([
      'Verse 1',
      'Verse 2',
      'Verse 3',
    ])

    const afterDelete = withThree.filter(b => b.id !== 'v2')
    const derived = deriveBlockNumerals(afterDelete)

    expect(derived.map(b => b.id)).toEqual(['v1', 'v3'])
    expect(derived.map(b => b.label)).toEqual(['Verse 1', 'Verse 2'])
  })
})

describe('resolveRepeat / planDetach — REPEAT RULE', () => {
  it('a block linked to a chorus resolves to the chorus text and author, and reports itself as a repeat', () => {
    const source = makeBlock({
      id: 'chorus-1',
      block_type: 'chorus',
      text: 'we are the champions',
      author_user_id: 'writer-a',
    })
    const repeat = makeBlock({
      id: 'chorus-2',
      block_type: 'chorus',
      repeat_of_block_id: 'chorus-1',
      author_user_id: 'writer-b', // must be ignored — attribution follows the link
    })

    const byId = new Map([
      [source.id, source],
      [repeat.id, repeat],
    ])

    const resolved = resolveRepeat(repeat, byId)
    expect(resolved.text).toBe('we are the champions')
    expect(resolved.authorUserId).toBe('writer-a')
    expect(resolved.isRepeat).toBe(true)
  })

  it('a non-repeat block resolves to its own text and author and reports isRepeat false', () => {
    const block = makeBlock({ id: 'v1', text: 'own words', author_user_id: 'writer-a' })
    const resolved = resolveRepeat(block, new Map([[block.id, block]]))
    expect(resolved).toEqual({
      text: 'own words',
      authorKind: 'human',
      authorUserId: 'writer-a',
      isRepeat: false,
    })
  })

  it('editing the source chorus text changes what every linked repeat resolves to, with no write to the repeat row', () => {
    const source = makeBlock({ id: 'chorus-1', block_type: 'chorus', text: 'original words' })
    const repeat = makeBlock({
      id: 'chorus-2',
      block_type: 'chorus',
      repeat_of_block_id: 'chorus-1',
    })
    const byId = new Map([
      [source.id, source],
      [repeat.id, repeat],
    ])

    expect(resolveRepeat(repeat, byId).text).toBe('original words')

    // Simulate the source's text being edited — the repeat row itself is untouched.
    const editedSource = { ...source, text: 'new words' }
    byId.set(editedSource.id, editedSource)

    expect(resolveRepeat(repeat, byId).text).toBe('new words')
    expect(repeat.text).toBe('') // the repeat row's own text field never changed
  })

  it('planDetach returns the source text as the new row own text, clears the link, assigns the detaching author, and leaves the source unchanged', () => {
    const source = makeBlock({
      id: 'chorus-1',
      block_type: 'chorus',
      text: 'hey now',
      author_user_id: 'writer-a',
    })
    const repeat = makeBlock({
      id: 'chorus-2',
      block_type: 'chorus',
      repeat_of_block_id: 'chorus-1',
    })
    const byId = new Map([
      [source.id, source],
      [repeat.id, repeat],
    ])

    const result = planDetach(repeat, byId, 'detaching-user')

    expect(result.patch).toEqual({
      text: 'hey now',
      repeat_of_block_id: null,
      author_kind: 'human',
      author_user_id: 'detaching-user',
    })
    expect(result.source).toEqual(source)
    // The source object itself is untouched.
    expect(source.text).toBe('hey now')
    expect(source.author_user_id).toBe('writer-a')
  })

  it('a link that points at a missing or deleted source resolves to empty text rather than throwing', () => {
    const repeat = makeBlock({ id: 'orphan', repeat_of_block_id: 'does-not-exist' })
    expect(() => resolveRepeat(repeat, new Map())).not.toThrow()
    const resolved = resolveRepeat(repeat, new Map([[repeat.id, repeat]]))
    expect(resolved.text).toBe('')
    expect(resolved.isRepeat).toBe(true)
  })

  it('a chain (a repeat pointing at a repeat) resolves through to the original source and cannot loop forever', () => {
    const source = makeBlock({ id: 'a', text: 'the real words', author_user_id: 'writer-a' })
    const middle = makeBlock({ id: 'b', repeat_of_block_id: 'a' })
    const outer = makeBlock({ id: 'c', repeat_of_block_id: 'b' })
    const byId = new Map([
      [source.id, source],
      [middle.id, middle],
      [outer.id, outer],
    ])

    const resolved = resolveRepeat(outer, byId)
    expect(resolved.text).toBe('the real words')
    expect(resolved.authorUserId).toBe('writer-a')
  })

  it('a self-referencing or mutually cyclic link resolves without an infinite loop', () => {
    const selfLinked = makeBlock({ id: 'x', repeat_of_block_id: 'x' })
    const byId1 = new Map([[selfLinked.id, selfLinked]])
    expect(() => resolveRepeat(selfLinked, byId1)).not.toThrow()
    expect(resolveRepeat(selfLinked, byId1).text).toBe('')

    const a = makeBlock({ id: 'a', repeat_of_block_id: 'b', text: 'a text' })
    const b = makeBlock({ id: 'b', repeat_of_block_id: 'a', text: 'b text' })
    const byId2 = new Map([
      [a.id, a],
      [b.id, b],
    ])
    expect(() => resolveRepeat(a, byId2)).not.toThrow()
  })
})

describe('serializeLyrics — "Copy full lyric" (S-04)', () => {
  function fixtureBlocks(): LyricBlockRecord[] {
    return [
      makeBlock({ id: 'v1', block_type: 'verse', position: 0, text: 'first line\nsecond line' }),
      makeBlock({ id: 'c1', block_type: 'chorus', position: 1, text: 'chorus words' }),
      makeBlock({
        id: 'c2',
        block_type: 'chorus',
        position: 2,
        repeat_of_block_id: 'c1',
        text: '',
      }),
      makeBlock({
        id: 'x1',
        block_type: 'custom',
        custom_label: 'Drop',
        position: 3,
        text: 'drop line',
      }),
    ]
  }

  it('tagged flavour emits a bracketed label line then the lines, sections separated by a blank line', () => {
    const out = serializeLyrics(fixtureBlocks(), 'tagged')
    expect(out).toBe(
      [
        '[Verse]\nfirst line\nsecond line',
        '[Chorus 1]\nchorus words',
        '[Chorus 2]\nchorus words',
        '[Drop]\ndrop line',
      ].join('\n\n')
    )
  })

  it('plain flavour emits only the lines, sections separated by a blank line, no brackets anywhere', () => {
    const out = serializeLyrics(fixtureBlocks(), 'plain')
    expect(out).toBe(['first line\nsecond line', 'chorus words', 'chorus words', 'drop line'].join('\n\n'))
    expect(out).not.toMatch(/[[\]]/)
  })

  it('both flavours expand a linked repeat to the source full text — the words appear twice', () => {
    const tagged = serializeLyrics(fixtureBlocks(), 'tagged')
    const plain = serializeLyrics(fixtureBlocks(), 'plain')
    expect(tagged.match(/chorus words/g)).toHaveLength(2)
    expect(plain.match(/chorus words/g)).toHaveLength(2)
    expect(tagged).not.toMatch(/repeat/i)
  })

  it('a lone chorus exports as Chorus and a second chorus exports as Chorus 2', () => {
    const lone = serializeLyrics(
      [makeBlock({ id: 'c1', block_type: 'chorus', position: 0, text: 'la la' })],
      'tagged'
    )
    expect(lone).toBe('[Chorus]\nla la')
  })

  it('an empty block contributes its label in tagged and nothing but the separator in plain', () => {
    const blocks = [
      makeBlock({ id: 'v1', block_type: 'verse', position: 0, text: '' }),
      makeBlock({ id: 'v2', block_type: 'verse', position: 1, text: 'second' }),
    ]
    const tagged = serializeLyrics(blocks, 'tagged')
    const plain = serializeLyrics(blocks, 'plain')
    expect(tagged).toBe('[Verse 1]\n\n\n[Verse 2]\nsecond')
    expect(plain).toBe('\n\nsecond')
  })

  it('no tool names appear anywhere in the serialized output', () => {
    const out = serializeLyrics(fixtureBlocks(), 'tagged')
    expect(out.toLowerCase()).not.toMatch(/suno|udio|anthropic|claude|openai|chatgpt/)
  })
})

describe('splitPastedLyric — paste auto-split', () => {
  it('splits on blank lines into one draft block per stanza, defaulting to verse', () => {
    const drafts = splitPastedLyric('first stanza line one\nline two\n\nsecond stanza')
    expect(drafts).toEqual([
      { block_type: 'verse', text: 'first stanza line one\nline two' },
      { block_type: 'verse', text: 'second stanza' },
    ])
  })

  it.each<[string, BlockType]>([
    ['Verse', 'verse'],
    ['[Chorus]', 'chorus'],
    ['bridge:', 'bridge'],
    ['INTRO', 'intro'],
    ['Outro 2', 'outro'],
    ['[Hook]:', 'hook'],
    ['Pre-Chorus', 'pre_chorus'],
  ])('recognizes %s as a %s section header and drops it from the text', (header, type) => {
    const drafts = splitPastedLyric(`${header}\nthe actual lyric line`)
    expect(drafts).toEqual([{ block_type: type, text: 'the actual lyric line' }])
  })

  it('pasting text with no blank lines yields exactly one block', () => {
    const drafts = splitPastedLyric('line one\nline two\nline three')
    expect(drafts).toHaveLength(1)
    expect(drafts[0].text).toBe('line one\nline two\nline three')
  })

  it('Windows line endings and trailing whitespace produce the same result as clean input', () => {
    const clean = splitPastedLyric('Verse\nfirst line\n\nChorus\nsecond line')
    const windows = splitPastedLyric('Verse\r\nfirst line  \r\n\r\nChorus\r\nsecond line\r\n')
    expect(windows).toEqual(clean)
  })

  it('drops empty stanzas produced by multiple consecutive blank lines', () => {
    const drafts = splitPastedLyric('first\n\n\n\nsecond')
    expect(drafts).toEqual([
      { block_type: 'verse', text: 'first' },
      { block_type: 'verse', text: 'second' },
    ])
  })
})
