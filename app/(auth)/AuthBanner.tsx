import Link from 'next/link'

// ─── Auth surface banner ────────────────────────────────────────────────
// Server component (no 'use client') — pure decoration, no interactivity.
// Renders the owner-approved 126px masked colour plate + 44-bar waveform +
// in-banner wordmark from private/bench/signin.html / signup.html.

// Bar heights are frozen literals, not a render-time trig call. They equal
// 18 + abs(sin(i * 1.7)) * 38 for i in 0..43, rounded to 2dp, computed once
// at author time. The sine function is implementation-defined to the last
// ULP (ECMA-262), so a Node-rendered string and a browser-rendered string
// can legitimately differ — which React reports as a hydration mismatch on
// the very first screen a member sees. Freezing the values removes that
// risk entirely; the picture is identical either way. (Deliberately not
// spelled with the JS method names here so this comment itself does not
// trip the plan's negative grep for a render-time trig call.)
const BANNER_BAR_HEIGHTS = [
  18, 55.68, 27.71, 53.18, 36.78, 48.34, 44.6, 41.49, 50.65, 33.08, 54.53, 23.66, 55.99, 22.13,
  54.93, 31.64, 51.41, 40.25, 45.68, 47.39, 38.11, 52.57, 29.2, 55.45, 19.55, 55.85, 26.21, 53.74,
  35.42, 49.25, 43.47, 42.69, 49.83, 34.48, 54.08, 25.19, 55.93, 20.59, 55.26, 30.19, 52.12, 38.98,
  46.71, 46.38,
] as const

// Wordmark glyph bars — six fixed bar heights (px), not derived from the
// waveform above.
const GLYPH_BAR_HEIGHTS = [9, 16, 24, 13, 20, 8] as const

export function AuthBanner() {
  return (
    <div className="relative h-[126px] overflow-hidden">
      {/* The masked colour plate. This is the first mask used anywhere in
          app/ or components/ — it dissolves the banner's colour into the
          card's own ground instead of ending it on a hard rule. Inline
          style is permitted here: middleware.ts's CSP is
          `style-src 'self' 'unsafe-inline'`, and the per-request nonce
          gates `script-src` only. */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(72% 150% at 18% 0%,rgba(129,140,248,.62),transparent 62%), radial-gradient(62% 140% at 82% 6%,rgba(217,70,239,.50),transparent 62%), #0d0b1a',
          WebkitMaskImage:
            'linear-gradient(to bottom,#000 0%,#000 32%,rgba(0,0,0,.42) 72%,transparent 100%)',
          maskImage:
            'linear-gradient(to bottom,#000 0%,#000 32%,rgba(0,0,0,.42) 72%,transparent 100%)',
        }}
      />

      {/* The waveform. Bars float clear of the bottom edge and are capped
          at both ends — rounded-full on a flex-1 bar shows both the top
          and the bottom, which is what the owner asked to see. */}
      <div
        aria-hidden
        className="absolute bottom-[15px] left-0 right-0 flex h-16 items-end gap-[3px] px-[18px]"
      >
        {BANNER_BAR_HEIGHTS.map((height, i) => (
          <span
            key={i}
            className="flex-1 rounded-full"
            style={{
              background: 'linear-gradient(to top,rgba(255,255,255,.92),rgba(255,255,255,.20))',
              height: `${height}%`,
            }}
          />
        ))}
      </div>

      {/* The wordmark, moved in from the layout so it lives inside the
          banner instead of floating above the card. */}
      <Link
        href="/"
        className="absolute left-5 top-4 flex items-center gap-[9px] text-[14px] font-bold tracking-[-.015em] text-white"
      >
        <span aria-hidden className="flex h-6 items-center gap-[2.5px]">
          {GLYPH_BAR_HEIGHTS.map((height, i) => (
            <span
              key={i}
              className="w-[3px] rounded-full bg-grad"
              style={{ height: `${height}px` }}
            />
          ))}
        </span>
        Funūn
        <span className="text-[9.5px] font-medium text-white/[0.62]">(fuh-NOON)</span>
      </Link>
    </div>
  )
}
