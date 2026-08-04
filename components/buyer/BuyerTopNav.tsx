import Link from 'next/link'
import { BUYER_ROLE_LABELS } from '@/lib/buyers/schema'
import type { BuyerRole } from '@/lib/buyers/schema'
import { ThemeToggle } from '@/components/buyer/ThemeToggle'

// ─── BuyerTopNav ──────────────────────────────────────────────────────────
// The shared light top-nav mounted ONCE by app/(buyer-portal)/layout.tsx
// for every buyer-portal route (nav-reconciliation Option A, 22-03).
// Promotes CatalogBrowserLight's `.top`/`.navlink`/brandmark idiom into a
// standalone component so the catalogue no longer draws a second,
// competing header, and folds in the three portal links + company/tier the
// retired dark sidebar showed, plus the per-buyer dark-theme toggle.
export function BuyerTopNav({
  companyName,
  buyerRole,
  isOrgAdmin,
  theme,
}: {
  companyName: string
  buyerRole: BuyerRole
  isOrgAdmin: boolean
  theme: 'light' | 'dark'
}) {
  return (
    <>
      <style>{TOPNAV_CSS}</style>
      <header className="top">
        <div className="l">
          <Link className="navlink" href="/buyers/catalog">
            <svg className="icn" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            Browse
          </Link>
          <Link className="navlink" href="/buyers/shortlists">
            <svg className="icn" viewBox="0 0 24 24">
              <path d="M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 1 0-7.1 7.1L12 21l8.8-8.3a5 5 0 0 0 0-7.1z" />
            </svg>
            Shortlists
          </Link>
          <Link className="navlink" href="/buyers/requests">
            <svg className="icn" viewBox="0 0 24 24">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="m3 8 9 5 9-5" />
            </svg>
            Requests
          </Link>
        </div>
        <div>
          <div className="brandmark gtext">FUNŪN</div>
          <span className="brandsub">THE ARTS</span>
        </div>
        <div className="r">
          <div className="org">
            <p className="orgname">{companyName}</p>
            <p className="orgtier">
              {BUYER_ROLE_LABELS[buyerRole]}
              {isOrgAdmin ? ' · Org admin' : ''}
            </p>
          </div>
          <ThemeToggle theme={theme} />
        </div>
      </header>
    </>
  )
}

// Nav-only CSS scoped under `.fnbl`, ported from CatalogBrowserLight's
// original header block (that component keeps its own copy for the
// non-embedded/public path). BuyerTopNav needs its own copy because it
// renders on EVERY buyer-portal route (catalog, shortlists, requests), not
// just /buyers/catalog.
const TOPNAV_CSS = `
.fnbl .top{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:26px 40px;}
.fnbl .top .l{display:flex;align-items:center;gap:34px;}
.fnbl .top .r{display:flex;align-items:center;gap:22px;justify-content:flex-end;}
.fnbl .navlink{display:inline-flex;align-items:center;gap:11px;background:none;border:none;padding:0;color:var(--indigo);font-size:15.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;text-decoration:none;}
.fnbl .navlink svg{width:25px;height:25px;stroke-width:1.9;}
.fnbl .navlink:hover{color:var(--fuchsia);}
.fnbl .brandmark{font-size:34px;font-weight:900;letter-spacing:.01em;line-height:1;}
.fnbl .brandsub{display:block;text-align:center;font-size:9.5px;letter-spacing:.4em;font-weight:700;color:var(--ink-3);margin-top:5px;}
.fnbl .org{text-align:right;}
.fnbl .org .orgname{font-size:14px;font-weight:700;color:var(--ink);white-space:nowrap;}
.fnbl .org .orgtier{font-size:11.5px;color:var(--ink-3);margin-top:2px;white-space:nowrap;}
.fnbl .themetoggle{width:38px;height:38px;border-radius:10px;border:1.5px solid var(--line-2);background:#fff;color:var(--indigo);display:flex;align-items:center;justify-content:center;flex:none;}
.fnbl .themetoggle svg{width:19px;height:19px;}
.fnbl .themetoggle:hover{border-color:var(--indigo);background:var(--wash);}
.fnbl[data-theme="dark"] .themetoggle{background:var(--wash);border-color:var(--line-2);}
`
