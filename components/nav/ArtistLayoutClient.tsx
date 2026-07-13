'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'

// ─── ArtistLayoutClient (D-03, D-04, RESEARCH Pattern 2) ─────────────────
// Client wrapper mounted once by the server-component `app/(artist)/layout.tsx`.
// Holds the docked-widget thread id in useState — because this component is
// rendered once by the layout and never unmounts during SPA navigation
// within (artist), the docked state (and, once mounted, its Realtime
// channel) persists across navigation (D-03).
//
// Exposes a MessagesDockContext so the /messages page (Plan 05) can call
// openDock(threadId) from the pop-out affordance inside ConversationView
// without a prop-drilling chain back up to this layout.

type MessagesDockContextValue = {
  dockedThreadId: string | null
  openDock: (threadId: string) => void
  closeDock: () => void
}

const MessagesDockContext = createContext<MessagesDockContextValue | null>(null)

export function useMessagesDock(): MessagesDockContextValue {
  const ctx = useContext(MessagesDockContext)
  if (!ctx) {
    throw new Error('useMessagesDock must be used within ArtistLayoutClient')
  }
  return ctx
}

// Minimal placeholder for the docked widget. Plan 05
// (components/messages/DockedWidget.tsx) supplies the full component —
// Realtime subscribe/reconcile-poll/optimistic-send inherited from
// DmWidget.tsx's proven pattern, plus the presence header. This stub exists
// only so the dock-open context has something to render before Plan 05
// lands; Plan 05 is expected to replace this inline placeholder with a
// real `import { DockedWidget } from '@/components/messages/DockedWidget'`.
function DockedWidgetPlaceholder({
  threadId,
  onClose,
}: {
  threadId: string
  viewerId: string
  onClose: () => void
}) {
  return (
    <div className="fixed bottom-0 right-8 z-50 w-[336px] overflow-hidden rounded-t-[14px] border border-hairstrong bg-card shadow-[0_-20px_60px_-20px_rgba(0,0,0,.7)]">
      <div className="flex items-center justify-between border-b border-hair bg-[#13112a] px-4 py-[14px]">
        <span className="truncate text-[15px] font-bold text-white">Conversation</span>
        <button onClick={onClose} className="text-lavdim hover:text-white" aria-label="Close">
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>
      <div className="px-4 py-4 text-[13px] text-lavdim">Thread {threadId}</div>
    </div>
  )
}

export function ArtistLayoutClient({
  children,
  userId,
}: {
  children: ReactNode
  userId: string
}) {
  const [dockedThreadId, setDockedThreadId] = useState<string | null>(null)

  const value: MessagesDockContextValue = {
    dockedThreadId,
    openDock: (threadId: string) => setDockedThreadId(threadId),
    closeDock: () => setDockedThreadId(null),
  }

  return (
    <MessagesDockContext.Provider value={value}>
      {children}
      {dockedThreadId && (
        <div className="hidden lg:block">
          <DockedWidgetPlaceholder
            threadId={dockedThreadId}
            viewerId={userId}
            onClose={() => setDockedThreadId(null)}
          />
        </div>
      )}
    </MessagesDockContext.Provider>
  )
}
