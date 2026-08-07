'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BUYER_ROLE_LABELS } from '@/lib/buyers/schema'
import type { BuyerRole, BuyerOrgStatus } from '@/lib/buyers/schema'

// ─── ClientPartnerDetail (23-06) ────────────────────────────────────────────
// The AE onboarding-completion surface — every lead_routed/ae_assigned
// notification links here (RESEARCH Pitfall 4). Shows the qualifying/lead
// fields captured at register (migration 095, staff-only columns) alongside
// the member list, and offers "Mark onboarding complete", which PATCHes the
// extended STAFF_EDITABLE_BUYER_ORG_FIELDS allowlist (23-06 Task 1). Styled
// in the Team Console light/dark token idiom (console-theme.ts), matching
// MyCompanies.tsx/BuyerOrgsAdmin.tsx's newer sections rather than the
// legacy dark-only classes on components/admin/DealDetailPanel.tsx.

export type ClientPartnerOrg = {
  id: string
  name: string
  is_personal: boolean
  verified: boolean
  created_at: string
  status: BuyerOrgStatus
  use_case: string | null
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  contact_role: string | null
  source: string | null
  ae_user_id: string | null
}

export type ClientPartnerMember = {
  id: string
  org_id: string
  user_id: string
  buyer_role: BuyerRole
  is_org_admin: boolean
  created_at: string
  email: string
}

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

function StatusBadge({ status }: { status: BuyerOrgStatus }) {
  const isActive = status === 'active'
  return (
    <span
      className="rounded-full border px-3 py-1 text-xs font-semibold"
      style={
        isActive
          ? {
              color: 'var(--green-fg)',
              background: 'var(--green-bg)',
              borderColor: 'var(--green-line)',
            }
          : {
              color: 'var(--amber-fg)',
              background: 'var(--amber-bg)',
              borderColor: 'var(--amber-line)',
            }
      }
    >
      {isActive ? 'Active' : 'Pending onboarding'}
    </span>
  )
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <span className="block text-xs text-[color:var(--ink-3)]">{label}</span>
      <span className="text-sm text-[color:var(--ink)]">{value ?? '—'}</span>
    </div>
  )
}

export function ClientPartnerDetail({
  org,
  members,
}: {
  org: ClientPartnerOrg
  members: ClientPartnerMember[]
}) {
  const router = useRouter()
  const [status, setStatus] = useState<BuyerOrgStatus>(org.status)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleMarkComplete = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/buyer-orgs/${org.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'active' }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        data?: { status: BuyerOrgStatus }
        error?: string
      }
      if (res.status === 404) {
        throw new Error("You're not assigned to this Client Partner.")
      }
      if (!res.ok) {
        throw new Error(json.error ?? 'Something went wrong — please try again.')
      }
      setStatus(json.data?.status ?? 'active')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong — please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <p
          className="rounded-lg border px-4 py-3 text-sm"
          style={{ color: 'var(--rose-fg)', background: 'var(--rose-bg)', borderColor: 'var(--rose-line)' }}
        >
          {error}
        </p>
      )}

      {/* Overview */}
      <section className="rounded-xl border border-[color:var(--border)] bg-[color:var(--panel-2)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-[color:var(--ink-3)]">
              Client Partner
            </p>
            <h2 className="mt-1 text-lg font-semibold text-[color:var(--ink)]">{org.name}</h2>
            <p className="mt-0.5 text-xs text-[color:var(--ink-3)]">
              Created {formatJoined(org.created_at)}
              {org.is_personal ? ' · Personal' : ''}
              {org.verified ? ' · Verified' : ''}
              {org.source ? ` · Source: ${org.source === 'sales_rep' ? 'Talk to a sales rep' : 'Register'}` : ''}
            </p>
          </div>
          <StatusBadge status={status} />
        </div>

        {status !== 'active' && (
          <div className="mt-4">
            <button
              onClick={handleMarkComplete}
              disabled={busy}
              className="rounded-lg bg-[image:var(--grad)] px-4 py-2 text-[13px] font-bold text-white shadow transition hover:opacity-90 disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Mark onboarding complete'}
            </button>
          </div>
        )}
      </section>

      {/* Qualifying / lead fields captured at register */}
      <section className="rounded-xl border border-[color:var(--border)] bg-[color:var(--panel-2)] p-5">
        <h3 className="text-sm font-bold uppercase tracking-widest text-[color:var(--ink-3)]">
          Qualifying details
        </h3>
        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
          <Field label="Contact name" value={org.contact_name} />
          <Field label="Contact email" value={org.contact_email} />
          <Field label="Contact phone" value={org.contact_phone} />
          <Field label="Role" value={org.contact_role} />
          <Field label="Use case" value={org.use_case} />
        </div>
      </section>

      {/* Members */}
      <section className="rounded-xl border border-[color:var(--border)] bg-[color:var(--panel-2)] p-5">
        <h3 className="text-sm font-bold uppercase tracking-widest text-[color:var(--ink-3)]">
          Members ({members.length})
        </h3>
        {members.length === 0 ? (
          <p className="mt-3 text-[13px] text-[color:var(--ink-3)]">No members yet.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            {members.map(member => (
              <div
                key={member.id}
                className="flex items-center justify-between rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] px-3 py-2"
              >
                <span className="truncate text-[13px] text-[color:var(--ink)]">{member.email}</span>
                <span className="text-[11px] text-[color:var(--ink-3)]">
                  {BUYER_ROLE_LABELS[member.buyer_role]}
                  {member.is_org_admin ? ' · Org admin' : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
