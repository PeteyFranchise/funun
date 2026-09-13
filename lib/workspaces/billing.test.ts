import {
  loadWorkspaceBillingSnapshot,
  resolveWorkspaceWritesAllowed,
  workspaceBillingStatusLabel,
  workspacePlanLabel,
  workspaceStatusAllowsWrites,
} from '@/lib/workspaces/billing'

describe('workspace billing', () => {
  it('keeps beta and paid-active workspaces writable', () => {
    expect(workspaceStatusAllowsWrites('beta_active')).toBe(true)
    expect(workspaceStatusAllowsWrites('active')).toBe(true)
  })

  it.each(['past_due', 'paused', 'canceled'] as const)(
    'makes %s read-only without describing deletion',
    status => {
      expect(workspaceStatusAllowsWrites(status)).toBe(false)
      expect(workspaceBillingStatusLabel(status)).toContain('Read-only')
    }
  )

  it('labels the workspace plan independently', () => {
    expect(workspacePlanLabel('beta_free')).toBe('Beta workspace')
  })

  it('normalizes a valid service snapshot', async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                workspace_id: 'workspace-1',
                plan_key: 'beta_free',
                status: 'beta_active',
                current_period_end: null,
                updated_at: '2026-09-13T00:00:00.000Z',
              },
              error: null,
            }),
          }),
        }),
      }),
      rpc: async () => ({ data: true, error: null }),
    }

    await expect(loadWorkspaceBillingSnapshot(client, 'workspace-1')).resolves.toEqual({
      workspaceId: 'workspace-1',
      plan: 'beta_free',
      status: 'beta_active',
      currentPeriodEnd: null,
      updatedAt: '2026-09-13T00:00:00.000Z',
      writesAllowed: true,
    })
  })

  it('fails closed on malformed or unavailable snapshots', async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: { status: 'surprise' }, error: null }) }),
        }),
      }),
      rpc: async () => ({ data: null, error: new Error('offline') }),
    }

    await expect(loadWorkspaceBillingSnapshot(client, 'workspace-1')).resolves.toBeNull()
    await expect(resolveWorkspaceWritesAllowed(client, 'workspace-1')).resolves.toBeNull()
  })

  it('returns the database write decision verbatim', async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
        }),
      }),
      rpc: async () => ({ data: false, error: null }),
    }
    await expect(resolveWorkspaceWritesAllowed(client, 'workspace-1')).resolves.toBe(false)
  })
})
