'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'

// ─── Writer's Room — the whole-song tab shell ─────────────────────────
//
// Part of 261004-wr2 (canvas-vs-tabs). Takes/Diary/Notes are whole-song
// surfaces that used to be interleaved into the lyric canvas as
// `WriterRoomModule`s with no block anchor — see
// `.planning/deliberations/writers-room-canvas-vs-tabs.md` for the sort
// this component exists to carry out. This file is additive and, as of
// Slice 1, referenced by nothing: `WorkPage.tsx` and `LyricsPad.tsx` are
// untouched. Wiring it in is Slice 2's job, not this one's.
//
// Splits, Chat, Song builder and Todos are deliberately absent — none of
// the three items this shell carries is a placeholder (label-integrity-
// funun is the defect shape that would create).
//
// ── MOBILE PRESENTATION: PROVISIONAL ──────────────────────────────────
// The mobile model below — one continuous lyric canvas, with Takes/Diary/
// Notes behind a SINGLE door rather than a permanently-visible tab strip —
// was decided provisionally on 2026-10-04, with the owner's explicit
// delegation. It is not ratified. The sort itself (which three items belong
// in this whole-song group) is the stable part; only the choice of a door
// over a tab strip on a narrow viewport is open.
//
// Revisit trigger: first real user feedback on the Writer's Room. If a
// phone user finds the door awkward, flip the mobile chrome back to an
// always-inline, stacks-full-width tab row — a single-file change confined
// to this component, with zero effect on whatever already wired Takes/
// Diary/Notes into it.
//
// No sheet/drawer/dialog library exists in this project (only
// `@dnd-kit/*` is installed) and no `matchMedia`/`useMediaQuery` hook
// exists anywhere — every responsive split in this codebase, including
// this one, is a Tailwind breakpoint class, never JS viewport detection.
// The overlay chrome below re-implements `FlowOverlay`'s two classes
// (`components/catalogue/WorkPage.tsx:271-277`) locally rather than
// importing them — that function is private to its file.

export type WriterRoomTabItem = {
  key: string
  label: string
  description: string
  content: ReactNode
}

export function WriterRoomTabs({
  items,
  /** Outside-triggered selection — mirrors LyricsPad's `expandedRoomModuleKey` precedent for a deep link landing on a specific item. Takes priority over whatever was last clicked. */
  activeKey,
}: {
  items: WriterRoomTabItem[]
  activeKey?: string | null
}) {
  const [clickedKey, setClickedKey] = useState<string | undefined>(items[0]?.key)
  const [doorOpen, setDoorOpen] = useState(false)
  const active = activeKey ?? clickedKey

  function selectTab(key: string) {
    setClickedKey(key)
  }

  const tabButtons = items.map(item => {
    const on = active === item.key
    return (
      <button
        key={item.key}
        type="button"
        role="tab"
        aria-selected={on}
        onClick={() => selectTab(item.key)}
        className={`relative -mb-px flex flex-col items-start gap-0.5 px-4 py-2.5 text-left text-sm font-medium transition ${
          on ? 'text-white' : 'text-lavdim hover:text-lav'
        }`}
      >
        <span>{item.label}</span>
        <span className="text-[11px] text-lavdim">{item.description}</span>
        {on && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-grad" />}
      </button>
    )
  })

  return (
    <div>
      {/* Desktop chrome: the tab row renders inline, always visible at lg
          and above. */}
      <div role="tablist" className="hidden items-center gap-1 border-b border-hair lg:flex">
        {tabButtons}
      </div>

      {/* Mobile chrome: a single trigger door, replacing the tab strip
          below lg. Tapping it reveals the SAME panel container below,
          wrapped in the overlay treatment — see the shared panel wrapper's
          classes. */}
      <button
        type="button"
        onClick={() => setDoorOpen(true)}
        className="flex w-full items-center justify-between rounded-[12px] border border-hair bg-card px-4 py-3 text-left text-sm font-medium text-white lg:hidden"
      >
        <span>Takes, Diary &amp; Notes</span>
        <span className="text-lavdim">→</span>
      </button>

      {/*
        The one, shared panel container. It mounts every item's content
        exactly once — never duplicated between a desktop layout and a
        mobile one (ProjectTabs' own precedent, `components/vault/
        ProjectTabs.tsx:62`). Only its OWN wrapper chrome differs by
        breakpoint and `doorOpen`:
          - below lg, closed: hidden entirely (`hidden`)
          - below lg, open: the FlowOverlay-style full-screen treatment
            re-implemented locally (`fixed inset-0 z-40 ... bg-ink/80`)
          - lg and above: always a normal, inline block, regardless of
            `doorOpen` — desktop never sees the overlay chrome.
      */}
      <div
        className={`${
          doorOpen ? 'fixed inset-0 z-40 flex items-center justify-center bg-ink/80 px-6 py-10' : 'hidden'
        } lg:static lg:z-auto lg:flex lg:items-stretch lg:justify-start lg:bg-transparent lg:px-0 lg:py-0`}
      >
        <div className="max-h-full w-full max-w-lg overflow-y-auto rounded-card border border-hair bg-card p-5 lg:max-h-none lg:w-full lg:max-w-none lg:overflow-visible lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:pt-6">
          {/* Inside-the-door tab row: only meaningful on mobile, where the
              desktop tablist above is hidden. Reuses the same buttons. */}
          <div role="tablist" className="mb-4 flex items-center gap-1 lg:hidden">
            {tabButtons}
          </div>

          <button
            type="button"
            onClick={() => setDoorOpen(false)}
            className="mb-4 text-sm text-lavdim hover:text-white lg:hidden"
          >
            ✕ Close
          </button>

          {items.map(item => (
            <div key={item.key} className={active === item.key ? '' : 'hidden'}>
              {item.content}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
