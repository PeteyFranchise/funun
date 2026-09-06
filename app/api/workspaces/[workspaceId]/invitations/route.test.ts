import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { INVITATION_RATE_LIMIT } from '@/lib/workspaces/invitations'
import { POST } from './route'

// ─── F10 hotfix (260906-phase38-p0-security-hotfix) ────────────────────────
// check_rate_limit (migration 116) returns TRUE at/over the limit and does
// NOT record the blocked attempt. This route previously named that result
// `withinLimit` and guarded with `if (!withinLimit) return 429` — exactly
// backwards: attempts 1-20 were refused while accumulating hits, and
// attempt 21 onward passed through unbounded for the rest of the window.
//
// This test deliberately does NOT mock checkRateLimit's boolean return per
// call (the ambiguous name is what let the inverted polarity go unnoticed).
// Instead it drives the REAL checkRateLimit() (lib/security/rate-limit.ts,
// unmocked) against an in-memory RPC backend that mirrors check_rate_limit's
// own prune+count+insert-or-block body, then sends
// INVITATION_RATE_LIMIT.maxAttempts + 1 real requests through the real route
// handler and asserts on the route's actual HTTP response codes.
//
// Every request body is deliberately invalid (missing required fields) so a
// request that gets PAST the rate limiter fails Zod validation with 400,
// not 429 — this cleanly distinguishes "the limiter let this through" from
// "the limiter blocked this," without needing to mock the invitation
// insert/email send path, which sits well past the rate-limit gate.

jest.mock('@/lib/supabase/server', () => ({
  createApiClient: jest.fn(),
  createServiceClient: jest.fn(),
}))

const WORKSPACE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const OWNER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

function buildSessionClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: OWNER_ID, app_metadata: {} } } }) },
    from: jest.fn((table: string) => {
      if (table === 'workspace_members') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { role: 'owner', status: 'active', expires_at: null },
                  error: null,
                }),
              }),
            }),
          }),
        }
      }
      throw new Error(`unexpected table on the session client: ${table}`)
    }),
  }
}

// Mirrors check_rate_limit's (migration 116) own body: at/over p_max
// returns TRUE WITHOUT recording the attempt; under p_max records the hit
// and returns FALSE. Also answers the D-56/WS-31 kill-switch lookup that
// requireWorkspaceAccess now performs first (F7 hotfix) — enabled: true, so
// the membership gate is reached on every call.
function buildServiceClient(hits: number[]) {
  return {
    from: jest.fn((table: string) => {
      if (table === 'workspace_access_config') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: { enabled: true }, error: null }) }),
          }),
        }
      }
      throw new Error(`unexpected table on the service client: ${table}`)
    }),
    rpc: jest.fn(async (fn: string, args: { p_max: number }) => {
      if (fn !== 'check_rate_limit') throw new Error(`unexpected rpc: ${fn}`)
      if (hits.length >= args.p_max) return { data: true, error: null }
      hits.push(Date.now())
      return { data: false, error: null }
    }),
  }
}

function invalidBodyRequest() {
  return new Request(`http://t.local/api/workspaces/${WORKSPACE_ID}/invitations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
}

describe('POST /api/workspaces/[workspaceId]/invitations — rate-limit polarity (F10)', () => {
  it('allows attempt 1 through the limiter and refuses attempt max+1 with 429', async () => {
    const hits: number[] = []
    ;(createApiClient as jest.Mock).mockResolvedValue(buildSessionClient())
    ;(createServiceClient as jest.Mock).mockReturnValue(buildServiceClient(hits))

    const params = Promise.resolve({ workspaceId: WORKSPACE_ID })

    // Attempt 1: must pass the limiter. It fails validation instead (400),
    // which is only reachable AFTER the limiter has let the request through.
    const first = await POST(invalidBodyRequest(), { params })
    expect(first.status).toBe(400)

    // Consume the remaining budget (attempts 2..max).
    for (let i = 1; i < INVITATION_RATE_LIMIT.maxAttempts; i++) {
      const res = await POST(invalidBodyRequest(), { params })
      expect(res.status).not.toBe(429)
    }

    // Attempt max+1: must be refused by the limiter itself, before body
    // validation ever runs.
    const overLimit = await POST(invalidBodyRequest(), { params })
    expect(overLimit.status).toBe(429)
    const body = await overLimit.json()
    expect(body.error).toMatch(/Too many invitations/)
  })
})
