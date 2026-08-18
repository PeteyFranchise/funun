'use client'

import { useState } from 'react'
import type { StaffRole } from '@/lib/admin/gate'

// ─── StaffAdmin ─────────────────────────────────────────────────────────
// Leadership-only Team Members management UI. Mirrors BuyerOrgsAdmin's
// inline add-form + list state machine, POSTing to /api/admin/staff
// (D-02: leadership creates staff, no self-serve).

export type StaffRow = {
  id: string
  user_id: string
  staff_role: StaffRole
  display_name: string
  title: string | null
  phone: string | null
  avatar_url: string | null
  created_at: string
  email: string
}

type CreateFormState = {
  email: string
  displayName: string
  staffRole: StaffRole
}

const EMPTY_CREATE_FORM: CreateFormState = { email: '', displayName: '', staffRole: 'ae' }

const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  leadership: 'Leadership',
  ae: 'Account Executive',
  bd: 'BD',
  anr: 'A&R',
  it: 'IT',
}

// 'anr' (A&R, Phase 30) and 'it' (IT, Phase 33) are deliberately excluded
// from the create-staff dropdown until their respective owner-applied
// migrations (108, 114) land — funun_staff's staff_role CHECK rejects
// each until then, so offering them here would let leadership submit a
// create that 500s on the DB write. Re-add once each migration is live
// (30-03-SUMMARY.md / 33-01-SUMMARY.md).
const STAFF_ROLE_VALUES: StaffRole[] = ['leadership', 'ae', 'bd']

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

export function StaffAdmin({ initialStaff }: { initialStaff: StaffRow[] }) {
  const [staff, setStaff] = useState<StaffRow[]>(initialStaff)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createForm, setCreateForm] = useState<CreateFormState>(EMPTY_CREATE_FORM)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [emailWarning, setEmailWarning] = useState<string | null>(null)

  const handleCreateStaff = async () => {
    if (!createForm.email.trim()) {
      setCreateError('Email is required.')
      return
    }
    if (!createForm.displayName.trim()) {
      setCreateError('Display name is required.')
      return
    }

    setCreating(true)
    setCreateError(null)
    setEmailWarning(null)
    try {
      const res = await fetch('/api/admin/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: createForm.email.trim(),
          display_name: createForm.displayName.trim(),
          staff_role: createForm.staffRole,
        }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        data?: StaffRow
        error?: string
        emailSent?: boolean
      }
      if (!res.ok) {
        throw new Error(json.error ?? 'Something went wrong — please try again.')
      }
      if (json.data) {
        setStaff(prev => [json.data as StaffRow, ...prev])
      }
      const invitedEmail = createForm.email.trim()
      setCreateForm(EMPTY_CREATE_FORM)
      setShowCreateForm(false)
      if (json.emailSent === false) {
        setEmailWarning(
          `Team member created, but the invite email to ${invitedEmail} could not be delivered.`
        )
      }
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Something went wrong — please try again.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="mt-6">
      {emailWarning && (
        <div className="mb-4 rounded-lg border border-[color:var(--amber-line)] bg-[color:var(--amber-bg)] px-4 py-3 text-[13px] text-[color:var(--amber-fg)]">
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
          className="fncon-cta mb-4 rounded-lg px-4 py-2.5 text-[13px] font-bold shadow transition hover:opacity-90"
        >
          Add team member
        </button>
      )}

      {showCreateForm && (
        <div className="mt-1 mb-2 rounded-[10px] border border-[color:var(--indigo)]/30 bg-[color:var(--panel)] p-4">
          <h3 className="mb-3 text-[13px] font-bold text-[color:var(--ink-2)]">Add a team member</h3>
          {createError && <p className="mb-3 text-[13px] text-[color:var(--rose-fg)]">{createError}</p>}
          <div className="grid gap-3">
            <div>
              <label className="mb-1 block text-[13px] font-bold text-[color:var(--ink-2)]">Email *</label>
              <input
                value={createForm.email}
                onChange={e => setCreateForm(prev => ({ ...prev, email: e.target.value }))}
                className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-2 text-[14px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)] focus:border-[color:var(--indigo)] focus:outline-none"
                placeholder="name@funun.studio"
              />
            </div>
            <div>
              <label className="mb-1 block text-[13px] font-bold text-[color:var(--ink-2)]">
                Display name *
              </label>
              <input
                value={createForm.displayName}
                onChange={e => setCreateForm(prev => ({ ...prev, displayName: e.target.value }))}
                className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-2 text-[14px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)] focus:border-[color:var(--indigo)] focus:outline-none"
                placeholder="e.g. Jordan Ellis"
              />
            </div>
            <div>
              <label className="mb-1 block text-[13px] font-bold text-[color:var(--ink-2)]">Role *</label>
              <div className="flex gap-2">
                {STAFF_ROLE_VALUES.map(role => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => setCreateForm(prev => ({ ...prev, staffRole: role }))}
                    className={[
                      'rounded-full border px-3 py-1 text-[12px] font-semibold transition',
                      createForm.staffRole === role
                        ? 'border-[color:var(--indigo)]/50 bg-[color:var(--indigo)]/20 text-[color:var(--ink)]'
                        : 'border-[color:var(--border)] bg-[color:var(--panel-2)] text-[color:var(--ink-3)] hover:border-[color:var(--border-2)] hover:text-[color:var(--ink-2)]',
                    ].join(' ')}
                  >
                    {STAFF_ROLE_LABELS[role]}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              onClick={handleCreateStaff}
              disabled={creating}
              className="rounded-lg bg-[color:var(--ink)] px-4 py-2 text-[13px] font-bold text-[color:var(--ground)] transition hover:opacity-90 disabled:opacity-50"
            >
              {creating ? 'Creating…' : 'Create + invite'}
            </button>
            <button
              onClick={() => {
                setShowCreateForm(false)
                setCreateForm(EMPTY_CREATE_FORM)
                setCreateError(null)
              }}
              className="rounded-lg border border-[color:var(--border)] px-4 py-2 text-[13px] text-[color:var(--ink-2)] transition hover:text-[color:var(--ink)]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {staff.length === 0 ? (
        <p className="mt-4 text-[14px] text-[color:var(--ink-3)]">
          No team members yet. Add the first one above.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {staff.map(member => (
            <div
              key={member.id}
              className="flex items-center justify-between rounded-xl border border-[color:var(--border)] p-4"
            >
              <div>
                <p className="truncate text-[14px] font-bold text-[color:var(--ink)]">
                  {member.display_name || member.email}
                </p>
                <p className="mt-0.5 text-[12px] text-[color:var(--ink-3)]">
                  {member.email} · Joined {formatJoined(member.created_at)}
                </p>
              </div>
              <span className="text-[11px] text-[color:var(--ink-2)]">
                {STAFF_ROLE_LABELS[member.staff_role]}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
