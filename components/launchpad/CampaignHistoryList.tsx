'use client'

import { useState } from 'react'
import type { SocialCampaign } from '@/lib/launchpad/campaigns'

// ─── CampaignHistoryList ──────────────────────────────────────────────────────
// D-04 switch-active + D-05 inline-confirm hard-delete. Reuses
// ChecklistAdmin.tsx's inline delete-confirm pattern verbatim (role="alert",
// rose-500/30 border, rose-500/5 bg, confirm + cancel buttons).
//
// Active campaign: shows "Active" emerald badge, NO delete trigger (D-05).
// Inactive campaigns: "Set active" button (PATCH) + "Delete" text trigger that
// opens the inline confirm block — never window.confirm.

export function CampaignHistoryList({
  projectId,
  campaigns,
  onActiveChanged,
  onDeleted,
}: {
  projectId: string
  campaigns: SocialCampaign[]
  onActiveChanged: (campaignId: string) => void
  onDeleted: (campaignId: string) => void
}) {
  // Per-row state: which row is in confirm-pending and which is saving
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSetActive(campaignId: string) {
    setSavingId(campaignId)
    setError(null)
    try {
      const res = await fetch(`/api/launchpad/${projectId}/campaigns`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId }),
      })
      if (!res.ok) {
        setError("Couldn't update the active campaign — please try again.")
        return
      }
      onActiveChanged(campaignId)
    } catch {
      setError("Couldn't update the active campaign — please try again.")
    } finally {
      setSavingId(null)
    }
  }

  async function handleDeleteConfirm(campaignId: string) {
    setSavingId(campaignId)
    setError(null)
    try {
      const res = await fetch(`/api/launchpad/${projectId}/campaigns`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId }),
      })
      if (!res.ok) {
        setError("Couldn't delete the campaign — please try again.")
        return
      }
      setConfirmingId(null)
      onDeleted(campaignId)
    } catch {
      setError("Couldn't delete the campaign — please try again.")
    } finally {
      setSavingId(null)
    }
  }

  if (campaigns.length === 0) return null

  return (
    <div className="rounded-[14px] border border-hair bg-card divide-y divide-hair">
      {campaigns.map(campaign => {
        const isConfirming = confirmingId === campaign.id
        const isSaving = savingId === campaign.id
        const slotCount = campaign.posts.length

        return (
          <div key={campaign.id}>
            {/* Row */}
            <div className="flex items-center justify-between gap-3 px-[18px] py-4">
              {/* Left: name + date */}
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-bold text-white truncate">{campaign.name}</p>
                <p className="mt-0.5 text-[12.5px] text-lavdim">
                  {new Date(campaign.created_at).toLocaleDateString()}
                </p>
              </div>

              {/* Right: status / actions */}
              <div className="flex shrink-0 items-center gap-3">
                {campaign.is_active ? (
                  /* Active badge — no delete trigger (D-05) */
                  <span className="inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                    Active
                  </span>
                ) : (
                  /* Inactive: set-active + delete trigger */
                  <>
                    <button
                      type="button"
                      onClick={() => handleSetActive(campaign.id)}
                      disabled={isSaving}
                      className="rounded-md border border-white/15 px-3 py-1.5 text-xs text-white/70 transition hover:border-white/30 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSaving && !isConfirming ? 'Saving…' : 'Set active'}
                    </button>
                    {!isConfirming && (
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmingId(campaign.id)
                          setError(null)
                        }}
                        className="text-xs text-rose-300 transition hover:text-rose-200"
                      >
                        Delete
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Inline delete confirm block (ChecklistAdmin pattern) */}
            {isConfirming && (
              <div
                role="alert"
                className="mx-[18px] mb-4 rounded-[10px] border border-rose-500/30 bg-rose-500/5 p-4"
              >
                <p className="text-[14px] text-white mb-3">
                  Delete this campaign? All {slotCount} slots and their completion progress will be
                  permanently removed. This cannot be undone.
                </p>
                {error && (
                  <p className="mb-3 text-[13px] text-rose-400">{error}</p>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleDeleteConfirm(campaign.id)}
                    disabled={isSaving}
                    className="rounded-lg bg-rose-500 px-4 py-2 text-[13px] font-bold text-white transition hover:bg-rose-600 disabled:opacity-50"
                  >
                    {isSaving ? 'Deleting…' : 'Delete campaign'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmingId(null)
                      setError(null)
                    }}
                    className="rounded-lg border border-white/10 px-4 py-2 text-[13px] text-white/60 transition hover:text-white"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
