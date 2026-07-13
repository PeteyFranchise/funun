'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'
import { DockedWidget } from '@/components/messages/DockedWidget'

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
          <DockedWidget threadId={dockedThreadId} viewerId={userId} onClose={() => setDockedThreadId(null)} />
        </div>
      )}
    </MessagesDockContext.Provider>
  )
}
