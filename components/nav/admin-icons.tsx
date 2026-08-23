// ─── Admin nav icons (Lucide-style inline SVG) ───────────────────────────
// Matches components/nav/icons.tsx house style: 24×24 viewBox, 1.7 stroke,
// round caps. `gradient` swaps the stroke to the shared <linearGradient
// id="ng"> that AdminNav renders once. One icon per admin sidebar room so the
// menu can collapse to an icon-only rail (like ArtistNav).
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

// The Playbook — open book
export const PlaybookIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 7v13" />
    <path d="M3 5.5A1.5 1.5 0 0 1 4.5 4H9a3 3 0 0 1 3 3 3 3 0 0 1 3-3h4.5A1.5 1.5 0 0 1 21 5.5v11a1.5 1.5 0 0 1-1.5 1.5H15a3 3 0 0 0-3 3 3 3 0 0 0-3-3H4.5A1.5 1.5 0 0 1 3 16.5z" />
  </Svg>
)

// Checklist Items — checks in a list
export const ChecklistIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m3 6 1.5 1.5L7 5" />
    <path d="m3 13 1.5 1.5L7 12" />
    <path d="m3 20 1.5 1.5L7 19" />
    <path d="M11 6h10" />
    <path d="M11 13h10" />
    <path d="M11 20h10" />
  </Svg>
)

// Tips — lightbulb
export const TipsIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 18h6" />
    <path d="M10 21h4" />
    <path d="M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.2 1 2.5h6c0-1.3.3-1.8 1-2.5A6 6 0 0 0 12 3Z" />
  </Svg>
)

// PitchPlug · Curators — paper plane (a pitch going out)
export const CuratorsIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M21 4 3 11l6 2.5L11 20l3.5-6L21 4Z" />
    <path d="m9 13.5 5.5-5.5" />
  </Svg>
)

// Industry Members — briefcase
export const IndustryIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="7.5" width="18" height="12" rx="2" />
    <path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5" />
    <path d="M3 13h18" />
  </Svg>
)

// Team Members — group of people
export const TeamIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3" />
    <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
    <path d="M16 5.5a3 3 0 0 1 0 5.5" />
    <path d="M17.5 14.5a5.5 5.5 0 0 1 3 4.5" />
  </Svg>
)

// Client Partners — building
export const ClientPartnersIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="3" width="12" height="18" rx="1.5" />
    <path d="M16 8h3a1.5 1.5 0 0 1 1.5 1.5V21" />
    <path d="M7.5 7h2M7.5 11h2M7.5 15h2" />
    <path d="M10 21v-3.5h0" />
  </Svg>
)

// Deals — dollar in a circle (handshake outcome)
export const DealsIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M14.5 9a2.5 2.5 0 0 0-2.5-1.5c-1.4 0-2.5.8-2.5 2s1.1 1.8 2.5 2 2.5.8 2.5 2-1.1 2-2.5 2A2.5 2.5 0 0 1 9.5 16" />
    <path d="M12 6v1.5M12 16.5V18" />
  </Svg>
)

// GTM Metrics — bar chart with trend
export const MetricsIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 20V4" />
    <path d="M4 20h16" />
    <rect x="7.5" y="12" width="3" height="5" rx="0.5" />
    <rect x="13.5" y="8" width="3" height="9" rx="0.5" />
    <path d="m7 9 4-4 3 2 4-4" />
  </Svg>
)

// Green Room Placements — door / spotlight
export const PlacementsIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" />
    <path d="M4 21h16" />
    <path d="M14.5 12v1.5" />
  </Svg>
)

// Reports — document with lines
export const ReportsIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
    <path d="M8.5 13h7M8.5 16.5h7M8.5 9.5h2" />
  </Svg>
)

// Verification — shield with check
export const VerificationIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3 5 6v5c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z" />
    <path d="m9 12 2 2 4-4" />
  </Svg>
)

// E-Sign Usage — pen signing a line
export const ESignIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 19c2.5 0 2.5-9 5-9s0 7 2.5 7 3-8 5.5-8" />
    <path d="M3 21h18" />
  </Svg>
)

// Sync Library — clapperboard / film
export const SyncIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="8" width="18" height="12" rx="2" />
    <path d="m4 8 2.5-3.5L9 8M9.5 8 12 4.5 14.5 8M15 8l2.5-3.5L20 8" />
  </Svg>
)

// Crate Requests — inbox tray
export const CrateIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 13h4l1.5 2.5h7L17 13h4" />
    <path d="M4.5 7.5 3 13v5a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5l-1.5-5.5A2 2 0 0 0 17.6 6H6.4a2 2 0 0 0-1.9 1.5Z" />
  </Svg>
)

// Selects — starred list
export const SelectsIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h8M4 12h6M4 17h5" />
    <path d="m17 6.5 1.4 2.9 3.1.4-2.3 2.1.6 3.1-2.8-1.5-2.8 1.5.6-3.1-2.3-2.1 3.1-.4z" />
  </Svg>
)

// My Client Partners — person with check
export const MyClientsIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="10" cy="8" r="3.2" />
    <path d="M4 19a6 6 0 0 1 12 0" />
    <path d="m16.5 12.5 1.5 1.5 3-3" />
  </Svg>
)

// Directory — address book
export const DirectoryIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 3h11a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
    <path d="M3 8h2M3 12h2M3 16h2" />
    <circle cx="12" cy="10.5" r="2" />
    <path d="M9 16a3 3 0 0 1 6 0" />
  </Svg>
)

// Artist Invites — person with plus
export const InvitesIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
    <path d="M18 8v6M15 11h6" />
  </Svg>
)

// My Profile — user in a circle
export const ProfileIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="10" r="3" />
    <path d="M6.6 18.5a6 6 0 0 1 10.8 0" />
  </Svg>
)
