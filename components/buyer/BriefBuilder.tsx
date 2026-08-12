'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FNBL_CSS } from '@/components/buyer/fnbl-theme'
import {
  BRIEF_MOODS as MOODS,
  BRIEF_GENRES as GENRES,
  BRIEF_ENERGY as ENERGY,
  BRIEF_VOCALS as VOCALS,
  BRIEF_USES as USES,
  BRIEF_TERRITORIES as TERRITORIES,
  BRIEF_TERMS as TERMS,
  BRIEF_EXCLUSIVITY as EXCL,
  coerceBrief,
  BRIEF_APPLY_KEY,
  type Brief,
} from '@/lib/buyer/brief'

// Brief Builder (v1) — the buyer describes a project; "Draft the brief" sends
// the prose to /api/buyer/brief-draft (Claude → structured Brief) and fills
// the form; "See matches in The Crate" hands the brief to the catalogue via a
// one-shot sessionStorage key and navigates; "Send to my AE" is an honest
// placeholder until v2 persistence + AE routing land. Rendered as the
// /sync/brief page and (later) as a panel over The Crate.

function Chips({ options, value, onToggle }: { options: readonly string[]; value: string[]; onToggle: (v: string) => void }) {
  return (
    <div className="bb-chips">
      {options.map(o => (
        <button key={o} type="button" className={`bb-chip ${value.includes(o) ? 'on' : ''}`} onClick={() => onToggle(o)}>{o}</button>
      ))}
    </div>
  )
}

export function BriefBuilder({ onClose, canSend = false }: { onClose?: () => void; canSend?: boolean }) {
  const router = useRouter()

  const [prose, setProse] = useState('')
  const [mood, setMood] = useState<string[]>([])
  const [genre, setGenre] = useState<string[]>([])
  const [energy, setEnergy] = useState<string[]>([])
  const [vocals, setVocals] = useState<string>('Either')
  const [use, setUse] = useState<string>(USES[0])
  const [territory, setTerritory] = useState<string>(TERRITORIES[0])
  const [term, setTerm] = useState<string>(TERMS[0])
  const [excl, setExcl] = useState<string>(EXCL[0])
  const [budget, setBudget] = useState('')
  const [notes, setNotes] = useState('')

  // AI draft + send state
  const [drafting, setDrafting] = useState(false)
  const [drafted, setDrafted] = useState(false)
  const [draftError, setDraftError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<{ kind: 'sent' | 'gate' | 'error'; msg: string } | null>(null)

  const toggle = (set: React.Dispatch<React.SetStateAction<string[]>>) => (v: string) =>
    set(cur => (cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v]))

  const currentBrief = (): Brief => ({
    creative: { mood, genre, energy, vocals },
    deal: { use, territory, term, exclusivity: excl, budget },
    notes,
  })

  async function draft() {
    const text = prose.trim()
    if (!text || drafting) return
    setDrafting(true)
    setDraftError(null)
    try {
      const res = await fetch('/api/buyer/brief-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prose: text }),
      })
      const json = (await res.json().catch(() => ({}))) as { data?: Brief; error?: string }
      if (!res.ok || !json.data) {
        setDraftError(json.error ?? 'Draft failed — give it another go.')
        return
      }
      const b = coerceBrief(json.data)
      setMood(b.creative.mood)
      setGenre(b.creative.genre)
      setEnergy(b.creative.energy)
      setVocals(b.creative.vocals)
      setUse(b.deal.use)
      setTerritory(b.deal.territory)
      setTerm(b.deal.term)
      setExcl(b.deal.exclusivity)
      setBudget(b.deal.budget)
      setNotes(b.notes)
      setDrafted(true)
    } catch {
      setDraftError('Something went sideways — give it another go.')
    } finally {
      setDrafting(false)
    }
  }

  function seeMatches() {
    try {
      sessionStorage.setItem(BRIEF_APPLY_KEY, JSON.stringify(currentBrief()))
    } catch {
      /* private mode / storage blocked — the Crate just opens unfiltered */
    }
    router.push('/sync/catalog')
  }

  async function sendToAe() {
    if (sending) return
    // Guests / non-buyers register-gate before anything is persisted.
    if (!canSend) {
      setSendResult({ kind: 'gate', msg: 'gate' })
      return
    }
    setSending(true)
    setSendResult(null)
    try {
      const res = await fetch('/api/buyer/briefs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prose, brief: currentBrief() }),
      })
      const json = (await res.json().catch(() => ({}))) as { data?: { id: string }; error?: string }
      if (!res.ok || !json.data) {
        setSendResult({ kind: 'error', msg: json.error ?? 'Could not send — give it another go.' })
        return
      }
      setSendResult({ kind: 'sent', msg: 'sent' })
      router.refresh() // re-render the server page so My briefs picks it up
    } catch {
      setSendResult({ kind: 'error', msg: 'Something went sideways — give it another go.' })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fnbl bb">
      <style>{`${FNBL_CSS}${BB_CSS}`}</style>

      <div className="bb-head">
        <div>
          <p className="bb-eye">Brief Builder</p>
          <h1 className="bb-h1">Describe your project</h1>
        </div>
        {onClose && <button type="button" className="bb-x" aria-label="Close" onClick={onClose}><svg className="icn" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12" /></svg></button>}
      </div>
      <p className="bb-lead">Tell us what you need in your own words. We&rsquo;ll shape it into a brief and match it to the catalogue. Not sure on a detail? Leave it; let us fill the gaps. We got you.</p>

      <div className="bb-ai">
        <textarea value={prose} onChange={e => setProse(e.target.value)} rows={3} disabled={drafting}
          placeholder="e.g. Something warm and hopeful, mostly instrumental, that builds — for a 30-second car ad, worldwide, one year. Budget around $10k." />
        <button type="button" className="bb-draft" onClick={draft} disabled={drafting || !prose.trim()}>
          {drafting
            ? <span className="bb-spin" aria-hidden="true" />
            : <svg className="icn" viewBox="0 0 24 24"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" /></svg>}
          {drafting ? 'Drafting…' : 'Draft the brief'}
        </button>
        {draftError
          ? <span className="bb-err" role="alert">{draftError}</span>
          : drafted
            ? <span className="bb-ok">Filled in below — tweak anything.</span>
            : <span className="bb-soon">AI drafts it; you refine it.</span>}
      </div>

      <div className="bb-grid">
        <div className="bb-field bb-wide"><label>Mood</label><Chips options={MOODS} value={mood} onToggle={toggle(setMood)} /></div>
        <div className="bb-field bb-wide"><label>Genre</label><Chips options={GENRES} value={genre} onToggle={toggle(setGenre)} /></div>
        <div className="bb-field bb-wide"><label>Energy</label><Chips options={ENERGY} value={energy} onToggle={toggle(setEnergy)} /></div>
        <div className="bb-field"><label>Vocals</label><select value={vocals} onChange={e => setVocals(e.target.value)}>{VOCALS.map(o => <option key={o}>{o}</option>)}</select></div>
        <div className="bb-field"><label>Use</label><select value={use} onChange={e => setUse(e.target.value)}>{USES.map(o => <option key={o}>{o}</option>)}</select></div>
        <div className="bb-field"><label>Territory</label><select value={territory} onChange={e => setTerritory(e.target.value)}>{TERRITORIES.map(o => <option key={o}>{o}</option>)}</select></div>
        <div className="bb-field"><label>Term</label><select value={term} onChange={e => setTerm(e.target.value)}>{TERMS.map(o => <option key={o}>{o}</option>)}</select></div>
        <div className="bb-field"><label>Exclusivity</label><select value={excl} onChange={e => setExcl(e.target.value)}>{EXCL.map(o => <option key={o}>{o}</option>)}</select></div>
        <div className="bb-field"><label>Budget</label><input type="text" value={budget} onChange={e => setBudget(e.target.value)} placeholder="e.g. $8,000–12,000" /></div>
        <div className="bb-field bb-wide"><label>Anything else</label><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Edit length, air date, references to feature or avoid…" /></div>
      </div>

      <div className="bb-foot">
        {sendResult?.kind === 'sent' ? (
          <div className="bb-sent" role="status">
            <svg className="icn" viewBox="0 0 24 24"><path d="M12 3 4 7v6c0 5 3.4 7.4 8 8 4.6-.6 8-3 8-8V7z" /><path d="m9 12 2 2 4-4" /></svg>
            <span>Sent to your AE — it&rsquo;s in their queue. Track it in <b>My briefs</b> below.</span>
          </div>
        ) : sendResult?.kind === 'gate' ? (
          <div className="bb-sent bb-gate" role="status">
            <svg className="icn" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" /></svg>
            <span>You&rsquo;ll need a buyer account to send this to an AE. <a href="/signin">Sign in</a> and it&rsquo;s one click — your brief stays right here.</span>
          </div>
        ) : sendResult?.kind === 'error' ? (
          <span className="bb-err" role="alert">{sendResult.msg}</span>
        ) : (
          <span className="bb-note">Nothing is charged here — a brief starts a conversation with your AE.</span>
        )}
        <div className="bb-actions">
          <button type="button" className="bb-secondary" onClick={sendToAe} disabled={sending}>{sending ? 'Sending…' : 'Send to my AE'}</button>
          <button type="button" className="bb-primary" onClick={seeMatches}>See matches in The Crate</button>
        </div>
      </div>
    </div>
  )
}

const BB_CSS = `
.fnbl.bb, .fnbl .bb{max-width:760px;margin:0 auto;}
.bb .bb-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;}
.bb .bb-eye{font-size:12px;letter-spacing:.2em;text-transform:uppercase;font-weight:800;color:var(--fuchsia);margin:0 0 8px;}
.bb .bb-h1{font-size:34px;font-weight:900;letter-spacing:-.01em;margin:0;}
.bb .bb-x{width:40px;height:40px;border:none;background:none;border-radius:10px;color:var(--ink-3);display:flex;align-items:center;justify-content:center;flex:none;}
.bb .bb-x:hover{background:var(--wash);color:var(--ink);}
.bb .bb-x svg{width:22px;height:22px;stroke-width:2.4;}
.bb .bb-lead{font-size:16.5px;line-height:1.6;color:var(--ink-2);margin:12px 0 22px;}
.bb .bb-ai{background:var(--wash);border:1px solid var(--line);border-radius:16px;padding:16px;display:flex;flex-wrap:wrap;align-items:center;gap:12px;}
.bb .bb-ai textarea{flex:1 1 100%;background:var(--page);border:1.5px solid var(--line-2);border-radius:12px;padding:14px 15px;font:500 16px 'Inter',system-ui,sans-serif;color:var(--ink);outline:none;resize:vertical;}
.bb .bb-ai textarea:focus{border-color:var(--indigo);box-shadow:0 0 0 3px rgba(109,90,224,.16);}
.bb .bb-ai textarea:disabled{opacity:.6;}
.bb .bb-draft{display:inline-flex;align-items:center;gap:9px;background:var(--grad);color:#fff;border:none;border-radius:11px;padding:13px 20px;font-size:15px;font-weight:800;box-shadow:0 12px 26px -12px rgba(109,90,224,.6);}
.bb .bb-draft:disabled{opacity:.6;box-shadow:none;}
.bb .bb-draft svg{width:17px;height:17px;stroke-width:2;}
.bb .bb-spin{width:16px;height:16px;border:2px solid rgba(255,255,255,.45);border-top-color:#fff;border-radius:50%;animation:bbspin .7s linear infinite;}
@keyframes bbspin{to{transform:rotate(360deg);}}
.bb .bb-soon{font-size:12.5px;color:var(--ink-3);font-weight:600;}
.bb .bb-ok{font-size:12.5px;color:var(--ok-fg);font-weight:700;}
.bb .bb-err{font-size:12.5px;color:var(--req-fg);font-weight:700;}
.bb .bb-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px 18px;margin-top:24px;}
.bb .bb-field{min-width:0;}
.bb .bb-field.bb-wide{grid-column:1 / -1;}
.bb .bb-field label{display:block;font-size:10.5px;letter-spacing:.15em;text-transform:uppercase;font-weight:800;color:var(--ink-3);margin-bottom:9px;}
.bb .bb-field select,.bb .bb-field input,.bb .bb-field textarea{width:100%;border:1.5px solid var(--line-2);border-radius:10px;padding:12px 13px;font:500 15px 'Inter',system-ui,sans-serif;color:var(--ink);background:var(--page);outline:none;}
.bb .bb-field select:focus,.bb .bb-field input:focus,.bb .bb-field textarea:focus{border-color:var(--indigo);box-shadow:0 0 0 3px rgba(109,90,224,.16);}
.bb .bb-chips{display:flex;flex-wrap:wrap;gap:8px;}
.bb .bb-chip{border:1.5px solid var(--line-2);background:var(--page);color:var(--indigo);border-radius:999px;padding:9px 15px;font-size:13.5px;font-weight:700;}
.bb .bb-chip:hover{border-color:var(--indigo);background:var(--wash);}
.bb .bb-chip.on{background:var(--grad);border-color:transparent;color:#fff;}
.bb .bb-foot{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px;margin-top:28px;padding-top:20px;border-top:1px solid var(--line);}
.bb .bb-note{font-size:13px;color:var(--ink-3);}
.bb .bb-sent{display:flex;align-items:flex-start;gap:10px;font-size:13px;line-height:1.5;color:var(--ink-2);max-width:62ch;}
.bb .bb-sent svg{width:18px;height:18px;color:var(--indigo);flex:none;margin-top:1px;stroke-width:2;}
.bb .bb-sent b{color:var(--ink);font-weight:800;}
.bb .bb-sent a{color:var(--indigo);font-weight:800;text-decoration:underline;text-underline-offset:2px;}
.bb .bb-sent a:hover{color:var(--fuchsia);}
.bb .bb-sent.bb-gate svg{color:var(--fuchsia);}
.bb .bb-actions{display:flex;gap:10px;flex:none;}
.bb .bb-secondary:disabled{opacity:.6;cursor:default;}
.bb .bb-secondary{border:1.5px solid var(--line-2);background:var(--page);color:var(--indigo);border-radius:10px;font-size:14.5px;font-weight:800;padding:13px 20px;}
.bb .bb-secondary:hover{border-color:var(--indigo);background:var(--wash);}
.bb .bb-primary{border:none;border-radius:10px;background:var(--grad);color:#fff;font-size:14.5px;font-weight:800;padding:14px 22px;box-shadow:0 12px 26px -12px rgba(109,90,224,.6);}
@media (max-width:640px){.bb .bb-grid{grid-template-columns:1fr;}.bb .bb-h1{font-size:27px;}.bb .bb-foot{flex-direction:column;align-items:stretch;}.bb .bb-actions{flex-wrap:wrap;}.bb .bb-primary,.bb .bb-secondary{flex:1 1 auto;}}
`
