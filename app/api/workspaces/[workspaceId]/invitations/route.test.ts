import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email'
import { INVITATION_RATE_LIMIT } from '@/lib/workspaces/invitations'
import { DELETE, POST } from './route'

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

jest.mock('@/lib/email', () => ({ sendEmail: jest.fn(async () => ({ ok: true })) }))

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

// ─── WSR-19 / R-13 — no restricted PII in the audit `changes` column ───────
// `workspace_audit_log.changes` is BROADLY READABLE: migration 186's
// audit-visibility helper makes it reachable by every active seat on the
// workspace, including a guest. The issuance handler used to write
// `changes: { role, email: normalizedEmail }`, which put an invited person's
// address in front of every one of them.
//
// These cases assert on the row the route actually handed to
// `workspace_audit_log.insert()` — recorded by the stub client — rather than
// on the source text, and they iterate a LIST of restricted key names rather
// than checking `email` alone, so a future writer who adds `contactEmail` or
// nests an address one level down fails here too.
//
// The second layer is in the database: migration 197 section (f)'s
// `guard_workspace_audit_log_no_restricted_pii` refuses these keys at ANY
// depth on INSERT, so the current payload would not merely leak — once 197
// applies it would make invitation issuance FAIL OUTRIGHT.

const RESTRICTED_CHANGE_KEYS = [
  'email',
  'phone',
  'contact_email',
  'contactEmail',
  'contact_phone',
  'address',
  'tax_id',
  'token',
  'token_hash',
  'ipi',
  'isni',
]

const INVITEE_EMAIL = 'invitee@example.com'
const INVITATION_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'

type AuditRes = { data: unknown; error: { message: string } | null }

/** Chainable, awaitable PostgREST stub. */
function auditThenable(get: () => AuditRes) {
  const q: Record<string, unknown> = {}
  const self = () => q
  q.select = self
  q.eq = self
  q.order = self
  q.maybeSingle = self
  q.single = self
  q.then = (resolve: (value: AuditRes) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve(get()).then(resolve, reject)
  return q
}

/** Every key reachable anywhere inside a recorded `changes` object. */
function collectKeys(value: unknown, found: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach(entry => collectKeys(entry, found))
  else if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      found.push(key)
      collectKeys(entry, found)
    }
  }
  return found
}

function buildAuditServiceClient(opts: { revokeTarget?: Record<string, unknown> } = {}) {
  const audits: Record<string, unknown>[] = []

  return {
    audits,
    rpc: jest.fn(async (fn: string) => {
      if (fn === 'check_rate_limit') return { data: false, error: null }
      if (fn === 'find_auth_user_id_by_email') return { data: null, error: null }
      throw new Error(`unexpected rpc: ${fn}`)
    }),
    from: jest.fn((table: string) => {
      if (table === 'workspace_access_config') {
        return auditThenable(() => ({ data: { enabled: true }, error: null }))
      }

      if (table === 'workspace_invitations') {
        return {
          select: () =>
            auditThenable(() => ({
              data: opts.revokeTarget ?? null,
              error: null,
            })),
          insert: () => auditThenable(() => ({ data: { id: INVITATION_ID }, error: null })),
          update: () => auditThenable(() => ({ data: null, error: null })),
        }
      }

      if (table === 'workspace_members') {
        return {
          select: () => auditThenable(() => ({ data: null, error: null })),
          insert: () => auditThenable(() => ({ data: null, error: null })),
          update: () => auditThenable(() => ({ data: null, error: null })),
        }
      }

      if (table === 'workspaces') {
        return {
          select: () => auditThenable(() => ({ data: { name: 'Test Workspace' }, error: null })),
        }
      }

      if (table === 'user_profiles') {
        return {
          select: () =>
            auditThenable(() => ({ data: { display_name: 'An Owner' }, error: null })),
        }
      }

      if (table === 'workspace_audit_log') {
        return {
          insert: (row: Record<string, unknown>) => {
            audits.push(row)
            return auditThenable(() => ({ data: null, error: null }))
          },
        }
      }

      throw new Error(`unexpected table on the service client: ${table}`)
    }),
  }
}

function inviteRequest(body: Record<string, unknown>) {
  return new Request(`http://t.local/api/workspaces/${WORKSPACE_ID}/invitations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function revokeRequest(invitationId: string) {
  return new Request(`http://t.local/api/workspaces/${WORKSPACE_ID}/invitations`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ invitationId }),
  })
}

describe('WSR-19 — the invited address never reaches workspace_audit_log.changes', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(sendEmail as jest.Mock).mockResolvedValue({ ok: true })
  })

  it('WSR-19: issuance writes an audit row whose changes carries no restricted key', async () => {
    const service = buildAuditServiceClient()
    ;(createApiClient as jest.Mock).mockResolvedValue(buildSessionClient())
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(inviteRequest({ email: INVITEE_EMAIL, role: 'member' }), {
      params: Promise.resolve({ workspaceId: WORKSPACE_ID }),
    })

    expect(res.status).toBe(200)
    expect(service.audits).toHaveLength(1)

    const changes = service.audits[0].changes as Record<string, unknown>
    expect(changes).toEqual({ role: 'member' })

    // Iterated, not a single-key check: a synonym or a nested address must
    // fail here too.
    const keys = collectKeys(changes)
    for (const restricted of RESTRICTED_CHANGE_KEYS) {
      expect(keys).not.toContain(restricted)
    }

    // The address must not survive as a VALUE under an innocuous key either.
    expect(JSON.stringify(changes)).not.toContain(INVITEE_EMAIL)
  })

  it('WSR-19: still returns the invited address in the HTTP response body', async () => {
    const service = buildAuditServiceClient()
    ;(createApiClient as jest.Mock).mockResolvedValue(buildSessionClient())
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(inviteRequest({ email: INVITEE_EMAIL, role: 'member' }), {
      params: Promise.resolve({ workspaceId: WORKSPACE_ID }),
    })

    // The caller is already gated to owner or admin and is entitled to see
    // the address they just invited — only the broadly-readable AUDIT row is
    // narrowed, never the response to the person who acted.
    const body = await res.json()
    expect(body.data.email).toBe(INVITEE_EMAIL)
    expect(body.data.role).toBe('member')
  })

  it('WSR-19: the revoke handler audit row carries no restricted key either', async () => {
    const service = buildAuditServiceClient({
      revokeTarget: {
        id: INVITATION_ID,
        status: 'pending',
        email: INVITEE_EMAIL,
        role: 'member',
      },
    })
    ;(createApiClient as jest.Mock).mockResolvedValue(buildSessionClient())
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await DELETE(revokeRequest(INVITATION_ID), {
      params: Promise.resolve({ workspaceId: WORKSPACE_ID }),
    })

    expect(res.status).toBe(200)
    expect(service.audits).toHaveLength(1)

    const changes = service.audits[0].changes as Record<string, unknown>
    const keys = collectKeys(changes)
    for (const restricted of RESTRICTED_CHANGE_KEYS) {
      expect(keys).not.toContain(restricted)
    }
    expect(JSON.stringify(changes)).not.toContain(INVITEE_EMAIL)
  })

  it('WSR-19: EVERY audit row this file writes is swept, not just the issuance one', async () => {
    // The finding named one call site. This case exists to establish that it
    // was the only one, by driving both handlers that log and checking the
    // recorded payloads together.
    const issuance = buildAuditServiceClient()
    ;(createApiClient as jest.Mock).mockResolvedValue(buildSessionClient())
    ;(createServiceClient as jest.Mock).mockReturnValue(issuance)
    await POST(inviteRequest({ email: INVITEE_EMAIL, role: 'contractor' }), {
      params: Promise.resolve({ workspaceId: WORKSPACE_ID }),
    })

    const revoke = buildAuditServiceClient({
      revokeTarget: {
        id: INVITATION_ID,
        status: 'pending',
        email: INVITEE_EMAIL,
        role: 'contractor',
      },
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(revoke)
    await DELETE(revokeRequest(INVITATION_ID), {
      params: Promise.resolve({ workspaceId: WORKSPACE_ID }),
    })

    const everyAudit = [...issuance.audits, ...revoke.audits]
    expect(everyAudit).toHaveLength(2)

    for (const row of everyAudit) {
      const keys = collectKeys(row.changes)
      for (const restricted of RESTRICTED_CHANGE_KEYS) {
        expect(keys).not.toContain(restricted)
      }
    }
  })
})
