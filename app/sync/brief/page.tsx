import Link from 'next/link'
import { FNBL_CSS } from '@/components/buyer/fnbl-theme'
import { BriefBuilder } from '@/components/buyer/BriefBuilder'

// /sync/brief — the buyer's Brief Builder home + "My Briefs" (v1 first pass).
// Public (like /help): /sync is not in middleware's protected prefixes, so no
// auth wall. My Briefs list + status light up in v2 (buyer_briefs persistence).
export const metadata = {
  title: 'Build a brief — The Crate · Funūn',
  description: 'Describe your project and Funūn shapes it into a sync brief, matched to the catalogue.',
}

export default function BriefPage() {
  return (
    <div className="fnbl">
      <style>{`${FNBL_CSS}${PAGE_CSS}`}</style>

      <header className="bp-top">
        <Link href="/sync/catalog" className="bp-back">← The Crate</Link>
        <span className="bp-powered">powered by <b className="gtext">Funūn</b></span>
      </header>

      <main className="bp-wrap">
        <BriefBuilder />

        <section className="bp-mine">
          <h2>My briefs</h2>
          <div className="bp-empty">
            <div className="bp-ei"><svg className="icn" viewBox="0 0 24 24"><path d="M5 3.5h9L19 8v12.5H5z" /><path d="M9 12h6M9 15.5h6M9 8.5h3" /></svg></div>
            <p>Briefs you build will live here — with their status as your AE works them (new → reviewing → selects sent → in deal → licensed). Build one above, or go <Link href="/sync/catalog">dig through The Crate</Link>.</p>
          </div>
        </section>
      </main>
    </div>
  )
}

const PAGE_CSS = `
.fnbl .bp-top{display:flex;align-items:center;justify-content:space-between;gap:16px;max-width:1000px;margin:0 auto;padding:26px 40px;}
.fnbl .bp-back{text-decoration:none;color:var(--indigo);font-size:15px;font-weight:800;letter-spacing:.02em;}
.fnbl .bp-back:hover{color:var(--fuchsia);}
.fnbl .bp-powered{font-size:10.5px;font-weight:700;letter-spacing:.19em;text-transform:uppercase;color:var(--ink-3);}
.fnbl .bp-powered b{font-weight:900;letter-spacing:.13em;}
.fnbl .bp-wrap{max-width:760px;margin:0 auto;padding:16px 40px 60px;}
.fnbl .bp-mine{margin-top:56px;padding-top:28px;border-top:1px solid var(--line);}
.fnbl .bp-mine h2{font-size:22px;font-weight:800;margin:0 0 16px;}
.fnbl .bp-empty{display:flex;align-items:flex-start;gap:18px;background:var(--wash);border:1px solid var(--line);border-radius:16px;padding:22px 24px;}
.fnbl .bp-ei{width:52px;height:52px;border-radius:13px;background:var(--page);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;color:var(--indigo);flex:none;}
.fnbl .bp-ei svg{width:24px;height:24px;stroke-width:1.7;}
.fnbl .bp-empty p{font-size:15.5px;line-height:1.6;color:var(--ink-2);margin:0;}
@media (max-width:640px){.fnbl .bp-top{padding:20px;}.fnbl .bp-wrap{padding:12px 20px 40px;}}
`
