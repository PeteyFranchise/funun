import {
  resolveLeadRecipient,
  buildAeAssignedNotification,
  buildLeadRoutedNotification,
} from '@/lib/staff/notifications'

const AE_UUID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const LEADERSHIP_UUID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const ORG_UUID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const ACTOR_UUID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'

describe('resolveLeadRecipient', () => {
  it('returns the assigned ae_user_id when present', () => {
    expect(resolveLeadRecipient({ ae_user_id: AE_UUID }, LEADERSHIP_UUID)).toBe(AE_UUID)
  })

  it('falls back to the leadership id when ae_user_id is null', () => {
    expect(resolveLeadRecipient({ ae_user_id: null }, LEADERSHIP_UUID)).toBe(LEADERSHIP_UUID)
  })

  it('falls back to the leadership id when the org itself is null (unassigned company still routes somewhere)', () => {
    expect(resolveLeadRecipient(null, LEADERSHIP_UUID)).toBe(LEADERSHIP_UUID)
  })

  it('falls back to the leadership id when the org is undefined', () => {
    expect(resolveLeadRecipient(undefined, LEADERSHIP_UUID)).toBe(LEADERSHIP_UUID)
  })
})

describe('buildAeAssignedNotification', () => {
  const args = { recipientId: AE_UUID, orgId: ORG_UUID, orgName: 'Acme Sync', actorId: ACTOR_UUID }

  it('returns a createNotification-compatible payload: type ae_assigned, title names the company, link to the company admin surface, userId=recipientId', () => {
    const payload = buildAeAssignedNotification(args)
    expect(payload.userId).toBe(AE_UUID)
    expect(payload.type).toBe('ae_assigned')
    expect(payload.title).toContain('Acme Sync')
    expect(payload.link).toContain(ORG_UUID)
  })

  it('is pure — calling twice with the same args returns equal objects, no I/O', () => {
    expect(buildAeAssignedNotification(args)).toEqual(buildAeAssignedNotification(args))
  })
})

describe('buildLeadRoutedNotification', () => {
  const args = { recipientId: LEADERSHIP_UUID, orgId: ORG_UUID, orgName: 'Acme Sync', actorId: null }

  it('returns a createNotification-compatible payload: type lead_routed, userId=recipientId', () => {
    const payload = buildLeadRoutedNotification(args)
    expect(payload.userId).toBe(LEADERSHIP_UUID)
    expect(payload.type).toBe('lead_routed')
    expect(payload.title).toContain('Acme Sync')
  })

  it('is pure — calling twice with the same args returns equal objects, no I/O', () => {
    expect(buildLeadRoutedNotification(args)).toEqual(buildLeadRoutedNotification(args))
  })
})
