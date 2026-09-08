import { assessPlaybookAuthoringPreflight } from '@/lib/playbook/authoring-preflight'

describe('Playbook authoring preflight', () => {
  it('blocks an empty entry but treats governance metadata as warnings', () => {
    const result = assessPlaybookAuthoringPreflight({ title: '', entryType: 'document', body: '' })

    expect(result.canProceed).toBe(false)
    expect(result.issues.filter(item => item.severity === 'blocker').map(item => item.code)).toEqual([
      'missing-title',
      'missing-content',
    ])
    expect(result.warningCount).toBe(3)
  })

  it('recognizes completed governance fields and calculates reading statistics', () => {
    const body = `> **Owner:** VP of A&R
> **Applies to:** A&R team members
> **Review cadence:** Every 90 days

## Purpose

Protect a consistent artist development process.`
    const result = assessPlaybookAuthoringPreflight({ title: 'A&R doctrine', entryType: 'document', body })

    expect(result.canProceed).toBe(true)
    expect(result.warningCount).toBe(0)
    expect(result.wordCount).toBeGreaterThan(10)
    expect(result.estimatedReadingMinutes).toBe(1)
  })

  it('finds unfinished template language and empty sections', () => {
    const result = assessPlaybookAuthoringPreflight({
      title: 'Draft doctrine',
      entryType: 'document',
      body: '## Purpose\n\nExplain why this doctrine exists.\n\n## Scope',
      ownerPresent: true,
      audiencePresent: true,
      reviewCadencePresent: true,
    })

    expect(result.issues.map(item => item.code)).toEqual(expect.arrayContaining(['starter-language', 'empty-headings']))
  })

  it('finds malformed links, inconsistent tables, and incomplete diagrams', () => {
    const result = assessPlaybookAuthoringPreflight({
      title: 'Operations guide',
      entryType: 'document',
      body: `## Resources

[Broken](https://example.com

| One | Two |
| --- |

\`\`\`mermaid
A --> B`,
      ownerPresent: true,
      audiencePresent: true,
      reviewCadencePresent: true,
    })

    expect(result.issues.map(item => item.code)).toEqual(expect.arrayContaining([
      'malformed-link',
      'inconsistent-table',
      'incomplete-diagram',
    ]))
  })

  it('accepts list formats and externally supplied governance metadata', () => {
    const result = assessPlaybookAuthoringPreflight({
      title: 'Call checklist',
      entryType: 'sop',
      body: 'Confirm identity\nRecord the outcome',
      ownerPresent: true,
      audiencePresent: true,
      reviewCadencePresent: true,
    })

    expect(result).toMatchObject({ canProceed: true, blockerCount: 0, warningCount: 0 })
  })

  it('does not flag a complete Markdown link', () => {
    const result = assessPlaybookAuthoringPreflight({
      title: 'Resources',
      entryType: 'document',
      body: '## Resources\n\n[Open the guide](https://example.com/guide)',
      ownerPresent: true,
      audiencePresent: true,
      reviewCadencePresent: true,
    })

    expect(result.issues.map(item => item.code)).not.toContain('malformed-link')
  })
})
