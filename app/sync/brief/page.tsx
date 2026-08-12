import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'
import { FNBL_CSS } from '@/components/buyer/fnbl-theme'
import { BriefBuilder } from '@/components/buyer/BriefBuilder'
import { coerceBrief, isBriefStatus, BRIEF_STATUS_LABELS, type SavedBrief } from '@/lib/buyer/brief'

// /sync/brief — the buyer's Brief Builder + "My Briefs" (v2).
// Public (like /help): /sync is not in middleware's protected prefixes, so no
// auth wall. A logged-in buyer can Send to their AE (persisted to buyer_briefs,
// migration 106) and sees their briefs + live status here; a guest / non-buyer
// builds freely and register-gates on send. My Briefs reads via the session
// client (RLS scopes it to the caller's org); tolerant of the table not
// existing yet (pre-migration) so the page never 500s.
export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Build a brief — The Crate · Funūn',
  description: 'Describe your project and Funūn shapes it into a sync brief, matched to the catalogue.',
}

const STATUS_TONE: Record<string, string> = {
  new: 'new',
  ae_reviewing: 'active',
  selects_sent: 'active',
  in_deal: 'deal',
  licensed: 'won',
  closed: 'closed',
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

async function loadMyBriefs(): Promise<{ canSend: boolean; briefs: SavedBrief[] }> {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { canSend: false, briefs: [] }

  const { data: member } = await supabase
    .from('buyer_members')
    .select('org_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!member) return { canSend: false, briefs: [] }

  // RLS scopes this to the caller's org; the explicit filter is belt-and-braces.
  // If buyer_briefs doesn't exist yet (pre-migration), `error` is set — treat as
  // no briefs rather than crashing the page.
  const { data, error } = await supabase
    .from('buyer_briefs')
    .select('id, status, title, brief, created_at')
    .eq('buyer_org_id', member.org_id)
    .order('created_at', { ascending: false })

  const briefs: SavedBrief[] =
    !error && data
      ? data.map(r => ({
          id: r.id as string,
          status: isBriefStatus(r.status) ? r.status : 'new',
          title: (r.title as string | null) ?? null,
          brief: coerceBrief(r.brief),
          created_at: r.created_at as string,
        }))
      : []

  return { canSend: true, briefs }
}

export default async function BriefPage() {
  const { canSend, briefs } = await loadMyBriefs()

  return (
    <div className="fnbl">
      <style>{`${FNBL_CSS}${PAGE_CSS}`}</style>

      <header className="bp-top">
        <Link href="/sync/catalog" className="bp-back">← The Crate</Link>
        <span className="bp-powered">powered by <b className="gtext">Funūn</b></span>
      </header>

      <main className="bp-wrap">
        <BriefBuilder canSend={canSend} />

        <section className="bp-mine">
          <h2>My briefs</h2>
          {briefs.length === 0 ? (
            <div className="bp-empty">
              <div className="bp-ei"><svg className="icn" viewBox="0 0 24 24"><path d="M5 3.5h9L19 8v12.5H5z" /><path d="M9 12h6M9 15.5h6M9 8.5h3" /></svg></div>
              <p>Briefs you send will live here — with their status as your AE works them (new → reviewing → selects sent → in deal → licensed). Build one above, or go <Link href="/sync/catalog">dig through The Crate</Link>.</p>
            </div>
          ) : (
            <div className="bp-list">
              {briefs.map(b => {
                const detail = [...b.brief.creative.mood, ...b.brief.creative.genre].slice(0, 4).join(', ')
                return (
                  <div className="bp-brief" key={b.id}>
                    <div className="bp-bmain">
                      <div className="bp-btitle">{b.title || 'Untitled brief'}</div>
                      {detail && <div className="bp-bdetail">{detail}</div>}
                    </div>
                    <span className="bp-bdate">{fmtDate(b.created_at)}</span>
                    <span className={`bp-st ${STATUS_TONE[b.status] ?? 'new'}`}>{BRIEF_STATUS_LABELS[b.status]}</span>
                  </div>
                )
              })}
            </div>
          )}
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
.fnbl .bp-list{display:flex;flex-direction:column;gap:10px;}
.fnbl .bp-brief{display:flex;align-items:center;gap:16px;background:var(--page);border:1px solid var(--line);border-radius:14px;padding:16px 18px;}
.fnbl .bp-bmain{flex:1;min-width:0;}
.fnbl .bp-btitle{font-size:16px;font-weight:700;color:var(--ink);line-height:1.3;}
.fnbl .bp-bdetail{font-size:13.5px;color:var(--ink-3);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.fnbl .bp-bdate{font-size:13px;color:var(--ink-3);font-weight:600;flex:none;white-space:nowrap;}
.fnbl .bp-st{flex:none;font-size:12px;font-weight:800;letter-spacing:.03em;border-radius:999px;padding:6px 12px;white-space:nowrap;}
.fnbl .bp-st.new{color:var(--indigo);background:var(--wash-2);}
.fnbl .bp-st.active{color:var(--indigo);background:rgba(109,90,224,.13);}
.fnbl .bp-st.deal{color:var(--part-fg);background:var(--part-bg);border:1px solid var(--part-line);}
.fnbl .bp-st.won{color:var(--ok-fg);background:var(--ok-bg);border:1px solid var(--ok-line);}
.fnbl .bp-st.closed{color:var(--ink-3);background:var(--wash);}
@media (max-width:640px){.fnbl .bp-top{padding:20px;}.fnbl .bp-wrap{padding:12px 20px 40px;}.fnbl .bp-brief{flex-wrap:wrap;gap:8px 12px;}.fnbl .bp-bmain{flex:1 1 100%;}}
`
