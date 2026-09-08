import { assessPlaybookActivationPreflight } from '@/lib/playbook/activation-preflight'

const candidate201 = '-- CANDIDATE migration 201\n-- HUMAN-GATED\nSELECT 1;'
const candidate202 = '-- CANDIDATE migration 202\n-- HUMAN-GATED\nSELECT 1;'

describe('Playbook activation file preflight', () => {
  it('stays blocked while reserved Phase 38.2 migrations are absent', () => {
    const result = assessPlaybookActivationPreflight({
      activeMigrationFiles: ['198_workspace_transactional_rpcs.sql'],
      candidate201,
      candidate202,
    })

    expect(result.readyForPromotionReview).toBe(false)
    expect(result.checks.filter(check => !check.passed).map(check => check.key)).toEqual(['migration-199', 'migration-200'])
  })

  it('becomes ready for human promotion review only when the sequence is complete', () => {
    const result = assessPlaybookActivationPreflight({
      activeMigrationFiles: ['199_billing.sql', '200_beta_flag.sql'],
      candidate201,
      candidate202,
    })

    expect(result.readyForPromotionReview).toBe(true)
  })

  it('fails closed for an active-number collision or a stripped human gate', () => {
    const collision = assessPlaybookActivationPreflight({
      activeMigrationFiles: ['199_billing.sql', '200_beta.sql', '201_other.sql'],
      candidate201,
      candidate202: '-- CANDIDATE migration 202',
    })

    expect(collision.readyForPromotionReview).toBe(false)
    expect(collision.checks.filter(check => !check.passed).map(check => check.key)).toEqual(['candidate-202', 'no-active-collision'])
  })
})
