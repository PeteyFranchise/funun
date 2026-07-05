'use client'

import { useState } from 'react'
import { INDUSTRY_ROLE_GROUPS } from '@/lib/industry-roles'
import { PROFILE_ROLE_LABELS } from '@/types'
import type { ProfileRole } from '@/types'

// ─── MembersAdmin ─────────────────────────────────────────────────────────
// Mirrors CuratorAdmin's inline add-form + list state machine (create-only —
// no edit/delete/resend action is in D-02's scope). Reuses the
// INDUSTRY_ROLE_GROUPS chip-toggle pattern from ProfileForm.tsx.

export type IndustryMember = {
  id: string
  artist_name: string | null
  member_type: string
  industry_roles: string[]
  roles: ProfileRole[]
  created_at: string
  email: string
}

type FormState = {
  email: string
  displayName: string
  roleSlugs: string[]
}

const EMPTY_FORM: FormState = { email: '', displayName: '', roleSlugs: [] }

function roleLabel(role: ProfileRole): string {
  return role.kind === 'preset' ? PROFILE_ROLE_LABELS[role.slug] : role.label
}

function formatJoined(dateString: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(
      new Date(dateString)
    )
  } catch {
    return dateString
  }
}

export function MembersAdmin({ initialMembers }: { initialMembers: IndustryMember[] }) {
  const [members, setMembers] = useState<IndustryMember[]>(initialMembers)
  const [showAddForm, setShowAddForm] = useState(false)
  const [addForm, setAddForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  // WR-04: surface email delivery failure — account was created but invite email was not sent.
  const [emailWarning, setEmailWarning] = useState<string | null>(null)

  const toggleRole = (slug: string) => {
    setAddForm(prev => ({
      ...prev,
      roleSlugs: prev.roleSlugs.includes(slug)
        ? prev.roleSlugs.filter(s => s !== slug)
        : [...prev.roleSlugs, slug],
    }))
  }

  const handleAddSave = async () => {
    if (!addForm.email.trim()) {
      setAddError('Email is required.')
      return
    }
    if (!addForm.displayName.trim()) {
      setAddError('Display name is required.')
      return
    }
    if (addForm.roleSlugs.length === 0) {
      setAddError('Select at least one role.')
      return
    }

    setSaving(true)
    setAddError(null)
    setEmailWarning(null)
    try {
      const res = await fetch('/api/admin/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: addForm.email.trim(),
          display_name: addForm.displayName.trim(),
          role_slugs: addForm.roleSlugs,
        }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error((json as { error?: string }).error ?? 'Something went wrong — please try again.')
      }
      const json = (await res.json()) as { data: IndustryMember; emailSent: boolean }
      setMembers(prev => [json.data, ...prev])
      setAddForm(EMPTY_FORM)
      setShowAddForm(false)
      // WR-04: account created successfully but invite email was not delivered.
      // Display a persistent warning so the admin knows to follow up.
      if (!json.emailSent) {
        setEmailWarning(
          `Account created for ${json.data.email} but the invite email could not be delivered. They can still sign in at /signin using their email address.`
        )
      }
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Something went wrong — please try again.')
    } finally {
      setSaving(false)
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
      {!showAddForm && (
        <button
          onClick={() => {
            setShowAddForm(true)
            setAddError(null)
          }}
          className="mb-4 rounded-lg bg-grad px-4 py-2.5 text-[13px] font-bold text-white shadow transition hover:opacity-90"
        >
          Invite industry member
        </button>
      )}

      {showAddForm && (
        <div className="mt-1 mb-2 rounded-[10px] border border-brandindigo/30 bg-[#0a0a0f] p-4">
          <h3 className="mb-3 text-[13px] font-bold text-white/70">Invite an industry member</h3>
          {addError && <p className="mb-3 text-[13px] text-rose-400">{addError}</p>}
          <div className="grid gap-3">
            <div>
              <label className="mb-1 block text-[13px] font-bold text-white/70">Email *</label>
              <input
                value={addForm.email}
                onChange={e => setAddForm(prev => ({ ...prev, email: e.target.value }))}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[14px] text-white placeholder:text-white/30 focus:border-brandindigo/60 focus:outline-none"
                placeholder="name@company.com"
              />
            </div>
            <div>
              <label className="mb-1 block text-[13px] font-bold text-white/70">Display name *</label>
              <input
                value={addForm.displayName}
                onChange={e => setAddForm(prev => ({ ...prev, displayName: e.target.value }))}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[14px] text-white placeholder:text-white/30 focus:border-brandindigo/60 focus:outline-none"
                placeholder="e.g. Jordan Ellis"
              />
            </div>
            <div>
              <label className="mb-1 block text-[13px] font-bold text-white/70">Initial role(s) *</label>
              <p className="mb-2 text-[12px] text-lavdim">
                Pick at least one — this shows as a badge on their profile from day one.
              </p>
              <div className="space-y-5">
                {INDUSTRY_ROLE_GROUPS.map(group => (
                  <div key={group.group}>
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-[.18em] text-lavdim">
                      {group.group}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {group.roles.map(role => {
                        const selected = addForm.roleSlugs.includes(role.slug)
                        return (
                          <button
                            key={role.slug}
                            type="button"
                            onClick={() => toggleRole(role.slug)}
                            className={[
                              'rounded-full border px-3 py-1.5 text-xs font-semibold transition',
                              selected
                                ? 'border-lav/50 bg-lav/20 text-white'
                                : 'border-white/10 bg-white/5 text-white/50 hover:border-white/20 hover:text-white/80',
                            ].join(' ')}
                          >
                            {role.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
              {addForm.roleSlugs.length > 0 && (
                <p className="mt-2 text-xs text-white/30">
                  {addForm.roleSlugs.length} role{addForm.roleSlugs.length !== 1 ? 's' : ''} selected
                </p>
              )}
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              onClick={handleAddSave}
              disabled={saving}
              className="rounded-lg bg-white px-4 py-2 text-[13px] font-bold text-black transition hover:bg-white/90 disabled:opacity-50"
            >
              {saving ? 'Sending invite…' : 'Send invite'}
            </button>
            <button
              onClick={() => {
                setShowAddForm(false)
                setAddForm(EMPTY_FORM)
                setAddError(null)
              }}
              className="rounded-lg border border-white/10 px-4 py-2 text-[13px] text-white/60 transition hover:text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {members.length === 0 ? (
        <p className="mt-4 text-[14px] text-white/50">No industry members yet. Invite the first one above.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {members.map(member => (
            <div key={member.id} className="rounded-xl border border-white/10 p-4">
              <p className="truncate text-[14px] font-bold text-white">{member.artist_name}</p>
              <p className="mt-0.5 text-[12px] text-lavdim">
                {member.email} · Joined {formatJoined(member.created_at)}
              </p>
              {member.roles.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {member.roles.map((role, i) => (
                    <span
                      key={i}
                      className="rounded-full border border-hair bg-card2 px-2 py-0.5 text-[11px] text-lav"
                    >
                      {roleLabel(role)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
