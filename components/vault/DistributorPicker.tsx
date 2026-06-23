'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Common independent distributors. "Other" covers anything not listed.
const DISTRIBUTORS = [
  'DistroKid',
  'TuneCore',
  'CD Baby',
  'UnitedMasters',
  'Amuse',
  'Symphonic',
  'AWAL',
  'Ditto Music',
  'Stem',
  'Other',
]

export function DistributorPicker({
  projectId,
  initial,
}: {
  projectId: string
  initial: string | null
}) {
  const router = useRouter()
  const [value, setValue] = useState(initial ?? '')
  const [saving, setSaving] = useState(false)

  async function save(next: string) {
    setValue(next)
    setSaving(true)
    try {
      await fetch(`/api/vault/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ distributor: next || null }),
      })
      router.refresh() // re-pull the recomputed readiness score
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mb-6 flex items-center justify-between gap-3 rounded-[14px] border border-hair bg-card px-[18px] py-4">
      <div>
        <div className="text-[15px] font-bold text-white">Distributor</div>
        <div className="mt-[3px] text-[13px] text-lavdim">
          Where this release gets uploaded to DSPs — required to reach 100%.
        </div>
      </div>
      <select
        value={value}
        onChange={e => save(e.target.value)}
        disabled={saving}
        className="flex-none rounded-[9px] border border-hairstrong bg-card2 px-3 py-2 text-[14px] font-semibold text-white focus:outline-none disabled:opacity-60"
      >
        <option value="">Not chosen yet</option>
        {DISTRIBUTORS.map(d => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
    </div>
  )
}
