import {
  certificationIsCurrent,
  dependencyImpact,
  featureIsAvailable,
  operationalEntityHref,
  parseSimulationScenario,
  resolveSlaDueAt,
  simulationReviewStatus,
  slaState,
  sortInbox,
} from '@/lib/playbook/operational-v1'

const now = new Date('2026-09-08T16:00:00Z')

describe('Playbook operational v1 helpers', () => {
  it('fails feature access closed and lets emergency disable win', () => {
    const grants = [{ active: true, memberActive: true, expiresAt: null }]
    expect(featureIsAvailable(null, grants, now)).toBe(false)
    expect(
      featureIsAvailable(
        { enabled: true, emergencyDisabled: true },
        grants,
        now
      )
    ).toBe(false)
    expect(
      featureIsAvailable(
        { enabled: true, emergencyDisabled: false },
        grants,
        now
      )
    ).toBe(true)
    expect(
      featureIsAvailable(
        { enabled: true, emergencyDisabled: false },
        [{ ...grants[0], expiresAt: '2026-09-01T00:00:00Z' }],
        now
      )
    ).toBe(false)
  })

  it('classifies and sorts SLA work by urgency then severity', () => {
    expect(
      slaState({ complete: false, dueAt: '2026-09-08T15:00:00Z' }, now)
    ).toBe('overdue')
    expect(
      slaState({ complete: false, dueAt: '2026-09-09T10:00:00Z' }, now)
    ).toBe('due_soon')
    const sorted = sortInbox(
      [
        {
          id: 'later',
          kind: 'reading',
          title: 'Later',
          dueAt: '2026-09-20T00:00:00Z',
          complete: false,
        },
        {
          id: 'incident',
          kind: 'incident',
          title: 'Incident',
          dueAt: '2026-09-08T15:00:00Z',
          complete: false,
          severity: 1,
        },
      ],
      now
    )
    expect(sorted[0].id).toBe('incident')
    expect(
      resolveSlaDueAt(
        {
          kind: 'incident',
          roomId: 'room',
          severity: 1,
          openedAt: '2026-09-08T12:00:00Z',
          dueAt: null,
        },
        [
          {
            workKind: 'incident',
            roomId: null,
            severity: null,
            resolveMinutes: 1440,
          },
          {
            workKind: 'incident',
            roomId: 'room',
            severity: 1,
            resolveMinutes: 60,
          },
        ]
      )
    ).toBe('2026-09-08T13:00:00.000Z')
  })

  it('identifies downstream records affected by a revision', () => {
    expect(
      dependencyImpact(
        [
          {
            active: true,
            sourceRevisionNumber: 2,
            targetKind: 'workflow_template',
          },
          {
            active: false,
            sourceRevisionNumber: 1,
            targetKind: 'learning_path',
          },
        ],
        3
      )
    ).toEqual({
      affected: 1,
      byKind: { workflow_template: 1 },
      blocksSilentPublish: true,
    })
  })

  it('accepts bounded simulation prompts and derives human review state', () => {
    expect(
      parseSimulationScenario({
        prompts: ['What happened?', 'What do you do?'],
      })
    ).toHaveLength(2)
    expect(parseSimulationScenario({ prompts: [] })).toBeNull()
    expect(simulationReviewStatus(95, 80, false)).toBe('passed')
    expect(simulationReviewStatus(95, 80, true)).toBe('remediation')
  })

  it('expires or revokes certifications and builds only internal hrefs', () => {
    expect(
      certificationIsCurrent(
        { revokedAt: null, expiresAt: '2027-01-01T00:00:00Z' },
        now
      )
    ).toBe(true)
    expect(
      certificationIsCurrent(
        { revokedAt: '2026-09-08T12:00:00Z', expiresAt: null },
        now
      )
    ).toBe(false)
    expect(operationalEntityHref('deal', 'abc/123')).toBe(
      '/admin/deals/abc%2F123'
    )
  })
})
