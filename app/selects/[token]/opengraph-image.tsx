import { ImageResponse } from 'next/og'
import { createServiceClient } from '@/lib/supabase/server'
import { resolveSelectsByToken } from '@/lib/selects/public-resolve'

// ─── og:image — a branded gradient card (31-UI-SPEC §OpenGraph, R12) ──────
// Next's file-convention route: automatically wired into generateMetadata's
// openGraph.images for app/selects/[token]/page.tsx, no manual `images`
// array needed there. Deliberately a LIGHTWEIGHT, separate lookup from
// page.tsx's full resolvePlayerData — this route only ever needs the
// Selects' name, never track/org/AE details, and an invalid/expired token
// renders the SAME generic branded card as a valid one would with no cover
// note (R12 — leaks nothing beyond "a Selects exists or doesn't", which the
// image alone cannot distinguish either way).
// Node runtime — createServiceClient (@supabase/supabase-js) uses Node APIs
// not available on the Edge runtime that image-generation routes default to
// (mirrors the same `export const runtime = 'nodejs'` convention already
// used by other server-heavy routes, e.g. app/api/vault/[projectId]/export/route.ts).
export const runtime = 'nodejs'
export const alt = 'A Selects from Funūn'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const service = createServiceClient()
  const selects = await resolveSelectsByToken(service, token)
  const title = selects?.name ?? 'Funūn'

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(105deg, #818CF8 0%, #D946EF 100%)',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: 4, color: 'rgba(255,255,255,.85)' }}>FUNŪN · SELECTS</div>
        <div
          style={{
            marginTop: 24,
            fontSize: 64,
            fontWeight: 900,
            color: '#ffffff',
            textAlign: 'center',
            padding: '0 80px',
            maxWidth: 1000,
          }}
        >
          {title}
        </div>
      </div>
    ),
    size
  )
}
