'use client'

import { useState } from 'react'
import { BUYER_ROLE_LABELS, BUYER_ROLE_VALUES } from '@/lib/buyers/schema'
import type { BuyerRole } from '@/lib/buyers/schema'

// ─── BuyerOrgsAdmin ─────────────────────────────────────────────────────
// Mirrors MembersAdmin's inline add-form + list state machine (D-12: admin
// creates the company record AND its first org admin in one form). Adds an
// expandable per-org member list backed by GET/POST
// /api/admin/buyer-orgs/[id]/members, following the ReportsAdmin/
// VerificationAdmin component conventions established in 13-04/13-05.

export type BuyerOrgRow = {
  id: string
  name: string
  is_personal: boolean
  verified: boolean
  created_at: string
  memberCount: number
  // Primary contact email (the org's first org-admin member's auth email),
  // shown on the card. Optional — callers that don't resolve it omit it.
  adminEmail?: string | null
  // Leadership-only reassign control (25-09) — undefined/null for callers
  // that don't fetch AE assignment data.
  aeUserId?: string | null
  aeName?: string | null
}

// The assignable AE pool for the reassign picker — funun_staff rows where
// staff_role = 'ae' (25-09's must_haves: options come from that pool, plus
// an Unassign option the component renders itself).
export type AePoolOption = {
  userId: string
  displayName: string
}

type BuyerOrgMember = {
  id: string
  org_id: string
  user_id: string
  buyer_role: BuyerRole
  is_org_admin: boolean
  created_at: string
  email: string
}

type CreateFormState = {
  orgName: string
  adminEmail: string
  adminDisplayName: string
}

type AddMemberFormState = {
  email: string
  displayName: string
  buyerRole: BuyerRole
}

const EMPTY_CREATE_FORM: CreateFormState = { orgName: '', adminEmail: '', adminDisplayName: '' }
const EMPTY_ADD_MEMBER_FORM: AddMemberFormState = { email: '', displayName: '', buyerRole: 'requester' }

function formatJoined(dateString: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(dateString))
  } catch {
    return dateString
  }
}

export function BuyerOrgsAdmin({
  initialOrgs,
  isLeadership = false,
  aePool = [],
}: {
  initialOrgs: BuyerOrgRow[]
  isLeadership?: boolean
  aePool?: AePoolOption[]
}) {
  const [orgs, setOrgs] = useState<BuyerOrgRow[]>(initialOrgs)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createForm, setCreateForm] = useState<CreateFormState>(EMPTY_CREATE_FORM)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  // WR-04 (mirrored): surface email delivery failure — account created but invite email not sent.
  const [emailWarning, setEmailWarning] = useState<string | null>(null)

  const [expandedOrgId, setExpandedOrgId] = useState<string | null>(null)
  const [membersByOrg, setMembersByOrg] = useState<Record<string, BuyerOrgMember[]>>({})
  const [loadingMembers, setLoadingMembers] = useState(false)

  const [showAddMemberForm, setShowAddMemberForm] = useState(false)
  const [addMemberForm, setAddMemberForm] = useState<AddMemberFormState>(EMPTY_ADD_MEMBER_FORM)
  const [addingMember, setAddingMember] = useState(false)
  const [addMemberError, setAddMemberError] = useState<string | null>(null)

  // Leadership-only AE reassign control (25-09) — PATCHes the existing
  // leadership-only /ae route (T-25-15: a forged request from a non-leadership
  // caller still 403s server-side; this state only exists to drive the UI).
  const [reassigningId, setReassigningId] = useState<string | null>(null)
  const [reassignError, setReassignError] = useState<string | null>(null)
  const [reassignErrorOrgId, setReassignErrorOrgId] = useState<string | null>(null)

  const handleReassignAe = async (orgId: string, newAeUserId: string | null) => {
    setReassigningId(orgId)
    setReassignError(null)
    setReassignErrorOrgId(null)
    try {
      const res = await fetch(`/api/admin/buyer-orgs/${orgId}/ae`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ae_user_id: newAeUserId }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        data?: { id: string; ae_user_id: string | null }
        error?: string
      }
      if (!res.ok) {
        throw new Error(json.error ?? 'Something went wrong — please try again.')
      }
      const newAeName = newAeUserId
        ? aePool.find(ae => ae.userId === newAeUserId)?.displayName ?? null
        : null
      setOrgs(prev =>
        prev.map(org =>
          org.id === orgId ? { ...org, aeUserId: newAeUserId, aeName: newAeName } : org
        )
      )
    } catch (err) {
      setReassignError(err instanceof Error ? err.message : 'Something went wrong — please try again.')
      setReassignErrorOrgId(orgId)
    } finally {
      setReassigningId(null)
    }
  }

  const handleCreateOrg = async () => {
    if (!createForm.orgName.trim()) {
      setCreateError('Company name is required.')
      return
    }
    if (!createForm.adminEmail.trim()) {
      setCreateError('Admin email is required.')
      return
    }
    if (!createForm.adminDisplayName.trim()) {
      setCreateError('Admin display name is required.')
      return
    }

    setCreating(true)
    setCreateError(null)
    setEmailWarning(null)
    try {
      const res = await fetch('/api/admin/buyer-orgs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_name: createForm.orgName.trim(),
          admin_email: createForm.adminEmail.trim(),
          admin_display_name: createForm.adminDisplayName.trim(),
        }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        data?: { org: BuyerOrgRow }
        error?: string
        emailSent?: boolean
      }
      if (!res.ok) {
        throw new Error(json.error ?? 'Something went wrong — please try again.')
      }
      if (json.data?.org) {
        // The POST response's org row doesn't carry adminEmail — fill it from
        // the email just entered so the new card shows the contact right away.
        setOrgs(prev => [{ ...json.data!.org, adminEmail: createForm.adminEmail.trim() }, ...prev])
      }
      setCreateForm(EMPTY_CREATE_FORM)
      setShowCreateForm(false)
      if (json.emailSent === false) {
        setEmailWarning(
          `Company created, but the invite email to ${createForm.adminEmail.trim()} could not be delivered. They can still sign in at /sync/access using their email address.`
        )
      }
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Something went wrong — please try again.')
    } finally {
      setCreating(false)
    }
  }

  const handleExpandOrg = async (orgId: string) => {
    if (expandedOrgId === orgId) {
      setExpandedOrgId(null)
      setShowAddMemberForm(false)
      return
    }
    setExpandedOrgId(orgId)
    setShowAddMemberForm(false)
    setAddMemberError(null)
    if (membersByOrg[orgId]) return

    setLoadingMembers(true)
    try {
      const res = await fetch(`/api/admin/buyer-orgs/${orgId}/members`)
      const json = (await res.json().catch(() => ({}))) as { data?: BuyerOrgMember[] }
      setMembersByOrg(prev => ({ ...prev, [orgId]: json.data ?? [] }))
    } finally {
      setLoadingMembers(false)
    }
  }

  const handleAddMember = async (orgId: string) => {
    if (!addMemberForm.email.trim()) {
      setAddMemberError('Email is required.')
      return
    }
    if (!addMemberForm.displayName.trim()) {
      setAddMemberError('Display name is required.')
      return
    }

    setAddingMember(true)
    setAddMemberError(null)
    setEmailWarning(null)
    try {
      const res = await fetch(`/api/admin/buyer-orgs/${orgId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: addMemberForm.email.trim(),
          display_name: addMemberForm.displayName.trim(),
          buyer_role: addMemberForm.buyerRole,
        }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        data?: BuyerOrgMember
        error?: string
        emailSent?: boolean
      }
      if (!res.ok) {
        throw new Error(json.error ?? 'Something went wrong — please try again.')
      }
      if (json.data) {
        setMembersByOrg(prev => ({
          ...prev,
          [orgId]: [json.data!, ...(prev[orgId] ?? [])],
        }))
        setOrgs(prev =>
          prev.map(org => (org.id === orgId ? { ...org, memberCount: org.memberCount + 1 } : org))
        )
      }
      setAddMemberForm(EMPTY_ADD_MEMBER_FORM)
      setShowAddMemberForm(false)
      if (json.emailSent === false) {
        setEmailWarning(
          `Member added, but the invite email to ${addMemberForm.email.trim()} could not be delivered.`
        )
      }
    } catch (err) {
      setAddMemberError(err instanceof Error ? err.message : 'Something went wrong — please try again.')
    } finally {
      setAddingMember(false)
    }
  }

  return (
    <div className="mt-6">
      {emailWarning && (
        <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-[13px] text-amber-300">
          {emailWarning}
          <button
            className="ml-3 text-xs underline opacity-60 hover:opacity-100"
            onClick={() => setEmailWarning(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {!showCreateForm && (
        <button
          onClick={() => {
            setShowCreateForm(true)
            setCreateError(null)
          }}
          className="mb-4 rounded-lg bg-grad px-4 py-2.5 text-[13px] font-bold text-white shadow transition hover:opacity-90"
        >
          Create buyer company
        </button>
      )}

      {showCreateForm && (
        <div className="mt-1 mb-2 rounded-[10px] border border-brandindigo/30 bg-[#0a0a0f] p-4">
          <h3 className="mb-3 text-[13px] font-bold text-white/70">Create a buyer company</h3>
          {createError && <p className="mb-3 text-[13px] text-rose-400">{createError}</p>}
          <div className="grid gap-3">
            <div>
              <label className="mb-1 block text-[13px] font-bold text-white/70">Company name *</label>
              <input
                value={createForm.orgName}
                onChange={e => setCreateForm(prev => ({ ...prev, orgName: e.target.value }))}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[14px] text-white placeholder:text-white/30 focus:border-brandindigo/60 focus:outline-none"
                placeholder="e.g. Acme Sync Licensing"
              />
            </div>
            <div>
              <label className="mb-1 block text-[13px] font-bold text-white/70">First org admin email *</label>
              <input
                value={createForm.adminEmail}
                onChange={e => setCreateForm(prev => ({ ...prev, adminEmail: e.target.value }))}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[14px] text-white placeholder:text-white/30 focus:border-brandindigo/60 focus:outline-none"
                placeholder="name@company.com"
              />
            </div>
            <div>
              <label className="mb-1 block text-[13px] font-bold text-white/70">First org admin name *</label>
              <input
                value={createForm.adminDisplayName}
                onChange={e => setCreateForm(prev => ({ ...prev, adminDisplayName: e.target.value }))}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[14px] text-white placeholder:text-white/30 focus:border-brandindigo/60 focus:outline-none"
                placeholder="e.g. Jordan Ellis"
              />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              onClick={handleCreateOrg}
              disabled={creating}
              className="rounded-lg bg-white px-4 py-2 text-[13px] font-bold text-black transition hover:bg-white/90 disabled:opacity-50"
            >
              {creating ? 'Creating…' : 'Create + invite admin'}
            </button>
            <button
              onClick={() => {
                setShowCreateForm(false)
                setCreateForm(EMPTY_CREATE_FORM)
                setCreateError(null)
              }}
              className="rounded-lg border border-white/10 px-4 py-2 text-[13px] text-white/60 transition hover:text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {orgs.length === 0 ? (
        <p className="mt-4 text-[14px] text-white/50">No buyer companies yet. Create the first one above.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {orgs.map(org => (
            <div key={org.id} className="rounded-xl border border-white/10 p-4">
              <button
                onClick={() => handleExpandOrg(org.id)}
                className="flex w-full items-center justify-between text-left"
              >
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-bold text-white">{org.name}</p>
                  {org.adminEmail && (
                    <p className="mt-0.5 truncate text-[12px] text-white/55">{org.adminEmail}</p>
                  )}
                  <p className="mt-0.5 text-[12px] text-lavdim">
                    {org.memberCount} member{org.memberCount !== 1 ? 's' : ''} · Created{' '}
                    {formatJoined(org.created_at)}
                    {org.is_personal ? ' · Personal' : ''}
                  </p>
                </div>
                <span className="text-[11px] text-white/40">
                  {expandedOrgId === org.id ? 'Hide members' : 'View members'}
                </span>
              </button>

              {/* Account Exec — leadership-only reassign control (25-09). New
                  UI added by this plan; styled with the Team Console tokens
                  (25-08) so it reads in both light and dark rather than the
                  legacy dark-only classes the rest of this component uses. */}
              <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-[color:var(--border)] pt-2 text-[12px]">
                <span className="text-[color:var(--ink-3)]">Account Exec:</span>
                {isLeadership ? (
                  <>
                    <select
                      value={org.aeUserId ?? ''}
                      disabled={reassigningId === org.id}
                      onChange={e => handleReassignAe(org.id, e.target.value || null)}
                      className="rounded-md border border-[color:var(--border)] bg-[color:var(--panel-2)] px-2 py-1 text-[12px] text-[color:var(--ink)] focus:border-[color:var(--indigo)] focus:outline-none disabled:opacity-50"
                    >
                      <option value="">Unassigned</option>
                      {aePool.map(ae => (
                        <option key={ae.userId} value={ae.userId}>
                          {ae.displayName}
                        </option>
                      ))}
                    </select>
                    {reassigningId === org.id && (
                      <span className="text-[color:var(--ink-3)]">Saving…</span>
                    )}
                  </>
                ) : (
                  <span className="text-[color:var(--ink-2)]">{org.aeName ?? 'Unassigned'}</span>
                )}
              </div>
              {isLeadership && reassignErrorOrgId === org.id && reassignError && (
                <p className="mt-1 text-[11px] text-[color:var(--rose-fg)]">{reassignError}</p>
              )}

              {expandedOrgId === org.id && (
                <div className="mt-3 border-t border-white/10 pt-3">
                  {loadingMembers && !membersByOrg[org.id] ? (
                    <p className="text-[12px] text-white/40">Loading members…</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {(membersByOrg[org.id] ?? []).length === 0 ? (
                        <p className="text-[12px] text-white/40">No members yet.</p>
                      ) : (
                        (membersByOrg[org.id] ?? []).map(member => (
                          <div
                            key={member.id}
                            className="flex items-center justify-between rounded-lg border border-hair bg-card2 px-3 py-2"
                          >
                            <span className="truncate text-[13px] text-white/80">{member.email}</span>
                            <span className="text-[11px] text-lav">
                              {BUYER_ROLE_LABELS[member.buyer_role]}
                              {member.is_org_admin ? ' · Org admin' : ''}
                            </span>
                          </div>
                        ))
                      )}

                      {!showAddMemberForm ? (
                        <button
                          onClick={() => {
                            setShowAddMemberForm(true)
                            setAddMemberError(null)
                          }}
                          className="mt-2 self-start rounded-lg border border-white/10 px-3 py-1.5 text-[12px] text-white/70 transition hover:text-white"
                        >
                          Add member
                        </button>
                      ) : (
                        <div className="mt-2 rounded-lg border border-brandindigo/30 bg-[#0a0a0f] p-3">
                          {addMemberError && (
                            <p className="mb-2 text-[12px] text-rose-400">{addMemberError}</p>
                          )}
                          <div className="grid gap-2">
                            <input
                              value={addMemberForm.email}
                              onChange={e =>
                                setAddMemberForm(prev => ({ ...prev, email: e.target.value }))
                              }
                              placeholder="name@company.com"
                              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[13px] text-white placeholder:text-white/30 focus:border-brandindigo/60 focus:outline-none"
                            />
                            <input
                              value={addMemberForm.displayName}
                              onChange={e =>
                                setAddMemberForm(prev => ({ ...prev, displayName: e.target.value }))
                              }
                              placeholder="Display name"
                              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[13px] text-white placeholder:text-white/30 focus:border-brandindigo/60 focus:outline-none"
                            />
                            <div className="flex gap-2">
                              {BUYER_ROLE_VALUES.map(role => (
                                <button
                                  key={role}
                                  type="button"
                                  onClick={() =>
                                    setAddMemberForm(prev => ({ ...prev, buyerRole: role }))
                                  }
                                  className={[
                                    'rounded-full border px-3 py-1 text-[12px] font-semibold transition',
                                    addMemberForm.buyerRole === role
                                      ? 'border-lav/50 bg-lav/20 text-white'
                                      : 'border-white/10 bg-white/5 text-white/50 hover:border-white/20 hover:text-white/80',
                                  ].join(' ')}
                                >
                                  {BUYER_ROLE_LABELS[role]}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="mt-3 flex gap-2">
                            <button
                              onClick={() => handleAddMember(org.id)}
                              disabled={addingMember}
                              className="rounded-lg bg-white px-3 py-1.5 text-[12px] font-bold text-black transition hover:bg-white/90 disabled:opacity-50"
                            >
                              {addingMember ? 'Sending invite…' : 'Send invite'}
                            </button>
                            <button
                              onClick={() => {
                                setShowAddMemberForm(false)
                                setAddMemberForm(EMPTY_ADD_MEMBER_FORM)
                                setAddMemberError(null)
                              }}
                              className="rounded-lg border border-white/10 px-3 py-1.5 text-[12px] text-white/60 transition hover:text-white"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
