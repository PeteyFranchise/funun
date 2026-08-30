'use client'

import { useState } from 'react'
import { serializeLyrics, type LyricBlockRecord } from '@/lib/catalogue/blocks'

// ─── "Copy full lyric" — the two-flavour export (S-04) ─────────────────
// LOCKED DECISION (CONTEXT S-04): the wording is tool-agnostic. The tagged
// flavour is described as ready to paste into any tool or document that
// expects section headings; the plain flavour as just the words. No
// product, vendor or model name appears anywhere in this component, its
// comments, or its strings — the tagged shape happens to be what several
// AI tools ingest natively, but that is a property of the FORMAT, not a
// marketing line.
//
// The exported text comes from `serializeLyrics()` (lib/catalogue/blocks.ts,
// plan 02) — this component assembles nothing itself. That function
// expands every linked repeat to its full text in both flavours, so what
// an artist copies always reads as the finished song rather than exposing
// an internal storage link (REPEAT RULE).
//
// Copies client-side, no server round trip. Reserves NO gradient here —
// this pad's single `bg-grad` budget (see LyricBlockCard.tsx's header
// comment) is not spent on this control; it stays a plain bordered
// button, matching sketch 006-A's own `.btn`/`.chip` treatment (the
// sketch never applies its `.pri` gradient class anywhere on this
// screen).

export type CopyLyricMenuProps = {
  blocks: LyricBlockRecord[]
}

type Flavor = 'tagged' | 'plain'

const FLAVOR_LABEL: Record<Flavor, string> = {
  tagged: 'Tagged (with section headings)',
  plain: 'Plain (words only)',
}

// Tool-agnostic on purpose (S-04) — never name what reads this export.
const FLAVOR_DESCRIPTION: Record<Flavor, string> = {
  tagged: 'Ready to paste into any tool or document that expects section headings.',
  plain: 'Just the words — ready to paste into any tool or document.',
}

const FLAVOR_ORDER: Flavor[] = ['tagged', 'plain']

export function CopyLyricMenu({ blocks }: CopyLyricMenuProps) {
  const [open, setOpen] = useState(false)
  const [copiedFlavor, setCopiedFlavor] = useState<Flavor | null>(null)
  // Set only when the clipboard API is unavailable or refused — the
  // export is the artist's own evidence, so a silent failure here would
  // read as "the feature simply doesn't work" rather than as the export
  // having actually succeeded. A selectable fallback keeps it honest.
  const [fallbackText, setFallbackText] = useState<string | null>(null)
  const [fallbackFlavor, setFallbackFlavor] = useState<Flavor | null>(null)

  const copy = async (flavor: Flavor) => {
    const text = serializeLyrics(blocks, flavor)
    setCopiedFlavor(null)
    setFallbackText(null)

    const clipboard =
      typeof navigator !== 'undefined' && 'clipboard' in navigator
        ? (navigator as Navigator & { clipboard?: { writeText?: (t: string) => Promise<void> } }).clipboard
        : undefined

    if (!clipboard?.writeText) {
      setFallbackFlavor(flavor)
      setFallbackText(text)
      setOpen(false)
      return
    }

    try {
      await clipboard.writeText(text)
      setCopiedFlavor(flavor)
      setOpen(false)
    } catch {
      setFallbackFlavor(flavor)
      setFallbackText(text)
      setOpen(false)
    }
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="rounded-[9px] border border-hairstrong bg-lav/[.06] px-[13px] py-[7px] text-[12px] font-semibold text-lav hover:text-white"
      >
        Copy lyrics ▾
      </button>

      {/*
        Rendered always, visibility toggled via a class rather than a
        conditional return — both flavours stay in the markup whether the
        menu is open or not, which is also what keeps this control's
        static-markup test meaningful without a DOM to drive the open
        interaction.
      */}
      <div
        role="menu"
        className={`absolute right-0 z-10 mt-1 w-72 rounded-[10px] border border-hair bg-card p-2 shadow-2xl ${
          open ? '' : 'hidden'
        }`}
      >
        {FLAVOR_ORDER.map(flavor => (
          <button
            key={flavor}
            type="button"
            role="menuitem"
            onClick={() => copy(flavor)}
            className="block w-full rounded-[8px] px-2 py-2 text-left hover:bg-card2"
          >
            <span className="block text-[12px] font-semibold text-lav">{FLAVOR_LABEL[flavor]}</span>
            <span className="block text-[11px] text-lavdim">{FLAVOR_DESCRIPTION[flavor]}</span>
          </button>
        ))}
      </div>

      {copiedFlavor && (
        <p className="mt-[6px] text-[11px] text-emerald-400">
          Copied — {FLAVOR_DESCRIPTION[copiedFlavor]}
        </p>
      )}

      {fallbackText != null && fallbackFlavor != null && (
        <div className="mt-[6px]">
          <p className="mb-[4px] text-[11px] text-lavdim">
            Couldn&apos;t copy automatically — select the text below and copy it yourself.
          </p>
          <textarea
            readOnly
            value={fallbackText}
            onFocus={event => event.currentTarget.select()}
            rows={6}
            className="w-full rounded-[8px] border border-hair bg-card2 p-2 text-[12px] text-white/95"
          />
        </div>
      )}
    </div>
  )
}
