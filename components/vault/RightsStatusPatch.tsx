'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Generic status-patch button for the rights page. Calls PATCH /api/vault/[projectId]/rights
// with a single field update, then refreshes the server component tree.
export function RightsStatusPatch({
  projectId,
  field,
  value,
  label,
  disabled,
}: {
  projectId: string
  field: 'copyright_status' | 'pro_registration_status' | 'soundexchange_registered'
  value: string | boolean
  label: string
  disabled?: boolean
}) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)

  async function handleClick() {
    setSaving(true)
    try {
      await fetch(`/api/vault/${projectId}/rights`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={saving || disabled}
      className="rounded-lg border border-indigo-400/30 bg-indigo-400/10 px-3 py-1.5 text-xs font-semibold text-indigo-200 transition hover:bg-indigo-400/20 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {saving ? 'Saving…' : label}
    </button>
  )
}
