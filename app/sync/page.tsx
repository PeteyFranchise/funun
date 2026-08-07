import Link from 'next/link'
import { SAMPLE_CATALOG_ROWS } from '@/lib/deals/catalog-sample'
import { SyncAuthCTAs } from '@/components/buyer/SyncAuthCTAs'

// ─── /sync landing page ─────────────────────────────────────────────────
// 23-02: the public, logged-out-safe front door to the buyer world — hero,
// value prop, a featured-catalogue teaser strip, and Browse + Log in /
// Request access CTAs. Mounts inside the non-gating app/sync/layout.tsx.
//
// Fully renderable with no session: unlike app/sync/catalog/page.tsx (which
// still self-gates for now — 23-03's scope), this page never calls
// loadCatalogPage with a viewer id. The featured strip below reuses the
// SAME representative fixture (SAMPLE_CATALOG_ROWS) the catalog page falls
// back to when the live query has no rights-ready rows, rendered as a
// small non-interactive strip (no play controls, no click-through) — the
// full interactive browse lives at /sync/catalog.
//
// 23-07: the "Log in / Request access" CTA is now split into two buttons
// (Log in / Request access), both rendered by the SyncAuthCTAs client
// island — each opens the SAME LoginRegisterModal in place, with a
// different initialTab ('login' / 'register'), per the plan's own
// key_links note. /sync/access remains the target for the modal's own
// internal links (e.g. a fresh magic-link/password flow) — nothing here
// links to it directly anymore.
//
// No `dynamic` export here — the parent app/sync/layout.tsx already reads
// cookies()/auth.getUser(), which makes the whole /sync route dynamic; this
// page itself needs no session and stays trivially static-content-safe.

const FEATURED = SAMPLE_CATALOG_ROWS.slice(0, 4)

export default function SyncLandingPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-14">
      <style>{LANDING_CSS}</style>

      {/* ─── Hero ─── */}
      <section className="hero">
        <div className="wordmark" aria-label="Funūn">
          <span>FUN</span>
          <NuunGlyph />
          <span>N</span>
        </div>
        <p className="kicker">FUNŪN SYNC</p>
        <h1 className="headline">License independent music, direct.</h1>
        <p className="sub">
          Browse a rights-ready catalog of independent artists and request a sync license —
          Funūn handles clearance, negotiation, and paperwork end to end.
        </p>
        <div className="ctas">
          <Link href="/sync/catalog" className="cta cta-primary">
            Browse the catalog
          </Link>
          <SyncAuthCTAs />
        </div>
      </section>

      {/* ─── Value prop row ─── */}
      <section className="value-row">
        <div className="value-card">
          <p className="value-title">Rights-ready by default</p>
          <p className="value-body">
            Every project you see has already cleared Funūn&apos;s readiness gate — split
            sheets, registrations, and metadata are locked in before it ever reaches you.
          </p>
        </div>
        <div className="value-card">
          <p className="value-title">Direct to independent artists</p>
          <p className="value-body">
            No aggregator layer, no stale library. You&apos;re licensing straight from the
            artists building their careers on Funūn.
          </p>
        </div>
        <div className="value-card">
          <p className="value-title">Fast, transparent licensing</p>
          <p className="value-body">
            Submit a request with your usage, territory, and budget — your whole team sees
            it move through the same dashboard, in real time.
          </p>
        </div>
      </section>

      {/* ─── Featured catalogue teaser ─── */}
      <section className="featured">
        <p className="featured-kicker">Featured catalogue</p>
        <div className="featured-grid">
          {FEATURED.map(row => (
            <div key={row.id} className="featured-card">
              <div
                className="featured-art"
                style={row.coverUrl ? { backgroundImage: `url(${row.coverUrl})` } : { background: row.gradient }}
              />
              <p className="featured-title">{row.title}</p>
              <p className="featured-artist">{row.artist}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Bottom CTA ─── */}
      <section className="bottom-cta">
        <p className="bottom-cta-text">Ready to find your next license?</p>
        <div className="ctas">
          <Link href="/sync/catalog" className="cta cta-primary">
            Browse the catalog
          </Link>
          <SyncAuthCTAs />
        </div>
      </section>
    </div>
  )
}

// Lightweight recreation of the "hidden Nūn" wordmark exploration (option A
// of the 5 explorations in ~/Desktop/Fununbuyerbrowse/FUNUN Logo
// Exploration.html): the second U becomes a calligraphic Nūn bowl, carrying
// only the gradient dot — the bowl itself stays ink so it reads cleanly on
// the light `.fnbl` theme.
function NuunGlyph() {
  return (
    <span className="nuun-glyph" aria-hidden="true">
      <svg width="0.76em" height="0.98em" viewBox="-2 -34 104 134" style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <linearGradient id="syncNuunDot" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#6D5AE0" />
            <stop offset="1" stopColor="#B22BC9" />
          </linearGradient>
        </defs>
        <rect
          x={53 - 12.5}
          y={-15 - 12.5}
          width={25}
          height={25}
          rx={8}
          transform="rotate(45 53 -15)"
          fill="url(#syncNuunDot)"
        />
        <path
          d="M 8.5 24 L 8.5 70 C 8.5 92, 26 96.5, 50 96.5 C 74 96.5, 91.5 92, 91.5 70 L 91.5 11 L 85 7 L 64.5 31 L 64.5 69 C 64.5 80, 35.5 80, 35.5 69 L 35.5 34 Z"
          fill="currentColor"
        />
      </svg>
    </span>
  )
}

const LANDING_CSS = `
.hero{text-align:center;padding:40px 0 56px;}
.wordmark{display:flex;align-items:baseline;justify-content:center;gap:2px;font-size:56px;font-weight:900;letter-spacing:-.02em;color:var(--ink);line-height:1;}
.nuun-glyph{color:var(--ink);display:inline-flex;align-items:baseline;}
.kicker{margin-top:14px;font-size:12px;font-weight:700;letter-spacing:.4em;color:var(--ink-3);text-transform:uppercase;}
.headline{margin-top:18px;font-size:34px;font-weight:800;color:var(--ink);max-width:640px;margin-left:auto;margin-right:auto;}
.sub{margin-top:14px;font-size:15px;line-height:1.6;color:var(--ink-2);max-width:520px;margin-left:auto;margin-right:auto;}
.ctas{margin-top:28px;display:flex;align-items:center;justify-content:center;gap:14px;flex-wrap:wrap;}
.cta{border-radius:999px;padding:12px 26px;font-size:14px;font-weight:700;text-decoration:none;transition:opacity .15s;}
.cta-primary{background:var(--grad);color:#fff;}
.cta-primary:hover{opacity:.9;}
.cta-secondary{border:1.5px solid var(--line-2);color:var(--indigo);background:#fff;}
.cta-secondary:hover{background:var(--wash);}
.value-row{margin-top:24px;display:grid;grid-template-columns:repeat(3,1fr);gap:20px;}
.value-card{border:1px solid var(--line);background:var(--wash);border-radius:16px;padding:22px;}
.value-title{font-size:15px;font-weight:700;color:var(--ink);}
.value-body{margin-top:8px;font-size:13px;line-height:1.55;color:var(--ink-2);}
.featured{margin-top:64px;}
.featured-kicker{font-size:12px;font-weight:700;letter-spacing:.2em;color:var(--ink-3);text-transform:uppercase;}
.featured-grid{margin-top:16px;display:grid;grid-template-columns:repeat(4,1fr);gap:16px;}
.featured-card{border:1px solid var(--line);border-radius:14px;overflow:hidden;background:#fff;}
.featured-art{width:100%;aspect-ratio:1;background-size:cover;background-position:center;}
.featured-title{margin:10px 12px 0;font-size:13px;font-weight:700;color:var(--ink);}
.featured-artist{margin:2px 12px 12px;font-size:12px;color:var(--ink-3);}
.bottom-cta{margin-top:72px;text-align:center;border-top:1px solid var(--line);padding-top:44px;}
.bottom-cta-text{font-size:20px;font-weight:700;color:var(--ink);}
@media (max-width: 720px){
  .value-row{grid-template-columns:1fr;}
  .featured-grid{grid-template-columns:repeat(2,1fr);}
  .wordmark{font-size:40px;}
  .headline{font-size:26px;}
}
`
