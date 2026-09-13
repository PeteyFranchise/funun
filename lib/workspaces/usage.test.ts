import {
  formatWorkspaceUsage,
  normalizeWorkspaceUsageTotals,
  recordWorkspaceUsageBestEffort,
} from '@/lib/workspaces/usage'

describe('workspace beta usage', () => {
  it('normalizes only allowlisted, non-negative safe totals', () => {
    expect(normalizeWorkspaceUsageTotals([
      { metric: 'ai_requests', total_quantity: '12' },
      { metric: 'ai_input_tokens', total_quantity: -1 },
      { metric: 'prompt_contents', total_quantity: 99 },
    ])).toMatchObject({ ai_requests: 12, ai_input_tokens: 0 })
  })

  it('formats storage and processing time for the workspace surface', () => {
    expect(formatWorkspaceUsage('storage_bytes_ingested', 1024 ** 2)).toBe('1.0 MB')
    expect(formatWorkspaceUsage('audio_processing_seconds', 3720)).toBe('1h 2m')
  })

  it('records observations without throwing into the creative action', async () => {
    const client = {
      rpc: jest.fn().mockRejectedValue(new Error('schema unavailable')),
    }
    await expect(recordWorkspaceUsageBestEffort(client as never, {
      workspaceId: '00000000-0000-0000-0000-000000000001',
      metric: 'ai_requests',
      quantity: 1,
      idempotencyKey: 'lyric-lift:run:1',
      sourceKind: 'ai',
    })).resolves.toBe(false)
  })

  it('rejects invalid observations before making an RPC', async () => {
    const client = { rpc: jest.fn() }
    await expect(recordWorkspaceUsageBestEffort(client as never, {
      workspaceId: '00000000-0000-0000-0000-000000000001',
      metric: 'ai_requests',
      quantity: 0,
      idempotencyKey: 'bad',
      sourceKind: 'ai',
    })).resolves.toBe(false)
    expect(client.rpc).not.toHaveBeenCalled()
  })
})
