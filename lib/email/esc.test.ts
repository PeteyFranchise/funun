import { esc } from './esc'

describe('esc', () => {
  it('escapes ampersands', () => {
    expect(esc('Rock & Roll')).toBe('Rock &amp; Roll')
  })

  it('escapes angle brackets', () => {
    expect(esc('<b>')).toBe('&lt;b&gt;')
  })

  it('escapes double quotes', () => {
    expect(esc('say "hi"')).toBe('say &quot;hi&quot;')
  })

  it('escapes a mixed string containing all four characters', () => {
    expect(esc('<script>alert("x")</script> & more')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; more'
    )
  })

  it('leaves already-safe input unchanged', () => {
    expect(esc('Jamie Rivera')).toBe('Jamie Rivera')
    expect(esc('https://funun.studio/signin?token=abc123')).toBe(
      'https://funun.studio/signin?token=abc123'
    )
  })
})
