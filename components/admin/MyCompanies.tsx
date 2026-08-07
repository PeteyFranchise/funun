'use client'

import { useState } from 'react'

// ─── MyCompanies ────────────────────────────────────────────────────────
// AE/BD work queue (TEAM-06): lists the Client Partners (buyer_orgs)
// assigned to the caller (server-scoped by ae_user_id — see page.tsx),
// leadership sees all. Each row has an inline name editor that PATCHes
// /api/admin/buyer-orgs/[id] (the only staff-editable field in v1 — A3),
// surfacing the scope-denial 404 and validation 400 responses inline.

export type MyCompanyRow = {
  id: string
  name: string
  is_personal: boolean
  verified: boolean
  created_at: string
  ae_user_id: string | null
  memberCount: number
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

export function MyCompanies({ initialOrgs }: { initialOrgs: MyCompanyRow[] }) {
  const [orgs, setOrgs] = useState<MyCompanyRow[]>(initialOrgs)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  const startEdit = (org: MyCompanyRow) => {
    setEditingId(org.id)
    setEditName(org.name)
    setEditError(null)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditName('')
    setEditError(null)
  }

  const handleSave = async (orgId: string) => {
    if (!editName.trim()) {
      setEditError('Name is required.')
      return
    }

    setSaving(true)
    setEditError(null)
    try {
      const res = await fetch(`/api/admin/buyer-orgs/${orgId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim() }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        data?: { id: string; name: string }
        error?: string
      }
      if (res.status === 404) {
        throw new Error("You're not assigned to this Client Partner.")
      }
      if (!res.ok) {
        throw new Error(json.error ?? 'Something went wrong — please try again.')
      }
      if (json.data) {
        setOrgs(prev =>
          prev.map(org => (org.id === orgId ? { ...org, name: json.data!.name } : org))
        )
      }
      setEditingId(null)
      setEditName('')
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Something went wrong — please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-6">
      {orgs.length === 0 ? (
        <p className="mt-4 text-[14px] text-white/50">
          No Client Partners are assigned to you yet.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {orgs.map(org => (
            <div key={org.id} className="rounded-xl border border-white/10 p-4">
              {editingId === org.id ? (
                <div>
                  {editError && <p className="mb-2 text-[13px] text-rose-400">{editError}</p>}
                  <input
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[14px] text-white placeholder:text-white/30 focus:border-brandindigo/60 focus:outline-none"
                  />
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => handleSave(org.id)}
                      disabled={saving}
                      className="rounded-lg bg-white px-3 py-1.5 text-[12px] font-bold text-black transition hover:bg-white/90 disabled:opacity-50"
                    >
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="rounded-lg border border-white/10 px-3 py-1.5 text-[12px] text-white/60 transition hover:text-white"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="truncate text-[14px] font-bold text-white">{org.name}</p>
                    <p className="mt-0.5 text-[12px] text-lavdim">
                      {org.memberCount} member{org.memberCount !== 1 ? 's' : ''} · Created{' '}
                      {formatJoined(org.created_at)}
                      {org.is_personal ? ' · Personal' : ''}
                      {org.verified ? ' · Verified' : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => startEdit(org)}
                    className="rounded-lg border border-white/10 px-3 py-1.5 text-[12px] text-white/70 transition hover:text-white"
                  >
                    Edit
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
