import { escapeHtml } from '@/lib/security/escape-html'

describe('escapeHtml', () => {
  it('neutralizes the XSS payloads a malicious track title could carry', () => {
    // These are the exact attack shapes called out in the 2026-08-22 audit for
    // the public Selects player toast (artist-controlled track titles).
    expect(escapeHtml('<img src=x onerror="alert(document.cookie)">')).toBe(
      '&lt;img src=x onerror=&quot;alert(document.cookie)&quot;&gt;'
    )
    expect(escapeHtml('<svg onload=alert(1)>')).toBe('&lt;svg onload=alert(1)&gt;')
    // A closing-tag payload trying to break out of the toast's <b>…</b> wrapper.
    expect(escapeHtml('</b><script>alert(1)</script>')).toBe(
      '&lt;/b&gt;&lt;script&gt;alert(1)&lt;/script&gt;'
    )
  })

  it('escapes every dangerous character', () => {
    expect(escapeHtml(`& < > " '`)).toBe('&amp; &lt; &gt; &quot; &#39;')
  })

  it('leaves ordinary titles untouched and coerces null/undefined to empty', () => {
    expect(escapeHtml('My Song (Radio Edit)')).toBe('My Song (Radio Edit)')
    expect(escapeHtml(null)).toBe('')
    expect(escapeHtml(undefined)).toBe('')
  })
})
