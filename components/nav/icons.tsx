// ─── Nav icons (Lucide-style inline SVG) ─────────────────────────────
// 24×24 viewBox, 1.7 stroke, round caps. `gradient` swaps the stroke to
// the shared <linearGradient id="ng"> rendered once in ArtistNav.
import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { gradient?: boolean }

function Svg({ gradient, children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke={gradient ? 'url(#ng)' : 'currentColor'}
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {children}
    </svg>
  )
}

// Sound Vault — stacked library / catalogue
export const VaultIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 9h18" />
    <path d="M9 4v16" />
    <circle cx="15" cy="14.5" r="1.6" />
  </Svg>
)

// Ideas — a small spark captured before it becomes a song.
export const IdeasIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3v3" />
    <path d="m5.6 5.6 2.1 2.1" />
    <path d="M3 12h3" />
    <path d="m18.4 5.6-2.1 2.1" />
    <path d="M21 12h-3" />
    <path d="M8.5 14.5a5 5 0 1 1 7 0c-1 1-1.3 1.8-1.4 3h-4.2c-.1-1.2-.4-2-1.4-3Z" />
    <path d="M10 21h4" />
  </Svg>
)

// Contract Locker — document with a lock
export const LockerIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
    <rect x="9" y="12.5" width="6" height="5" rx="1" />
    <path d="M10.5 12.5v-1a1.5 1.5 0 0 1 3 0v1" />
  </Svg>
)

// Antenna — radar / broadcast
export const AntennaIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 18a8 8 0 0 1 14 0" />
    <path d="M8.5 18a4 4 0 0 1 7 0" />
    <circle cx="12" cy="18" r="1.4" />
    <path d="M12 16V5" />
    <path d="m9.5 6 2.5-2 2.5 2" />
  </Svg>
)

// Green Room — network lounge / discovery room
export const GreenRoomIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 18.5V9.5a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v9" />
    <path d="M7 18.5v-4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v4" />
    <path d="M8.5 8.5h7" />
    <path d="M9.5 12.5 7 10l2.5-2.5" />
    <path d="m14.5 12.5 2.5-2.5-2.5-2.5" />
  </Svg>
)

// PitchPlug — send / paper plane
export const PitchPlugIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M21 4 11 14" />
    <path d="M21 4 14.5 21l-3.5-7-7-3.5z" />
  </Svg>
)

// Messages — chat bubble (universal, like Antenna: no capability gate)
export const MessagesNavIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  </Svg>
)

// Rights Coach — shield with check
export const CoachIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3 5 6v5c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z" />
    <path d="m9 11.5 2 2 4-4" />
  </Svg>
)

// Earnings — wallet
export const EarningsIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="6" width="18" height="13" rx="2.5" />
    <path d="M3 10h18" />
    <circle cx="16.5" cy="14.5" r="1.2" />
  </Svg>
)

// Benchmarks — bars with an upward trend
export const BenchmarkIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 21h18" />
    <rect x="5" y="12" width="3.5" height="6" rx="1" />
    <rect x="10.5" y="8" width="3.5" height="10" rx="1" />
    <rect x="16" y="4" width="3.5" height="14" rx="1" />
  </Svg>
)

// Launchpad — rocket (launch a release campaign)
export const LaunchpadIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.79-.78.78-2.06-.04-2.88a2.04 2.04 0 0 0-2.96-.12z" />
    <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
    <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
    <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
  </Svg>
)

// Settings — gear
export const SettingsIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </Svg>
)

// Collaborators — two people / group (global roster)
export const CollaboratorsIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3z" />
    <path d="M8 11c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3z" />
    <path d="M8 13c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
    <path d="M16 13c-.29 0-.62.02-.97.05C16.19 13.89 17 15.1 17 17v2h7v-2c0-2.66-5.33-4-8-4z" />
  </Svg>
)

// Network — connected nodes / relationship graph (following, followers,
// connections, pending, blocked — distinct from the Collaborators roster
// icon above, which is a project-scoped people list, not a member's graph)
export const NetworkIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="6" cy="6" r="2.4" />
    <circle cx="18" cy="6" r="2.4" />
    <circle cx="12" cy="18" r="2.4" />
    <path d="m7.9 7.4 3 8.8" />
    <path d="m16.1 7.4-3 8.8" />
    <path d="M8.4 6h7.2" />
  </Svg>
)

// Deals — handshake (the artist's inbound-license-request room, D-15b)
export const DealsIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8.5 12.5 3 8l3-3 5.2 4.3" />
    <path d="M15.5 12.5 21 8l-3-3-5.2 4.3" />
    <path d="m8.5 12.5 2 1.8a1.8 1.8 0 0 0 2.5 0l.4-.4a1.6 1.6 0 0 1 2.2 0l1.4 1.4" />
    <path d="M6.2 9.6 3.5 12a2 2 0 0 0 0 2.9l3.8 3.6a2 2 0 0 0 2.8 0l.4-.4" />
    <path d="m17.8 9.6 2.7 2.4a2 2 0 0 1 0 2.9l-3.8 3.6a2 2 0 0 1-2.8 0l-.4-.4" />
  </Svg>
)

// Sync Library — two catalogue shelves holding a note (distinct from
// Sound Vault's rack-with-disc motif and Contract Locker's document-lock)
export const SyncLibraryIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="4.3" width="18" height="5.4" rx="1.3" />
    <rect x="3" y="14.3" width="18" height="5.4" rx="1.3" />
    <path d="M8.5 7h7" />
    <path d="M8.5 17h4.3" />
    <path d="M16.8 15.4v4.7" />
    <circle cx="15.9" cy="20.1" r="1.1" />
  </Svg>
)
