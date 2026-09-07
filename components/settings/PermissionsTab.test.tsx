import { readFileSync } from 'fs'
import path from 'path'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  ActiveRowActions,
  PendingRowActions,
  PermissionsTab,
  consentEndpoint,
  formatRelationshipDate,
  lowercaseFirst,
  resolveRowStatus,
  revokeConfirmCopy,
  rowKey,
  submitRowDecision,
  workspaceHeading,
  type PermissionsGroup,
} from '@/components/settings/PermissionsTab'
import {
  AUTHORITY_TIER_TAG,
  PERMISSION_PLAIN_COPY,
  SENSITIVE_PERMISSION_TAG,
} from '@/lib/workspaces/permission-copy'
import { PERMISSION_LABELS } from '@/lib/workspaces/permissions'

// ─── Fixtures ─────────────────────────────────────────────────────────────
// Three permissions chosen to cover all three row shapes in one card: an
// ordinary operational one, a D-40 bundle-excluded one, and an
// authority-tier one. None of their plain-language sentences contains an
// apostrophe, so they survive renderToStaticMarkup's entity escaping and can
// be asserted verbatim.
const ORDINARY = 'view_metadata' as const
const SENSITIVE = 'access_clean_masters' as const
const AUTHORITY = 'act_on_behalf' as const

function group(overrides: Partial<PermissionsGroup> = {}): PermissionsGroup {
  return {
    workspaceId: 'workspace-1',
    workspaceName: 'Blue Note Label',
    workspaceType: 'label',
    relationshipId: 'relationship-1',
    relationshipAcceptedAt: '2026-03-04T00:00:00.000Z',
    permissions: [
      { permission: ORDINARY, tier: 'operational', sensitive: false },
      { permission: SENSITIVE, tier: 'operational', sensitive: true },
      { permission: AUTHORITY, tier: 'authority', sensitive: false },
    ],
    ...overrides,
  }
}

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

const noop = () => undefined

// ─── The surface ──────────────────────────────────────────────────────────
describe('PermissionsTab rendering', () => {
  it('renders one card per requesting workspace, each with its own permission rows', () => {
    const markup = renderToStaticMarkup(
      <PermissionsTab
        pending={[
          group(),
          group({
            workspaceId: 'workspace-2',
            workspaceName: 'Crate Digger Publishing',
            relationshipId: 'relationship-2',
            permissions: [{ permission: ORDINARY, tier: 'operational', sensitive: false }],
          }),
        ]}
        active={[]}
      />
    )

    expect(markup).toContain('Blue Note Label wants access')
    expect(markup).toContain('Crate Digger Publishing wants access')
    expect(markup).toContain('Pending requests')
    expect(occurrences(markup, '>Approve<')).toBe(4)
  })

  it('shows every permission in plain language and never a slug or an ops-facing label', () => {
    const markup = renderToStaticMarkup(<PermissionsTab pending={[group()]} active={[]} />)

    expect(markup).toContain(PERMISSION_PLAIN_COPY[ORDINARY])
    expect(markup).toContain(PERMISSION_PLAIN_COPY[SENSITIVE])
    expect(markup).toContain(PERMISSION_PLAIN_COPY[AUTHORITY])

    // T-38.0.1-13-02: a Member who misreads what they are approving has
    // still approved it. Neither the database slug nor the admin-matrix
    // label may reach this screen.
    expect(markup).not.toContain(ORDINARY)
    expect(markup).not.toContain(SENSITIVE)
    expect(markup).not.toContain(AUTHORITY)
    expect(markup).not.toContain(PERMISSION_LABELS[SENSITIVE])
    expect(markup).not.toContain(PERMISSION_LABELS[AUTHORITY])
  })

  it('tags an authority row and a sensitive row distinctly, and never both on one row', () => {
    const authorityOnly = renderToStaticMarkup(
      <PermissionsTab
        pending={[
          group({ permissions: [{ permission: AUTHORITY, tier: 'authority', sensitive: false }] }),
        ]}
        active={[]}
      />
    )
    expect(authorityOnly).toContain(AUTHORITY_TIER_TAG)
    expect(authorityOnly).not.toContain(SENSITIVE_PERMISSION_TAG)
    expect(authorityOnly).toContain('text-brandindigo')
    expect(authorityOnly).not.toContain('text-money2')

    const sensitiveOnly = renderToStaticMarkup(
      <PermissionsTab
        pending={[
          group({ permissions: [{ permission: SENSITIVE, tier: 'operational', sensitive: true }] }),
        ]}
        active={[]}
      />
    )
    expect(sensitiveOnly).toContain(SENSITIVE_PERMISSION_TAG)
    expect(sensitiveOnly).not.toContain(AUTHORITY_TIER_TAG)
    expect(sensitiveOnly).toContain('text-money2')
    expect(sensitiveOnly).not.toContain('text-brandindigo')

    const ordinaryOnly = renderToStaticMarkup(
      <PermissionsTab
        pending={[
          group({ permissions: [{ permission: ORDINARY, tier: 'operational', sensitive: false }] }),
        ]}
        active={[]}
      />
    )
    expect(ordinaryOnly).not.toContain(AUTHORITY_TIER_TAG)
    expect(ordinaryOnly).not.toContain(SENSITIVE_PERMISSION_TAG)
  })

  // T-38.0.1-13-01. This is the structural guarantee, not a style check: a
  // later edit that adds a single control acting on more than one row fails
  // here.
  it('gives every permission its own decision and offers no bulk control', () => {
    const markup = renderToStaticMarkup(<PermissionsTab pending={[group()]} active={[]} />)

    expect(occurrences(markup, '>Approve<')).toBe(3)
    expect(occurrences(markup, '>Decline<')).toBe(3)
    // The accent is the affirmative act, once per row and nowhere else.
    expect(occurrences(markup, 'bg-grad')).toBe(3)

    expect(markup).not.toMatch(/approve all/i)
    expect(markup).not.toMatch(/decline all/i)
    expect(markup).not.toMatch(/select all/i)
    expect(markup).not.toMatch(/grant all/i)
    expect(markup).not.toMatch(/approve everything/i)
    expect(markup).not.toContain('type="checkbox"')
  })

  it('renders active permissions with a remove control and no approve machinery', () => {
    const markup = renderToStaticMarkup(<PermissionsTab pending={[]} active={[group()]} />)

    expect(markup).toContain('Active permissions')
    expect(markup).not.toContain('Pending requests')
    expect(occurrences(markup, '>Remove access<')).toBe(3)
    expect(markup).not.toContain('>Approve<')
    expect(markup).not.toContain('>Decline<')
    // Nothing on this surface is styled destructive until a revoke is
    // actually in progress.
    expect(markup).not.toContain('bg-rose-500/90')
  })

  it('omits the Active section entirely rather than showing it empty', () => {
    const markup = renderToStaticMarkup(<PermissionsTab pending={[group()]} active={[]} />)

    expect(markup).toContain('Pending requests')
    expect(markup).not.toContain('Active permissions')
  })

  it('renders the empty state when nothing is pending and nothing is active', () => {
    const markup = renderToStaticMarkup(<PermissionsTab pending={[]} active={[]} />)

    expect(markup).toContain('No workspace has asked for access yet.')
    expect(markup).toContain('When a team or label wants to work on your catalogue')
    expect(markup).not.toContain('Pending requests')
    expect(markup).not.toContain('Active permissions')
  })

  it('renders the structural-exclusion footnote once, at the bottom, never per card', () => {
    const markup = renderToStaticMarkup(
      <PermissionsTab
        pending={[group(), group({ relationshipId: 'relationship-2', workspaceId: 'workspace-2' })]}
        active={[group({ relationshipId: 'relationship-3', workspaceId: 'workspace-3' })]}
      />
    )

    expect(
      occurrences(markup, 'Payout and tax details are never part of any workspace request')
    ).toBe(1)
  })

  it('imports no icon or component library', () => {
    const source = readFileSync(
      path.join(process.cwd(), 'components/settings/PermissionsTab.tsx'),
      'utf8'
    )

    expect(source).toMatch(/^'use client'/)
    expect(source).not.toMatch(/from '(lucide|@radix-ui|@heroicons)/)
    // Every mutation goes to the Member-gated consent route, never to a
    // workspace-scoped endpoint (T-38.0.1-13-06).
    expect(source).toContain("'/api/roster/relationships")
    expect(source).not.toContain("'/api/workspaces")
  })
})

// ─── Row action cells ─────────────────────────────────────────────────────
describe('PendingRowActions', () => {
  it('offers both decisions while the row is idle', () => {
    const markup = renderToStaticMarkup(
      <PendingRowActions status={{ kind: 'idle' }} onApprove={noop} onDecline={noop} />
    )

    expect(markup).toContain('>Approve<')
    expect(markup).toContain('>Decline<')
    expect(markup).toContain('bg-grad')
  })

  it('replaces both buttons with the resolved label after a decision', () => {
    const approved = renderToStaticMarkup(
      <PendingRowActions status={{ kind: 'approved' }} onApprove={noop} onDecline={noop} />
    )
    expect(approved).toContain('>Approved<')
    expect(approved).toContain('text-emerald-300')
    expect(approved).not.toContain('>Approve<')
    expect(approved).not.toContain('>Decline<')

    const declined = renderToStaticMarkup(
      <PendingRowActions status={{ kind: 'declined' }} onApprove={noop} onDecline={noop} />
    )
    expect(declined).toContain('>Declined<')
    expect(declined).not.toContain('>Approve<')
    expect(declined).not.toContain('>Decline<')
    // Declining an ask removes nothing, so it is never styled destructive.
    expect(declined).not.toContain('rose')
  })

  // T-38.0.1-13-05. A Member must never be told an approval happened when
  // the server refused it.
  it('leaves the row unresolved and shows an inline error when the request fails', () => {
    const markup = renderToStaticMarkup(
      <PendingRowActions
        status={{ kind: 'error', message: 'This roster relationship does not name you.' }}
        onApprove={noop}
        onDecline={noop}
      />
    )

    expect(markup).toContain('This roster relationship does not name you.')
    expect(markup).toContain('>Approve<')
    expect(markup).toContain('>Decline<')
    expect(markup).not.toContain('>Approved<')
    expect(markup).not.toContain('>Declined<')
  })
})

describe('ActiveRowActions', () => {
  it('requires a two-step inline confirm before a revoke can be sent', () => {
    const idle = renderToStaticMarkup(
      <ActiveRowActions
        status={{ kind: 'idle' }}
        confirmCopy="Remove Blue Note Label access to see your song details? They will lose it immediately."
        onAskToRemove={noop}
        onConfirmRemove={noop}
        onCancelRemove={noop}
      />
    )
    expect(idle).toContain('>Remove access<')
    expect(idle).not.toContain('>Yes, remove<')
    expect(idle).not.toContain('bg-rose-500/90')

    const confirming = renderToStaticMarkup(
      <ActiveRowActions
        status={{ kind: 'confirming-revoke' }}
        confirmCopy="Remove Blue Note Label access to see your song details? They will lose it immediately."
        onAskToRemove={noop}
        onConfirmRemove={noop}
        onCancelRemove={noop}
      />
    )
    expect(confirming).toContain('Remove Blue Note Label access to see your song details?')
    expect(confirming).toContain('>Yes, remove<')
    expect(confirming).toContain('>Cancel<')
    expect(confirming).toContain('bg-rose-500/90')
    expect(confirming).not.toContain('>Remove access<')
  })

  it('keeps the row in place with an inline error when the revoke fails', () => {
    const markup = renderToStaticMarkup(
      <ActiveRowActions
        status={{ kind: 'error', message: 'Could not revoke.' }}
        confirmCopy="ignored"
        onAskToRemove={noop}
        onConfirmRemove={noop}
        onCancelRemove={noop}
      />
    )

    expect(markup).toContain('Could not revoke.')
    expect(markup).toContain('>Remove access<')
  })
})

// ─── Pure helpers ─────────────────────────────────────────────────────────
describe('rowKey', () => {
  it('scopes a row to its own relationship and permission', () => {
    expect(rowKey('relationship-1', ORDINARY)).toBe(`relationship-1:${ORDINARY}`)
    expect(rowKey('relationship-1', ORDINARY)).not.toBe(rowKey('relationship-2', ORDINARY))
    expect(rowKey('relationship-1', ORDINARY)).not.toBe(rowKey('relationship-1', SENSITIVE))
  })
})

describe('consentEndpoint', () => {
  it('addresses the Member-gated per-relationship consent route', () => {
    expect(consentEndpoint('relationship-1')).toBe(
      '/api/roster/relationships/relationship-1/consent'
    )
  })
})

describe('workspaceHeading / revokeConfirmCopy', () => {
  it('names the workspace, and stays readable when the name is unavailable', () => {
    expect(workspaceHeading('Blue Note Label')).toBe('Blue Note Label wants access')
    expect(workspaceHeading(null)).toBe('A workspace wants access')
  })

  it('states exactly what is being taken away, in the permission plain language', () => {
    expect(revokeConfirmCopy('Blue Note Label', PERMISSION_PLAIN_COPY[SENSITIVE])).toBe(
      "Remove Blue Note Label's access to download the final master files of your songs? They'll lose it immediately."
    )
    expect(revokeConfirmCopy(null, PERMISSION_PLAIN_COPY[SENSITIVE])).toContain(
      "Remove this workspace's access to"
    )
  })

  it('lowercases only the first character, leaving the rest of the sentence alone', () => {
    expect(lowercaseFirst('See your song details')).toBe('see your song details')
    expect(lowercaseFirst('')).toBe('')
  })
})

describe('formatRelationshipDate', () => {
  it('formats in UTC so the server and client renders agree', () => {
    expect(formatRelationshipDate('2026-03-04T00:00:00.000Z')).toBe('March 4, 2026')
  })

  it('returns null for a missing or unparseable date rather than rendering Invalid Date', () => {
    expect(formatRelationshipDate(null)).toBeNull()
    expect(formatRelationshipDate('not-a-date')).toBeNull()
  })
})

describe('resolveRowStatus', () => {
  it('resolves a successful decision to its own outcome, never another one', () => {
    expect(resolveRowStatus('approve', { ok: true })).toEqual({ kind: 'approved' })
    expect(resolveRowStatus('decline', { ok: true })).toEqual({ kind: 'declined' })
    expect(resolveRowStatus('revoke', { ok: true })).toEqual({ kind: 'revoked' })
  })

  it('resolves any failure to an error, never to a resolved decision', () => {
    for (const action of ['approve', 'decline', 'revoke'] as const) {
      expect(resolveRowStatus(action, { ok: false, error: 'Refused.' })).toEqual({
        kind: 'error',
        message: 'Refused.',
      })
    }
  })
})

describe('submitRowDecision', () => {
  function fetchSpy(response: { ok: boolean; body?: unknown }) {
    return jest.fn(async () => ({
      ok: response.ok,
      json: async () => response.body ?? {},
    })) as unknown as typeof fetch
  }

  it('approves one permission, on its own relationship, one per request', async () => {
    const fetchImpl = fetchSpy({ ok: true, body: { data: { permissions: [ORDINARY] } } })

    const result = await submitRowDecision(
      { relationshipId: 'relationship-1', permission: ORDINARY, action: 'approve' },
      fetchImpl
    )

    expect(result).toEqual({ ok: true })
    const [url, init] = (fetchImpl as unknown as jest.Mock).mock.calls[0]
    expect(url).toBe('/api/roster/relationships/relationship-1/consent')
    expect(init.method).toBe('POST')
    const body = JSON.parse(init.body)
    expect(body.permissions).toEqual([ORDINARY])
    expect(body.decision).toBe('approved')
  })

  it('declines through the same route, and declining is not revoking', async () => {
    const fetchImpl = fetchSpy({ ok: true })

    await submitRowDecision(
      { relationshipId: 'relationship-1', permission: SENSITIVE, action: 'decline' },
      fetchImpl
    )

    const [, init] = (fetchImpl as unknown as jest.Mock).mock.calls[0]
    expect(init.method).toBe('POST')
    const body = JSON.parse(init.body)
    expect(body.decision).toBe('declined')
    expect(body.permissions).toEqual([SENSITIVE])
  })

  it('revokes with DELETE, and sends no projectId — the route refuses one', async () => {
    const fetchImpl = fetchSpy({ ok: true })

    await submitRowDecision(
      { relationshipId: 'relationship-1', permission: SENSITIVE, action: 'revoke' },
      fetchImpl
    )

    const [, init] = (fetchImpl as unknown as jest.Mock).mock.calls[0]
    expect(init.method).toBe('DELETE')
    const body = JSON.parse(init.body)
    expect(body.permissions).toEqual([SENSITIVE])
    expect(body.decision).toBeUndefined()
    expect('projectId' in body).toBe(false)
  })

  it('never batches, whatever the array shape would allow', async () => {
    for (const action of ['approve', 'decline', 'revoke'] as const) {
      const fetchImpl = fetchSpy({ ok: true })
      await submitRowDecision(
        { relationshipId: 'relationship-1', permission: AUTHORITY, action },
        fetchImpl
      )
      const [, init] = (fetchImpl as unknown as jest.Mock).mock.calls[0]
      expect(JSON.parse(init.body).permissions).toHaveLength(1)
    }
  })

  it('surfaces the server refusal verbatim instead of reporting success', async () => {
    const fetchImpl = fetchSpy({
      ok: false,
      body: { error: 'This roster relationship does not name you.' },
    })

    const result = await submitRowDecision(
      { relationshipId: 'relationship-1', permission: ORDINARY, action: 'approve' },
      fetchImpl
    )

    expect(result).toEqual({ ok: false, error: 'This roster relationship does not name you.' })
  })

  it('turns a thrown fetch into a returned error rather than an unhandled rejection', async () => {
    const fetchImpl = jest.fn(async () => {
      throw new Error('offline')
    }) as unknown as typeof fetch

    const result = await submitRowDecision(
      { relationshipId: 'relationship-1', permission: ORDINARY, action: 'approve' },
      fetchImpl
    )

    expect(result.ok).toBe(false)
  })
})
