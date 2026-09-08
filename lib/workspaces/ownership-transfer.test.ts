import { readFileSync } from 'fs'
import { join } from 'path'
import {
  assertMayNominate,
  assertMayRespond,
  describeOwnershipTransferEffect,
  isLegalOwnershipTransition,
  OWNERSHIP_LEGAL_EDGES,
  OWNERSHIP_TRANSFER_EFFECT,
  OWNERSHIP_TRANSFER_STATE_VALUES,
  type OwnershipTransferState,
} from '@/lib/workspaces/ownership-transfer'

// ─── What this suite is, and what it is NOT ─────────────────────────────
// This repo has no live-Postgres test harness (RESEARCH.md §13 pitfall 1:
// "text-lock tests cannot catch this class of bug"), and migration 197 has
// not been pushed. So until it is, THIS SUITE IS THE ONLY AUTOMATED PROOF
// OF THE R-05 RULES THAT EXISTS. Name the limitation rather than let it be
// assumed away: everything asserted here is asserted about a pure
// TypeScript module. It proves the decision layer refuses self-dealing and
// self-promotion; it proves NOTHING about whether the database refuses
// them, because a pure module cannot exercise a CHECK constraint, a
// trigger, or an RPC.
//
// The behavioural proof is plan 17's owner-run harness (R-30: the
// single-shot production window pattern proven in 38.0.1 Part B — seed,
// enable the kill switch, assert, tear down and restore inside one atomic
// DO block). Until that harness runs green against migration 197, the
// database half of R-05 is unverified. Do not read a green run of this
// file as a green run of the rule.

const WORKSPACE_ID_NAME = 'Ferrari Studios'
const INCUMBENT_OWNER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const SUCCESSOR_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const WORKSPACE_ADMIN_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
const STRANGER_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'

describe('OWNERSHIP_TRANSFER_STATE_VALUES', () => {
  it('names exactly the four states migration 197 CHECK constraint is authored from', () => {
    expect(Array.from(OWNERSHIP_TRANSFER_STATE_VALUES)).toEqual([
      'offered',
      'accepted',
      'declined',
      'withdrawn',
    ])
  })

  it('matches the custody state set it deliberately mirrors', () => {
    expect(OWNERSHIP_TRANSFER_STATE_VALUES).toHaveLength(4)
    expect(OWNERSHIP_TRANSFER_STATE_VALUES).toContain('offered')
  })
})

describe('OWNERSHIP_LEGAL_EDGES', () => {
  it('names exactly the three legal exits from offered', () => {
    expect(Array.from(OWNERSHIP_LEGAL_EDGES.offered).sort()).toEqual(
      ['accepted', 'declined', 'withdrawn'].sort()
    )
  })

  it('holds an empty edge set for every terminal state, so a resolved nomination can never be revived', () => {
    const terminal: OwnershipTransferState[] = ['accepted', 'declined', 'withdrawn']
    for (const state of terminal) {
      expect(OWNERSHIP_LEGAL_EDGES[state].size).toBe(0)
    }
  })

  it('declares an edge set for every state in OWNERSHIP_TRANSFER_STATE_VALUES', () => {
    for (const state of OWNERSHIP_TRANSFER_STATE_VALUES) {
      expect(OWNERSHIP_LEGAL_EDGES[state]).toBeInstanceOf(Set)
    }
  })
})

describe('isLegalOwnershipTransition', () => {
  it('permits offered -> accepted, declined, withdrawn', () => {
    expect(isLegalOwnershipTransition('offered', 'accepted')).toBe(true)
    expect(isLegalOwnershipTransition('offered', 'declined')).toBe(true)
    expect(isLegalOwnershipTransition('offered', 'withdrawn')).toBe(true)
  })

  it('refuses every same-state self-transition', () => {
    for (const state of OWNERSHIP_TRANSFER_STATE_VALUES) {
      expect(isLegalOwnershipTransition(state, state)).toBe(false)
    }
  })

  it('refuses every move out of a terminal state (accepted, declined, withdrawn)', () => {
    const terminal: OwnershipTransferState[] = ['accepted', 'declined', 'withdrawn']
    for (const from of terminal) {
      for (const to of OWNERSHIP_TRANSFER_STATE_VALUES) {
        expect(isLegalOwnershipTransition(from, to)).toBe(false)
      }
    }
  })

  // Walks the whole state x state space and demands the predicate agree
  // with the table for EVERY pair, so an edge added to
  // OWNERSHIP_LEGAL_EDGES without a matching test is impossible.
  it('agrees with OWNERSHIP_LEGAL_EDGES for every state pair, exhaustively', () => {
    for (const from of OWNERSHIP_TRANSFER_STATE_VALUES) {
      for (const to of OWNERSHIP_TRANSFER_STATE_VALUES) {
        const expected = from !== to && OWNERSHIP_LEGAL_EDGES[from].has(to)
        expect({ from, to, legal: isLegalOwnershipTransition(from, to) }).toEqual({
          from,
          to,
          legal: expected,
        })
      }
    }
  })

  it('fails closed on an unknown state value on either side', () => {
    expect(isLegalOwnershipTransition('offered', 'bogus' as unknown as OwnershipTransferState)).toBe(false)
    expect(isLegalOwnershipTransition('bogus' as unknown as OwnershipTransferState, 'accepted')).toBe(false)
    expect(isLegalOwnershipTransition('' as unknown as OwnershipTransferState, 'accepted')).toBe(false)
  })
})

describe('assertMayNominate', () => {
  const activeMemberSuccessor = {
    successorUserId: SUCCESSOR_ID,
    successorRole: 'member' as const,
    successorIsActive: true,
  }

  it('permits an active owner nominating another active member', () => {
    const result = assertMayNominate({
      nominatorRole: 'owner',
      nominatorUserId: INCUMBENT_OWNER_ID,
      ...activeMemberSuccessor,
    })
    expect(result).toEqual({ ok: true })
  })

  it('refuses an admin nominating anyone — only owners may promote to owner (R-05)', () => {
    const result = assertMayNominate({
      nominatorRole: 'admin',
      nominatorUserId: WORKSPACE_ADMIN_ID,
      ...activeMemberSuccessor,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(403)
      expect(result.reason).toContain('R-05')
    }
  })

  it('refuses every non-owner role, not just admin', () => {
    for (const role of ['admin', 'member', 'contractor', 'guest'] as const) {
      const result = assertMayNominate({
        nominatorRole: role,
        nominatorUserId: WORKSPACE_ADMIN_ID,
        ...activeMemberSuccessor,
      })
      expect(result.ok).toBe(false)
    }
  })

  // R-05: "no self-promotion". The degenerate one-actor form of the F1
  // attack — the nominator and the successor being the same person would
  // make the two-sided act unilateral before it even reached
  // assertMayRespond.
  it('refuses a nominator who names themselves as successor — no self-promotion (R-05)', () => {
    const result = assertMayNominate({
      nominatorRole: 'owner',
      nominatorUserId: INCUMBENT_OWNER_ID,
      successorUserId: INCUMBENT_OWNER_ID,
      successorRole: 'owner',
      successorIsActive: true,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(403)
      expect(result.reason).toContain('R-05')
    }
  })

  it('refuses a successor who holds no active seat in this workspace', () => {
    const inactive = assertMayNominate({
      nominatorRole: 'owner',
      nominatorUserId: INCUMBENT_OWNER_ID,
      successorUserId: SUCCESSOR_ID,
      successorRole: 'member',
      successorIsActive: false,
    })
    expect(inactive.ok).toBe(false)
    if (!inactive.ok) expect(inactive.status).toBe(409)

    const stranger = assertMayNominate({
      nominatorRole: 'owner',
      nominatorUserId: INCUMBENT_OWNER_ID,
      successorUserId: STRANGER_ID,
      successorRole: null,
      successorIsActive: true,
    })
    expect(stranger.ok).toBe(false)
    if (!stranger.ok) expect(stranger.status).toBe(409)
  })

  it('refuses a successor who is already the owner — there is nothing to transfer', () => {
    const result = assertMayNominate({
      nominatorRole: 'owner',
      nominatorUserId: INCUMBENT_OWNER_ID,
      successorUserId: SUCCESSOR_ID,
      successorRole: 'owner',
      successorIsActive: true,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(409)
  })

  it('never throws — it refuses', () => {
    expect(() =>
      assertMayNominate({
        nominatorRole: 'guest',
        nominatorUserId: STRANGER_ID,
        successorUserId: STRANGER_ID,
        successorRole: null,
        successorIsActive: false,
      })
    ).not.toThrow()
  })
})

describe('assertMayRespond', () => {
  const parties = {
    fromUserId: INCUMBENT_OWNER_ID,
    toUserId: SUCCESSOR_ID,
    offeredBy: INCUMBENT_OWNER_ID,
  }

  it('permits only the nominated successor to accept', () => {
    expect(assertMayRespond({ parties, actorUserId: SUCCESSOR_ID, action: 'accept' })).toEqual({ ok: true })
  })

  it('refuses an accept attempted by anyone other than the nominated successor', () => {
    const stranger = assertMayRespond({ parties, actorUserId: STRANGER_ID, action: 'accept' })
    expect(stranger.ok).toBe(false)
    if (!stranger.ok) expect(stranger.status).toBe(403)

    const fromIncumbent = assertMayRespond({ parties, actorUserId: INCUMBENT_OWNER_ID, action: 'accept' })
    expect(fromIncumbent.ok).toBe(false)
  })

  it('permits only the nominated successor to decline', () => {
    expect(assertMayRespond({ parties, actorUserId: SUCCESSOR_ID, action: 'decline' })).toEqual({ ok: true })
    expect(assertMayRespond({ parties, actorUserId: STRANGER_ID, action: 'decline' }).ok).toBe(false)
  })

  it('permits offered_by or from_user_id to withdraw', () => {
    expect(assertMayRespond({ parties, actorUserId: INCUMBENT_OWNER_ID, action: 'withdraw' })).toEqual({
      ok: true,
    })
  })

  it('refuses a withdraw attempted by the nominated successor — they may only decline', () => {
    const result = assertMayRespond({ parties, actorUserId: SUCCESSOR_ID, action: 'withdraw' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(403)
  })

  // THE R-05 RULE THIS WHOLE MODULE EXISTS FOR. If a future edit relaxes
  // the self-dealing branch, this test fails with a title that says why the
  // rule exists: one actor performing both sides of a two-sided act is the
  // F1 attack shape, and at the workspace-ownership layer the prize is the
  // workspace itself. This case is not reachable through assertMayNominate
  // today (it refuses nominator === successor) nor through migration 197
  // (CHECK from_user_id <> to_user_id) — assertMayRespond is tested
  // independently of both guarantees precisely so it stays safe if either
  // is ever widened.
  it('refuses the nominator accepting their own nomination even when named as to_user_id — the R-05 self-dealing refusal', () => {
    const selfDealing = {
      fromUserId: INCUMBENT_OWNER_ID,
      toUserId: WORKSPACE_ADMIN_ID,
      offeredBy: WORKSPACE_ADMIN_ID,
    }
    const result = assertMayRespond({ parties: selfDealing, actorUserId: WORKSPACE_ADMIN_ID, action: 'accept' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(403)
      expect(result.reason).toContain('R-05')
      expect(result.reason).toContain('two-sided')
    }
  })

  it('refuses a decline where the responder is also the nominator', () => {
    const selfDealing = {
      fromUserId: INCUMBENT_OWNER_ID,
      toUserId: WORKSPACE_ADMIN_ID,
      offeredBy: WORKSPACE_ADMIN_ID,
    }
    const result = assertMayRespond({ parties: selfDealing, actorUserId: WORKSPACE_ADMIN_ID, action: 'decline' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(403)
  })
})

describe('describeOwnershipTransferEffect', () => {
  const named = { workspaceName: WORKSPACE_ID_NAME, successorName: 'Thomas' }

  it('names what DOES change — who administers this workspace, and the R-22 promote/demote', () => {
    const sentence = describeOwnershipTransferEffect(named).toLowerCase()
    expect(sentence).toContain('administers this workspace')
    expect(sentence).toContain('becomes its owner')
    expect(sentence).toContain('becomes an admin')
    for (const term of ['members', 'invitations', 'roster proposals', 'configuration']) {
      expect(sentence).toContain(term)
    }
  })

  // The negative half is the half a reader skips, so assert it explicitly:
  // workspace ownership is not ownership of any Member's record, catalogue
  // or rights, and it manufactures none of the rights artefacts.
  it('states the negative half — what a transfer does NOT change', () => {
    const sentence = describeOwnershipTransferEffect(named).toLowerCase()
    expect(sentence).toContain('does not change ownership of')
    for (const term of [
      'catalogue',
      'rights',
      'split-sheet party',
      'credit',
      'royalty entitlement',
      'version-ownership record',
      'signature authority',
      'consent-rooted grants',
    ]) {
      expect(sentence).toContain(term)
    }
  })

  it('names the workspace and the successor supplied', () => {
    const sentence = describeOwnershipTransferEffect(named)
    expect(sentence).toContain(WORKSPACE_ID_NAME)
    expect(sentence).toContain('Thomas')
    expect(sentence).toContain(OWNERSHIP_TRANSFER_EFFECT)
  })

  it('degrades to neutral wording rather than breaking on a blank name', () => {
    const sentence = describeOwnershipTransferEffect({ workspaceName: '  ', successorName: '' })
    expect(sentence).toContain('this workspace')
    expect(sentence).toContain('the nominated successor')
  })

  it('never throws', () => {
    expect(() => describeOwnershipTransferEffect({ workspaceName: '', successorName: '' })).not.toThrow()
  })
})

// ─── Module purity (must_have truth 3) ──────────────────────────────────
// Asserted against the module source rather than its behaviour, because
// "imports no Supabase client" is a property of the file, not of any call.
// A future edit that reaches for a database client or the process
// environment inside this decision layer fails here.
describe('ownership-transfer module purity', () => {
  const source = readFileSync(join(__dirname, 'ownership-transfer.ts'), 'utf8')

  it('imports no Supabase client and reads no process environment', () => {
    expect(source).not.toMatch(/@supabase\//)
    expect(source).not.toMatch(/process\s*\.\s*env/)
  })

  it('uses only @/ absolute imports, never a relative one', () => {
    const importPaths = Array.from(source.matchAll(/from\s+'([^']+)'/g)).map((match) => match[1])
    expect(importPaths.length).toBeGreaterThan(0)
    for (const path of importPaths) {
      expect(path.startsWith('@/')).toBe(true)
    }
  })

  it('exports no name beginning create, update, delete or save', () => {
    expect(source).not.toMatch(/export\s+(async\s+)?function\s+(create|update|delete|save)/i)
    expect(source).not.toMatch(/export\s+default/)
  })
})
