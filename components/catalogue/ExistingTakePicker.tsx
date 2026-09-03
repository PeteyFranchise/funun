'use client'

import { useState } from 'react'
import type { ExistingTakeOption } from '@/lib/catalogue/human-source-takes'

export function ExistingTakePicker({
  takes,
  onSelect,
  onBack,
  initialSelectedId = null,
}: {
  takes: ExistingTakeOption[]
  onSelect: (versionId: string) => void
  onBack: () => void
  /** Static-render test seam; production callers begin with no assumed selection. */
  initialSelectedId?: string | null
}) {
  const [selectedId, setSelectedId] = useState(initialSelectedId)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="existing-take-picker-title"
      className="w-full max-w-[440px] rounded-[12px] border border-hair bg-card px-6 py-6"
    >
      <p id="existing-take-picker-title" className="text-[13px] font-semibold text-white">
        Attach an earlier take
      </p>
      <p className="mt-1 text-[11px] leading-5 text-lavdim">
        Choose the human recording that existed before this AI-assisted take. Funūn records the sequence;
        you confirm what the recording represents.
      </p>

      {takes.length > 0 ? (
        <div className="mt-4 max-h-[330px] space-y-2 overflow-y-auto pr-1">
          {takes.map(take => (
            <label
              key={take.id}
              className="block cursor-pointer rounded-[9px] border border-hair bg-card2 px-3 py-3"
            >
              <span className="flex items-center gap-3">
                <input
                  type="radio"
                  name="existing-take"
                  value={take.id}
                  checked={selectedId === take.id}
                  onChange={() => setSelectedId(take.id)}
                  className="h-4 w-4 accent-violet-500"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] font-semibold text-white">
                    {take.display} · {take.description}
                  </span>
                  <span className="mt-0.5 block text-[10.5px] text-lavdim">Earlier take from this song</span>
                </span>
              </span>
              {take.playbackUrl && (
                <audio
                  controls
                  preload="none"
                  src={take.playbackUrl}
                  className="mt-2 h-8 w-full"
                  aria-label={`Preview ${take.display} — ${take.description}`}
                />
              )}
            </label>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-[9px] border border-hair bg-card2 px-3 py-3 text-[11px] text-lavdim">
          No eligible earlier takes are available. Record a new hum, or continue without attaching one.
        </p>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onBack}
          className="rounded-[9px] border border-hairstrong px-3 py-2 text-[12px] font-semibold text-lav hover:text-white"
        >
          Back
        </button>
        {takes.length > 0 && (
          <button
            type="button"
            disabled={!selectedId}
            onClick={() => selectedId && onSelect(selectedId)}
            className="rounded-[9px] bg-grad px-3 py-2 text-[12px] font-semibold text-white shadow-cta disabled:opacity-40"
          >
            Attach this take
          </button>
        )}
      </div>
    </div>
  )
}
