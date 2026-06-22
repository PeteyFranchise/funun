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

// PitchPlug — send / paper plane
export const PitchPlugIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M21 4 11 14" />
    <path d="M21 4 14.5 21l-3.5-7-7-3.5z" />
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
