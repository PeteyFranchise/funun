'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'

// ─── Writer's Room — the whole-song tab shell ─────────────────────────
//
// Part of 261004-wr2 (canvas-vs-tabs). Takes/Diary/Notes are whole-song
// surfaces that used to be interleaved into the lyric canvas as
// `WriterRoomModule`s with no block anchor — see
// `.planning/deliberations/writers-room-canvas-vs-tabs.md` for the sort
// this component exists to carry out. As of Slice 2, `WorkPage.tsx` wires
// this component to real `VersionsList`/`DiaryFeed`/`StudioNotes` content
// and three existing deep links (the Toast "View ↓", the composer's Note
// verb, the notification bell's `highlightedStudioNoteId`) — see that
// file's `writerRoomTabItems` and the comment above its `openDiaryTab`/
// `openStudioNotes` functions. `LyricsPad.tsx` stays untouched; its now-dead
// `roomModules` machinery is Slice 4's cleanup, not this file's concern.
//
// Splits, Chat, Song builder and Todos are deliberately absent — none of
// the three items this shell carries is a placeholder (label-integrity-
// funun is the defect shape that would create).
//
// ── MOBILE PRESENTATION: PROVISIONAL, NOT RATIFIED ────────────────────
// The mobile model below — one continuous lyric canvas, with Takes/Diary/
// Notes behind a SINGLE door rather than a permanently-visible tab strip —
// was decided provisionally on 2026-10-04, with the owner's explicit
// delegation to ship it and learn from real usage rather than wait for a
// ruling. It is NOT ratified. The sort itself (which three items belong in
// this whole-song group) is the stable part; only the choice of a door over
// a tab strip on a narrow viewport is open.
//
// Revisit trigger: first real user feedback on the Writer's Room. If a
// phone user finds the door awkward, flip the mobile chrome back to an
// always-inline, stacks-full-width tab row — a single-file change confined
// to this component (swap the `lg:hidden` door trigger + overlay wrapper for
// a `lg:`-unconditional tab row, same shared panel container underneath),
// with zero effect on `WorkPage.tsx`'s wiring, which only ever deals in
// `items`/`activeKey` and has no opinion on how this component presents
// them.
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
  /**
   * Outside-triggered selection — mirrors LyricsPad's `expandedRoomModuleKey`
   * precedent for a deep link landing on a specific item. A REQUEST, not a
   * permanent override: the first time a given value appears it moves the
   * tab, and any click after that wins, even while this prop keeps holding
   * the same value. See the sync logic below for how that distinction is
   * made.
   */
  activeKey,
}: {
  items: WriterRoomTabItem[]
  activeKey?: string | null
}) {
  const [clickedKey, setClickedKey] = useState<string | undefined>(() => activeKey ?? items[0]?.key)
  // Opens with the door already open when the FIRST render already carries
  // a deep link (e.g. a notification id in the URL on page load) — a mobile
  // reader should see the target immediately, not have to find and tap the
  // trigger themselves. Harmless on desktop: `lg:flex` below always
  // overrides this regardless of its value.
  const [doorOpen, setDoorOpen] = useState<boolean>(() => activeKey != null)

  // `syncedActiveKey` records the last `activeKey` value already applied to
  // `clickedKey`/`doorOpen`. Comparing it against the current `activeKey`
  // on every render is what distinguishes "activeKey changed to a NEW
  // value" (a fresh deep link — move the tab, open the door) from
  // "activeKey is merely still set to what it was" (a caller like
  // WorkPage.tsx that has no natural "release" signal for every deep link
  // and leaves the prop pinned — do NOT fight whatever the user clicked or
  // closed since). Without this distinction, re-applying `activeKey` on
  // every render is exactly the permanent-override bug this fixes: once
  // set, the user could never click away, and on mobile could never close
  // the door either.
  //
  // The adjustment happens DURING render, not inside a `useEffect` — React's
  // documented pattern for "adjusting state when a prop changes"
  // (https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes).
  // React detects the state update mid-render and re-renders with the new
  // state before committing anything to the DOM, so the corrected tab is
  // what paints on the first frame — there is no separate effect-driven
  // render after the old tab was already visible, so there is nothing to
  // flicker between.
  const [syncedActiveKey, setSyncedActiveKey] = useState<string | null | undefined>(activeKey)
  if (activeKey !== syncedActiveKey) {
    setSyncedActiveKey(activeKey)
    if (activeKey != null) {
      setClickedKey(activeKey)
      // A deep link's whole point is that its target becomes VISIBLE, not
      // just internally selected. On mobile, the shared panel container is
      // behind a closed door until `doorOpen` is true — open it too, or a
      // Takes/Diary/Notes deep link (the composer's "Note" verb, the
      // notification bell, the Toast "View ↓") would silently pick the
      // right tab behind a door nobody opened.
      setDoorOpen(true)
    }
  }

  const active = clickedKey

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
        {/* bg-white, not bg-grad — ProjectTabs' own precedent
            (components/vault/ProjectTabs.tsx:46) for a tab-row active
            indicator. This screen already spends its one bg-grad on
            ComposerCard's "add" button (ComposerCard.tsx:120); a second
            spend here would double the per-screen gradient budget now that
            WorkPage.tsx (Slice 2) actually renders this component. */}
        {on && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-white" />}
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
