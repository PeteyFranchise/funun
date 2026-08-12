import Link from 'next/link'
import { FNBL_CSS } from '@/components/buyer/fnbl-theme'

// Public Help / How Licensing Works page (Lane 1 — step 1).
// Reachable signed-in OR logged-out: /help is not in middleware's protected
// prefix allowlist, so it needs no auth. Wrapped in `.fnbl` + FNBL_CSS so it
// carries the light buyer aesthetic (and dark-mode tokens) even though it
// renders outside the buyer-portal layout.
export const metadata = {
  title: 'How licensing works — Funūn',
  description:
    'How sync licensing works on Funūn: browse the catalogue, request a license, and let an Account Executive handle the deal.',
}

const STEPS: { t: string; d: string }[] = [
  { t: 'Browse & shortlist', d: 'Search the catalogue, filter by mood, energy, genre and more, preview tracks, and save favorites.' },
  { t: 'Request a license', d: 'Pick a track and tell us the use — where it runs, territory, term, and whether you need exclusivity — plus your offer.' },
  { t: 'We handle the deal', d: 'A Funūn Account Executive reviews your request, confirms rights and pricing with the artist, and negotiates the terms.' },
  { t: 'Sign', d: 'Once terms are agreed, the license is signed digitally — you get a clear, countersigned agreement.' },
  { t: 'Get your files', d: 'The licensed master is delivered, cleared for the exact use you agreed to.' },
]

const BADGES: { cls: string; label: string; d: string }[] = [
  { cls: 'ok', label: 'Rights ready', d: 'Cleared and ready to license — the fastest path from request to signed deal.' },
  { cls: 'part', label: 'Partial rights', d: 'Most rights are in place; a detail or two may need confirming before signing.' },
  { cls: 'req', label: 'Contact required', d: 'Licensing needs a conversation first — for example a co-writer or a sample to clear.' },
]

const FAQ: { q: string; a: string }[] = [
  { q: 'How much does a license cost?', a: 'It depends on the use: where the music runs, for how long, the territory, and whether you need exclusivity. Tell us your use in a request and we’ll quote it.' },
  { q: 'Do I need an account to browse?', a: 'No — browse and preview freely. You’ll create a free account when you save a shortlist or request a license.' },
  { q: 'What’s the difference between non-exclusive and exclusive?', a: 'Non-exclusive means others can license the same track too. Exclusive means we lock it to you for the agreed scope and time — which costs more, because you’re paying for that scarcity.' },
  { q: 'Can you find music for a specific brief?', a: 'Yes. Send us the brief and an Account Executive will pull options from the catalogue that fit what you need.' },
]

export default function HelpPage() {
  return (
    <div className="fnbl">
      <style>{`${FNBL_CSS}${HELP_CSS}`}</style>

      <header className="help-top">
        <Link href="/sync/catalog" className="help-brand">
          <span className="brandmark gtext">FUNŪN</span>
          <span className="brandsub">THE ARTS</span>
        </Link>
        <Link href="/sync/catalog" className="help-back">Browse the catalogue →</Link>
      </header>

      <main className="help-wrap">
        <p className="help-eyebrow">Help</p>
        <h1 className="help-h1">How licensing works</h1>
        <p className="help-lead">
          Funūn <span className="pron">(fuh-NOON)</span> is where you license real music from independent artists for your videos, ads, films,
          shows, games and social. Here’s how a license goes from a track you love to files you can use.
        </p>

        <section className="help-sec">
          <h2>What is a sync license?</h2>
          <p>
            A <strong>sync (synchronization) license</strong> is permission to pair a piece of music with
            visual media. Streaming a song isn’t the same as using it in a video — putting music to picture
            needs its own license. On Funūn you browse the catalogue and request a license for the exact use
            you have in mind, and we clear it with the artist on your behalf.
          </p>
        </section>

        <section className="help-sec">
          <h2>How it works at Funūn</h2>
          <ol className="help-steps">
            {STEPS.map((s, i) => (
              <li key={s.t}>
                <span className="help-num">{i + 1}</span>
                <div>
                  <h3>{s.t}</h3>
                  <p>{s.d}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="help-sec">
          <h2>Reading the rights badges</h2>
          <p>Every track in the catalogue shows how ready it is to license, at a glance:</p>
          <div className="help-badges">
            {BADGES.map(b => (
              <div className="help-badge" key={b.cls}>
                <span className={`rb ${b.cls}`}>{b.label}</span>
                <p>{b.d}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="help-sec">
          <h2>Frequently asked</h2>
          <div className="help-faq">
            {FAQ.map(f => (
              <div className="help-qa" key={f.q}>
                <h3>{f.q}</h3>
                <p>{f.a}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="help-cta">
          <div>
            <h2>Ready to find your track?</h2>
            <p>Browse the full catalogue, preview anything, and send a request when you’re ready.</p>
          </div>
          <Link href="/sync/catalog" className="help-cta-btn">Browse the catalogue</Link>
        </section>
      </main>
    </div>
  )
}

const HELP_CSS = `
.fnbl .help-top{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:26px 40px;max-width:1000px;margin:0 auto;}
.fnbl .help-brand{text-decoration:none;display:inline-block;}
.fnbl .help-brand .brandmark{font-size:30px;font-weight:900;line-height:1;}
.fnbl .help-brand .brandsub{display:block;text-align:center;font-size:9px;letter-spacing:.4em;font-weight:700;color:var(--ink-3);margin-top:5px;}
.fnbl .help-back{text-decoration:none;color:var(--indigo);font-size:14px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;white-space:nowrap;}
.fnbl .help-back:hover{color:var(--fuchsia);}
.fnbl .help-wrap{max-width:760px;margin:0 auto;padding:24px 40px 40px;}
.fnbl .help-eyebrow{font-size:12px;letter-spacing:.2em;text-transform:uppercase;font-weight:800;color:var(--fuchsia);margin:0 0 10px;}
.fnbl .help-h1{font-size:46px;font-weight:900;letter-spacing:-.01em;line-height:1.05;margin:0 0 18px;}
.fnbl .help-lead{font-size:19px;line-height:1.6;color:var(--ink-2);margin:0 0 8px;}
.fnbl .help-lead .pron{color:var(--ink-3);font-weight:500;letter-spacing:.01em;}
.fnbl .help-sec{margin-top:48px;}
.fnbl .help-sec>h2{font-size:24px;font-weight:800;margin:0 0 14px;}
.fnbl .help-sec>p{font-size:16.5px;line-height:1.7;color:var(--ink-2);margin:0 0 12px;}
.fnbl .help-sec strong{color:var(--ink);font-weight:700;}
.fnbl .help-steps{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:14px;}
.fnbl .help-steps li{display:flex;gap:16px;align-items:flex-start;background:var(--wash);border:1px solid var(--line);border-radius:16px;padding:18px 20px;}
.fnbl .help-num{flex:none;width:34px;height:34px;border-radius:999px;background:var(--grad);color:#fff;font-weight:800;font-size:16px;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 20px -10px rgba(109,90,224,.6);}
.fnbl .help-steps h3{font-size:17px;font-weight:800;margin:2px 0 4px;}
.fnbl .help-steps p{font-size:15.5px;line-height:1.6;color:var(--ink-2);margin:0;}
.fnbl .help-badges{display:flex;flex-direction:column;gap:12px;margin-top:6px;}
.fnbl .help-badge{display:flex;align-items:center;gap:16px;padding:14px 4px;border-bottom:1px solid var(--line);}
.fnbl .help-badge:last-child{border-bottom:none;}
.fnbl .help-badge p{font-size:15.5px;line-height:1.55;color:var(--ink-2);margin:0;}
.fnbl .rb{flex:none;display:inline-flex;align-items:center;font-size:13px;font-weight:800;letter-spacing:.02em;border-radius:999px;padding:7px 14px;white-space:nowrap;min-width:150px;justify-content:center;}
.fnbl .rb.ok{color:var(--ok-fg);background:var(--ok-bg);border:1px solid var(--ok-line);}
.fnbl .rb.part{color:var(--part-fg);background:var(--part-bg);border:1px solid var(--part-line);}
.fnbl .rb.req{color:var(--req-fg);background:var(--req-bg);border:1px solid var(--req-line);}
.fnbl .help-faq{display:flex;flex-direction:column;gap:20px;}
.fnbl .help-qa h3{font-size:17px;font-weight:800;margin:0 0 6px;}
.fnbl .help-qa p{font-size:16px;line-height:1.65;color:var(--ink-2);margin:0;}
.fnbl .help-cta{margin-top:56px;display:flex;align-items:center;justify-content:space-between;gap:24px;flex-wrap:wrap;background:var(--wash);border:1px solid var(--line);border-radius:22px;padding:28px 32px;}
.fnbl .help-cta h2{font-size:22px;font-weight:800;margin:0 0 6px;}
.fnbl .help-cta p{font-size:15.5px;color:var(--ink-2);margin:0;}
.fnbl .help-cta-btn{flex:none;text-decoration:none;background:var(--grad);color:#fff;font-size:16px;font-weight:800;border-radius:999px;padding:16px 28px;box-shadow:0 14px 30px -12px rgba(109,90,224,.6);}
.fnbl .help-cta-btn:hover{filter:brightness(1.05);}
@media (max-width:640px){.fnbl .help-top{padding:20px;}.fnbl .help-wrap{padding:16px 20px 32px;}.fnbl .help-h1{font-size:34px;}}
`
