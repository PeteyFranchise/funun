'use client'

import { useEffect, useState } from 'react'
import type { SocialPost, Platform } from '@/lib/launchpad/campaigns'
import { PLATFORM_LABELS } from '@/lib/launchpad/campaigns'

// ─── SaveToCalendarPicker ─────────────────────────────────────────────────────
// D-11: centered modal (NOT the slide-in aside) that lets a standalone tool
// output be saved into a chosen calendar slot. Never touches tool_outputs
// history — only produces a slot write via onSave.
//
// Three stacked <select> fields: Platform → Week → Slot (filtered by
// platform+week). Writes only on explicit "Save to slot" click.

const WEEK_OPTIONS: (1 | 2 | 3 | 4)[] = [1, 2, 3, 4]

export function SaveToCalendarPicker({
  open,
  toolOutput,
  posts,
  onClose,
  onSave,
}: {
  open: boolean
  toolOutput: string
  posts: SocialPost[]
  onClose: () => void
  onSave: (slotId: string, caption: string) => void
}) {
  // Derive distinct platforms from posts
  const availablePlatforms: Platform[] = [...new Set(posts.map(p => p.platform))]

  const [platform, setPlatform] = useState<Platform | ''>(availablePlatforms[0] ?? '')
  const [week, setWeek] = useState<1 | 2 | 3 | 4 | ''>(1)
  const [slotId, setSlotId] = useState<string>('')

  // Slots matching the chosen platform + week
  const filteredSlots =
    platform && week
      ? posts.filter(p => p.platform === platform && p.week === week)
      : []

  // Reset slot when platform/week change
  useEffect(() => {
    setSlotId(filteredSlots[0]?.id ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform, week])

  // Reset all state when modal opens
  useEffect(() => {
    if (open) {
      const firstPlatform = availablePlatforms[0] ?? ''
      setPlatform(firstPlatform)
      setWeek(1)
      setSlotId('')
    }
  // Only run on open transition — we intentionally skip availablePlatforms
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Escape closes the modal
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const canSave = Boolean(platform && week && slotId && filteredSlots.length > 0)

  function handleSave() {
    if (!canSave || !slotId) return
    onSave(slotId, toolOutput)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop — click closes */}
      <button
        aria-label="Close picker"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />

      {/* Card */}
      <div className="relative w-full max-w-sm rounded-[18px] border border-hair bg-card p-5 shadow-2xl">
        <h2 className="text-[15px] font-bold text-white">Save to calendar</h2>

        {/* Platform select */}
        <div className="mt-4">
          <label
            htmlFor="stcp-platform"
            className="mb-1.5 block text-[12px] font-bold uppercase tracking-[.14em] text-lavdim"
          >
            Platform
          </label>
          <select
            id="stcp-platform"
            value={platform}
            onChange={e => setPlatform(e.target.value as Platform)}
            className="w-full rounded-lg border border-white/15 bg-white/[0.03] px-3 py-2 text-sm text-white focus:border-white/30 focus:outline-none"
          >
            {availablePlatforms.map(p => (
              <option key={p} value={p}>
                {PLATFORM_LABELS[p]}
              </option>
            ))}
          </select>
        </div>

        {/* Week select */}
        <div className="mt-4">
          <label
            htmlFor="stcp-week"
            className="mb-1.5 block text-[12px] font-bold uppercase tracking-[.14em] text-lavdim"
          >
            Week
          </label>
          <select
            id="stcp-week"
            value={week}
            onChange={e => setWeek(Number(e.target.value) as 1 | 2 | 3 | 4)}
            className="w-full rounded-lg border border-white/15 bg-white/[0.03] px-3 py-2 text-sm text-white focus:border-white/30 focus:outline-none"
          >
            {WEEK_OPTIONS.map(w => (
              <option key={w} value={w}>
                Week {w}
              </option>
            ))}
          </select>
        </div>

        {/* Slot select */}
        <div className="mt-4">
          <label
            htmlFor="stcp-slot"
            className="mb-1.5 block text-[12px] font-bold uppercase tracking-[.14em] text-lavdim"
          >
            Slot
          </label>
          <select
            id="stcp-slot"
            value={slotId}
            onChange={e => setSlotId(e.target.value)}
            className="w-full rounded-lg border border-white/15 bg-white/[0.03] px-3 py-2 text-sm text-white focus:border-white/30 focus:outline-none"
            disabled={filteredSlots.length === 0}
          >
            {filteredSlots.length === 0 ? (
              <option value="" disabled>
                No open slot for this platform/week yet
              </option>
            ) : (
              filteredSlots.map(s => (
                <option key={s.id} value={s.id}>
                  {s.caption ? s.caption.slice(0, 50) + (s.caption.length > 50 ? '…' : '') : `Slot (${s.content_type})`}
                </option>
              ))
            )}
          </select>
        </div>

        {/* Footer */}
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-white/15 px-4 py-2.5 text-sm text-white/70 transition hover:border-white/30 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="flex-1 rounded-lg bg-grad px-4 py-2.5 text-sm font-bold text-white shadow-cta transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Save to slot
          </button>
        </div>
      </div>
    </div>
  )
}
