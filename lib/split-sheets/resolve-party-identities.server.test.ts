// resolvePartyIdentitiesForSheet — mocked service client, matching
// __tests__/approve-token-identity-action.test.ts:22-42's style: a fake
// service client that returns canned per-table results so a test can drive
// the resolver's resolution order directly, with no real database.

const mockCreateServiceClient = jest.fn()
jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: (...args: unknown[]) => mockCreateServiceClient(...args),
}))

import { resolvePartyIdentitiesForSheet } from './resolve-party-identities.server'

const SHEET_ID = 'sheet-1'

type TableResults = Record<string, unknown>

/**
 * A minimal fake query builder. `.maybeSingle()` resolves with the table's
 * configured single-row result; awaiting the builder directly (no
 * `.maybeSingle()`, matching how the resolver reads esign_envelopes/
 * collaborators/user_profiles) resolves with the table's configured
 * array result.
 */
function makeService(results: TableResults) {
  const from = jest.fn((table: string) => {
    const rowResult = results[table] ?? { data: null, error: null }
    const q: Record<string, unknown> = {}
    q.select = jest.fn(() => q)
    q.eq = jest.fn(() => q)
    q.in = jest.fn(() => q)
    q.maybeSingle = jest.fn(() => Promise.resolve(rowResult))
    // Awaiting the builder directly (thenable) — used for array reads.
    ;(q as unknown as { then: Promise<unknown>['then'] }).then = (resolve, reject) =>
      Promise.resolve(rowResult).then(resolve, reject)
    return q
  })
  return { from }
}

function sheetRow(status: string, parties: Record<string, unknown>[]) {
  return { data: { id: SHEET_ID, status, split_sheet_parties: parties }, error: null }
}

function party(overrides: Record<string, unknown> = {}) {
  return {
    id: 'party-1',
    collaborator_id: null,
    user_id: null,
    name: 'Jane Smith',
    email: 'jane@test.local',
    role: 'composer_lyricist',
    split_percentage: 50,
    approval_status: 'pending',
    identity_source: 'unknown',
    identity_digest_at_approval: null,
    legal_name: 'Frozen Legal Name',
    pro: 'ASCAP',
    ipi: '00000000001',
    publishing_designee: 'Frozen Publishing',
    administrator: 'Frozen Admin Co',
    ...overrides,
  }
}

beforeEach(() => {
  mockCreateServiceClient.mockReset()
})

describe('resolvePartyIdentitiesForSheet', () => {
  it('post-mint WITH a snapshot returns the persisted snapshot verbatim, not the live party row', async () => {
    const snapshotIdentity = {
      legal_name: 'Snapshot Name',
      pro: 'SESAC',
      ipi: '99999999999',
      publishing_designee: 'Snapshot Publishing',
      administrator: 'Snapshot Admin',
    }
    const service = makeService({
      split_sheets: sheetRow('esign_pending', [party()]),
      esign_envelopes: {
        data: [
          {
            id: 'env-1',
            status: 'completed',
            created_at: '2026-09-01T00:00:00Z',
            party_identity_snapshot: [{ partyId: 'party-1', identity: snapshotIdentity }],
          },
        ],
        error: null,
      },
    })
    mockCreateServiceClient.mockReturnValue(service)

    const result = await resolvePartyIdentitiesForSheet(SHEET_ID)

    expect(result.status).toBe('esign_pending')
    expect(result.parties).toHaveLength(1)
    expect(result.parties[0].identity).toEqual(snapshotIdentity)
    // NOT the party row's frozen values — proves it read the snapshot, not the row.
    expect(result.parties[0].identity.legal_name).not.toBe('Frozen Legal Name')
  })

  it('post-mint with NO snapshot falls back to the party row unchanged', async () => {
    const service = makeService({
      split_sheets: sheetRow('esign_pending', [party()]),
      esign_envelopes: { data: [], error: null },
    })
    mockCreateServiceClient.mockReturnValue(service)

    const result = await resolvePartyIdentitiesForSheet(SHEET_ID)

    expect(result.parties[0].identity).toEqual({
      legal_name: 'Frozen Legal Name',
      pro: 'ASCAP',
      ipi: '00000000001',
      publishing_designee: 'Frozen Publishing',
      administrator: 'Frozen Admin Co',
    })
  })

  it('a voided envelope’s snapshot is ignored in favour of the current (non-voided) one', async () => {
    const voidedIdentity = {
      legal_name: 'Voided Name',
      pro: 'VOIDED-PRO',
      ipi: null,
      publishing_designee: null,
      administrator: null,
    }
    const currentIdentity = {
      legal_name: 'Current Name',
      pro: 'ASCAP',
      ipi: null,
      publishing_designee: null,
      administrator: null,
    }
    const service = makeService({
      split_sheets: sheetRow('esign_pending', [party()]),
      esign_envelopes: {
        data: [
          {
            id: 'env-voided',
            status: 'voided',
            created_at: '2026-09-05T00:00:00Z', // more recent, but voided
            party_identity_snapshot: [{ partyId: 'party-1', identity: voidedIdentity }],
          },
          {
            id: 'env-current',
            status: 'pending',
            created_at: '2026-09-01T00:00:00Z',
            party_identity_snapshot: [{ partyId: 'party-1', identity: currentIdentity }],
          },
        ],
        error: null,
      },
    })
    mockCreateServiceClient.mockReturnValue(service)

    const result = await resolvePartyIdentitiesForSheet(SHEET_ID)

    expect(result.parties[0].identity).toEqual(currentIdentity)
  })

  it('an unclaimed party is never given invented identity (pre-mint, no collaborator link)', async () => {
    const service = makeService({
      split_sheets: sheetRow('draft', [party({ collaborator_id: null })]),
    })
    mockCreateServiceClient.mockReturnValue(service)

    const result = await resolvePartyIdentitiesForSheet(SHEET_ID)

    expect(result.parties[0].identity).toEqual({
      legal_name: 'Frozen Legal Name',
      pro: 'ASCAP',
      ipi: '00000000001',
      publishing_designee: 'Frozen Publishing',
      administrator: 'Frozen Admin Co',
    })
  })

  it('pre-mint: a claimed party’s live profile overwrites person-scoped fields but never a work-specific one already on the row (Ruling 2)', async () => {
    const service = makeService({
      split_sheets: sheetRow('draft', [party({ collaborator_id: 'collab-1' })]),
      collaborators: { data: [{ id: 'collab-1', claimed_by: 'user-1' }], error: null },
      user_profiles: {
        data: [
          {
            id: 'user-1',
            pro: 'BMI',
            ipi: '00000000002',
            publisher: 'Live Publishing',
            administrator: 'Live Admin',
            legal_first_name: 'Live',
            legal_middle_name: null,
            legal_last_name: 'Name',
            legal_name_suffix: null,
          },
        ],
        error: null,
      },
    })
    mockCreateServiceClient.mockReturnValue(service)

    const result = await resolvePartyIdentitiesForSheet(SHEET_ID)
    const identity = result.parties[0].identity

    expect(identity.pro).toBe('BMI')
    expect(identity.ipi).toBe('00000000002')
    expect(identity.legal_name).toBe('Live Name')
    // Work-specific — the party row already has a value, so the profile default never lands.
    expect(identity.publishing_designee).toBe('Frozen Publishing')
    expect(identity.administrator).toBe('Frozen Admin Co')
  })

  it('carries the non-identity fields callers need alongside the resolved identity', async () => {
    const service = makeService({
      split_sheets: sheetRow('draft', [
        party({
          id: 'party-9',
          collaborator_id: 'collab-9',
          user_id: 'user-9',
          approval_status: 'approved',
          identity_source: 'inviter_supplied',
          identity_digest_at_approval: 'abc123',
        }),
      ]),
      collaborators: { data: [], error: null },
    })
    mockCreateServiceClient.mockReturnValue(service)

    const result = await resolvePartyIdentitiesForSheet(SHEET_ID)
    const resolvedParty = result.parties[0]

    expect(resolvedParty.partyId).toBe('party-9')
    expect(resolvedParty.collaborator_id).toBe('collab-9')
    expect(resolvedParty.user_id).toBe('user-9')
    expect(resolvedParty.approval_status).toBe('approved')
    expect(resolvedParty.identity_source).toBe('inviter_supplied')
    expect(resolvedParty.identity_digest_at_approval).toBe('abc123')
  })

  it('throws when the sheet cannot be found, rather than silently returning empty', async () => {
    const service = makeService({
      split_sheets: { data: null, error: null },
    })
    mockCreateServiceClient.mockReturnValue(service)

    await expect(resolvePartyIdentitiesForSheet('missing-sheet')).rejects.toThrow()
  })
})
