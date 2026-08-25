'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { GRANTABLE_ROLES, type GrantableRole, type RoomGrantMatrix } from '@/lib/playbook/access-grants'

// ─── AccessEditorMatrix (31.2-07 Task 1, D-31.2-01) ────────────────────────
// The leadership room×role access-editor grid. Rooms as rows, the
// GRANTABLE_ROLES (every StaffRole EXCEPT 'leadership') as columns — a
// leadership row/column is NEVER rendered here; GRANTABLE_ROLES already
// excludes it structurally (Pitfall 5, mirrors migration 130's CHECK
// constraint + access-grants.ts's isGrantableRole guard). Clicking a cell
// PATCHes /api/admin/playbook/rooms with { roomId, role, granted } and
// applies the route's returned matrix, then router.refresh()es so the rest
// of the RSC tree (Rail2's visible-rooms filter) picks up the change live.
//
// Data-only props (no function props) — this is the RSC page → client
// boundary (AssignAePanel.tsx's own comment on this same rule).

export type AccessEditorMatrixProps = {
  initialMatrix: RoomGrantMatrix
}

const ROLE_LABELS: Record<GrantableRole, string> = {
  ae: 'AE',
  bd: 'BDT',
  anr: 'A&R',
  it: 'IT',
  legal: 'Legal',
  tms: 'TMS',
  accounting: 'Accounting',
  marketing: 'Marketing',
}

export function AccessEditorMatrix({ initialMatrix }: AccessEditorMatrixProps) {
  const router = useRouter()
  const [matrix, setMatrix] = useState<RoomGrantMatrix>(initialMatrix)
  const [pendingCell, setPendingCell] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleToggle(roomId: string, role: GrantableRole, nextGranted: boolean) {
    const cellKey = `${roomId}:${role}`
    setPendingCell(cellKey)
    setError(null)
    try {
      const res = await fetch('/api/admin/playbook/rooms', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, role, granted: nextGranted }),
      })
      const json = (await res.json().catch(() => ({}))) as { data?: RoomGrantMatrix; error?: string }
      if (!res.ok || !json.data) throw new Error(json.error ?? 'Something went wrong — please try again.')
      setMatrix(json.data)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong — please try again.')
    } finally {
      setPendingCell(null)
    }
  }

  return (
    <div className="rounded-[18px] border border-[color:var(--border)] bg-[color:var(--panel)]">
      {error && (
        <p className="border-b border-[color:var(--border)] px-5 py-3 text-[13px] text-[color:var(--rose-fg)]">
          {error}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <th className="sticky left-0 z-[1] whitespace-nowrap bg-[color:var(--panel)] px-4 py-3 text-left text-[11.5px] font-bold uppercase tracking-[.04em] text-[color:var(--ink-3)]">
                Room
              </th>
              {GRANTABLE_ROLES.map(role => (
                <th
                  key={role}
                  className="whitespace-nowrap px-3 py-3 text-center text-[11.5px] font-bold uppercase tracking-[.04em] text-[color:var(--ink-3)]"
                >
                  {ROLE_LABELS[role]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map(entry => (
              <tr key={entry.room.id} className="border-t border-[color:var(--border)]">
                <td className="sticky left-0 z-[1] whitespace-nowrap bg-[color:var(--panel)] px-4 py-3">
                  <div className="text-[13.5px] font-semibold text-[color:var(--ink)]">{entry.room.label}</div>
                  {entry.room.sensitive && (
                    <span className="mt-0.5 inline-block rounded-full border border-[rgba(129,140,248,.30)] px-[7px] py-[1px] text-[9.5px] font-bold uppercase tracking-[.05em] text-[color:var(--indigo)]">
                      Sensitive
                    </span>
                  )}
                </td>
                {GRANTABLE_ROLES.map(role => {
                  const cellKey = `${entry.room.id}:${role}`
                  const granted = entry.grants[role]
                  const pending = pendingCell === cellKey
                  return (
                    <td key={role} className="px-3 py-3 text-center">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={granted}
                        aria-label={`${entry.room.label} × ${ROLE_LABELS[role]}`}
                        disabled={pending}
                        onClick={() => handleToggle(entry.room.id, role, !granted)}
                        className="relative mx-auto h-[20px] w-[36px] flex-none rounded-full border transition disabled:opacity-50"
                        style={{
                          background: granted ? 'var(--indigo, #818CF8)' : 'var(--panel-2)',
                          borderColor: granted ? 'transparent' : 'var(--border-2, rgba(199,203,247,.22))',
                        }}
                      >
                        <span
                          className="absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white transition-all"
                          style={{ left: granted ? '18px' : '2px' }}
                        />
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
