import {
  assertSafePlaybookDiagramSvg,
  PLAYBOOK_DIAGRAM_MAX_CHARS,
  validatePlaybookDiagramSource,
} from './diagrams'

describe('validatePlaybookDiagramSource', () => {
  it('accepts the bounded diagram families used by Funūn doctrine', () => {
    expect(validatePlaybookDiagramSource('flowchart LR\nA[Brief] --> B[Clearance]').ok).toBe(true)
    expect(validatePlaybookDiagramSource('sequenceDiagram\nA->>B: Handoff').ok).toBe(true)
    expect(validatePlaybookDiagramSource('stateDiagram-v2\n[*] --> Draft').ok).toBe(true)
  })

  it.each([
    'flowchart LR\nclick A "https://attacker.test"',
    'flowchart LR\nA[<script>alert(1)</script>]',
    '%%{init: {"securityLevel": "loose"}}%%\nflowchart LR\nA-->B',
    'flowchart LR\nA[javascript:alert(1)]',
    'flowchart LR\nclassDef danger fill:red',
  ])('rejects active or configuration-changing source: %s', source => {
    expect(validatePlaybookDiagramSource(source)).toEqual(expect.objectContaining({ ok: false }))
  })

  it('bounds source size before Mermaid parses it', () => {
    expect(validatePlaybookDiagramSource(`flowchart LR\n${'A'.repeat(PLAYBOOK_DIAGRAM_MAX_CHARS)}`).ok).toBe(false)
  })
})

describe('assertSafePlaybookDiagramSvg', () => {
  it('allows inert SVG with local marker references', () => {
    expect(assertSafePlaybookDiagramSvg('<svg><path marker-end="url(#arrow)" /></svg>')).toContain('<svg>')
  })

  it.each([
    '<svg><script>alert(1)</script></svg>',
    '<svg><a href="https://attacker.test"><text>x</text></a></svg>',
    '<svg><path onload="alert(1)" /></svg>',
    '<svg><style>@import "https://attacker.test/x.css"</style></svg>',
    '<svg><path fill="url(https://attacker.test/x.svg)" /></svg>',
  ])('rejects unsafe sanitized output: %s', svg => {
    expect(() => assertSafePlaybookDiagramSvg(svg)).toThrow('unsafe SVG')
  })
})
