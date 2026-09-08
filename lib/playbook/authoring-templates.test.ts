import { PLAYBOOK_AUTHORING_TEMPLATES, findPlaybookAuthoringTemplate } from '@/lib/playbook/authoring-templates'
import { safeParsePlaybookContent } from '@/lib/playbook/content'

describe('Playbook native authoring templates', () => {
  it('has unique stable keys and all six approved starting points', () => {
    expect(new Set(PLAYBOOK_AUTHORING_TEMPLATES.map(template => template.key)).size).toBe(PLAYBOOK_AUTHORING_TEMPLATES.length)
    expect(PLAYBOOK_AUTHORING_TEMPLATES.map(template => template.key)).toEqual([
      'doctrine', 'sop', 'policy', 'training-guide', 'runbook', 'gameplan-topic',
    ])
  })

  it('produces content accepted by the existing entry schemas', () => {
    for (const template of PLAYBOOK_AUTHORING_TEMPLATES) {
      const content = template.entryType === 'document'
        ? { schemaVersion: 1, format: 'markdown', body: template.body }
        : template.entryType === 'sop'
          ? { items: template.body.split('\n') }
          : { questions: template.body.split('\n') }
      expect(safeParsePlaybookContent(template.entryType, content).success).toBe(true)
    }
  })

  it('returns null for an unknown template key', () => {
    expect(findPlaybookAuthoringTemplate('unknown')).toBeNull()
  })
})
