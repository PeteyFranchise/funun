// ─── Invite allowlist — shared twin-parity fixture table ─────────────────
// Single source of truth for BOTH sides of the artist-signup allowlist
// check (27-RESEARCH Pitfall 3 — SQL/TS drift): lib/invites/allowlist.test.ts
// drives isArtistEmailAllowed() against these scenarios, and
// __tests__/migration-098-gate.test.ts asserts migration 098's SQL EXISTS
// predicate structurally covers the same allowlist sources. Pure data, no
// I/O — safe to import from either a Jest unit test or a migration-content
// test.

export type InviteAllowlistScenario = {
  name: string
  email: string
  collaboratorEmails: string[]
  inviteRows: { email: string; status: 'pending' | 'accepted' | 'expired'; expired: boolean }[]
  expected: boolean
}

export const INVITE_ALLOWLIST_SCENARIOS: InviteAllowlistScenario[] = [
  {
    name: 'collaborator-only match is allowed',
    email: 'collab@example.com',
    collaboratorEmails: ['collab@example.com'],
    inviteRows: [],
    expected: true,
  },
  {
    name: 'pending non-expired invite match is allowed',
    email: 'invitee@example.com',
    collaboratorEmails: [],
    inviteRows: [{ email: 'invitee@example.com', status: 'pending', expired: false }],
    expected: true,
  },
  {
    name: 'expired invite only is denied',
    email: 'lapsed@example.com',
    collaboratorEmails: [],
    inviteRows: [{ email: 'lapsed@example.com', status: 'pending', expired: true }],
    expected: false,
  },
  {
    name: 'already-accepted invite only (no collaborator row) is denied',
    email: 'already-in@example.com',
    collaboratorEmails: [],
    inviteRows: [{ email: 'already-in@example.com', status: 'accepted', expired: false }],
    expected: false,
  },
  {
    name: 'no matching rows anywhere is denied',
    email: 'nobody@example.com',
    collaboratorEmails: [],
    inviteRows: [],
    expected: false,
  },
  {
    name: 'mixed-case email still matches a lowercase collaborator row',
    email: 'MixedCase@Example.com',
    collaboratorEmails: ['mixedcase@example.com'],
    inviteRows: [],
    expected: true,
  },
]
