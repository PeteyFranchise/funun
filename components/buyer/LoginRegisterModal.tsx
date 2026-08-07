'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { postSignInPath } from '@/lib/auth/postSignInPath'
import { buildRegisterPayload, type RegisterSource } from '@/lib/buyers/register'

// ─── LoginRegisterModal (23-07 Task 1) ─────────────────────────────────────
// The Funūn light `.fnbl` Login/Register modal — mirrors the Marmoset
// reference (Login title, email/password, remember-me, gradient Submit,
// forgot-password, divider, Register CTA), opened over the public browse
// via the same scrim/modal chrome idiom already used by
// CatalogBrowserLight's License modal (`.scrim`/`.modal`/`.mh`/`.mb2`/`.x`/
// `.err`/`.fld`/`.f2` — reused verbatim below, not reinvented). Fully
// self-contained so it can be mounted standalone (the /sync landing page,
// 23-07 Task 3) or nested inside CatalogBrowserLight (23-07 Task 2).
//
// Two Register doors, one pipeline (RESEARCH Open Question #4 / locked
// directive 6): "Register" and "Talk to a sales rep" render the identical
// form and POST to the identical /api/sync/register endpoint — only the
// framing copy and the `source` discriminant differ. Login authenticates via
// signInWithPassword (23-05 wired real password auth for buyers) and routes
// through postSignInPath's role-aware, open-redirect-safe resolver.

const REMEMBER_EMAIL_KEY = 'funun_sync_remember_email'

// T-23-23 — a login failure must never reveal whether an account exists for
// the entered email. Always show this fixed, generic message regardless of
// the underlying Supabase Auth error.
const GENERIC_LOGIN_ERROR = 'Invalid email or password. Please try again.'

const USE_CASE_OPTIONS: { value: string; label: string }[] = [
  { value: 'agency', label: 'Ad agency' },
  { value: 'film_tv', label: 'Film / TV production' },
  { value: 'brand', label: 'Brand / in-house marketing' },
  { value: 'other', label: 'Other' },
]

type Tab = 'login' | 'register'

export type LoginRegisterModalProps = {
  open: boolean
  onClose: () => void
  initialTab?: Tab
}

export function LoginRegisterModal({ open, onClose, initialTab = 'login' }: LoginRegisterModalProps) {
  const router = useRouter()

  const [tab, setTab] = useState<Tab>(initialTab)
  const [source, setSource] = useState<RegisterSource>('register')

  // ── Login state ──
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [loginSubmitting, setLoginSubmitting] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)

  // ── Register state ──
  const [company, setCompany] = useState('')
  const [contactName, setContactName] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState('')
  const [useCase, setUseCase] = useState('')
  const [registerSubmitting, setRegisterSubmitting] = useState(false)
  const [registerError, setRegisterError] = useState<string | null>(null)
  const [registerSuccess, setRegisterSuccess] = useState(false)

  // Reset transient state and re-apply initialTab every time the modal opens
  // (not on every render) so a stale error/success state never leaks into a
  // fresh open, and remember-me can prefill the last-used email.
  useEffect(() => {
    if (!open) return
    setTab(initialTab)
    setSource('register')
    setLoginError(null)
    setRegisterError(null)
    setRegisterSuccess(false)
    try {
      const saved = window.localStorage.getItem(REMEMBER_EMAIL_KEY)
      if (saved) {
        setLoginEmail(saved)
        setRemember(true)
      }
    } catch {
      // localStorage unavailable (private mode, etc.) — remember-me is a
      // pure UX affordance, never required for login to function.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialTab])

  if (!open) return null

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoginSubmitting(true)
    setLoginError(null)

    const supabase = createClient()
    const { data, error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: loginPassword,
    })

    setLoginSubmitting(false)
    if (error || !data.user) {
      setLoginError(GENERIC_LOGIN_ERROR)
      return
    }

    try {
      if (remember) window.localStorage.setItem(REMEMBER_EMAIL_KEY, loginEmail)
      else window.localStorage.removeItem(REMEMBER_EMAIL_KEY)
    } catch {
      // best-effort only
    }

    const destination = postSignInPath({ user: data.user, next: null })
    onClose()
    router.push(destination)
    router.refresh()
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()

    const result = buildRegisterPayload({
      company,
      contactName,
      email: regEmail,
      phone,
      role,
      useCase,
      source,
    })
    if (!result.ok) {
      setRegisterError(result.error)
      return
    }

    setRegisterSubmitting(true)
    setRegisterError(null)
    try {
      const res = await fetch('/api/sync/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result.body),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setRegisterError(json.error ?? 'Something went wrong. Please try again.')
        return
      }
      setRegisterSuccess(true)
    } finally {
      setRegisterSubmitting(false)
    }
  }

  const headerTitle =
    tab === 'login' ? 'Login' : source === 'sales_rep' ? 'Talk to a sales rep' : 'Create your account'
  const headerSubtitle =
    tab === 'login'
      ? 'Sign in to your Funūn Sync account.'
      : source === 'sales_rep'
        ? "Same quick form — we'll route you to a real conversation."
        : 'Company, contact, and a little context — takes under a minute.'

  return (
    <div className="scrim open" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <style>{LR_CSS}</style>
        <div className="mh">
          <div>
            <div className="lr-brand" aria-label="Funūn">
              <span className="lr-wordmark gtext">
                <span>FUN</span>
                <NuunGlyph />
                <span>N</span>
              </span>
            </div>
            <h2>{headerTitle}</h2>
            <p>{headerSubtitle}</p>
          </div>
          <button className="x" type="button" aria-label="Close" onClick={onClose}>
            <svg className="icn" viewBox="0 0 24 24">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="mb2">
          <div className="lr-tabs" role="tablist">
            <button
              className={`lr-tab ${tab === 'login' ? 'on' : ''}`}
              type="button"
              role="tab"
              aria-selected={tab === 'login'}
              onClick={() => setTab('login')}
            >
              Login
            </button>
            <button
              className={`lr-tab ${tab === 'register' ? 'on' : ''}`}
              type="button"
              role="tab"
              aria-selected={tab === 'register'}
              onClick={() => setTab('register')}
            >
              Register
            </button>
          </div>

          {tab === 'login' ? (
            <form onSubmit={handleLogin}>
              <div className="fld">
                <label htmlFor="lr-login-email">Email</label>
                <input
                  id="lr-login-email"
                  type="email"
                  value={loginEmail}
                  onChange={e => setLoginEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="you@company.com"
                />
              </div>
              <div className="fld">
                <label htmlFor="lr-login-password">Password</label>
                <input
                  id="lr-login-password"
                  type="password"
                  value={loginPassword}
                  onChange={e => setLoginPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                />
              </div>
              <div className="lr-remember">
                <label htmlFor="lr-remember-me">
                  <input
                    id="lr-remember-me"
                    type="checkbox"
                    checked={remember}
                    onChange={e => setRemember(e.target.checked)}
                  />
                  Remember me
                </label>
                <a href="/forgot-password">Forgot password?</a>
              </div>

              {loginError && <p className="err">{loginError}</p>}

              <button className="lr-submit" type="submit" disabled={loginSubmitting}>
                {loginSubmitting ? 'Signing in…' : 'Login'}
              </button>

              <div className="lr-divider">or</div>
              <p className="lr-switch">
                New to Funūn Sync?{' '}
                <button type="button" onClick={() => setTab('register')}>
                  Register
                </button>
              </p>
            </form>
          ) : registerSuccess ? (
            <div className="lr-confirm">
              <h3>You&rsquo;re in.</h3>
              <p>
                Your Funūn Sync account has been created and is being set up. A member of our
                team will be in touch to help you finish onboarding — keep an eye on your inbox,
                and check back here any time.
              </p>
              <button type="button" onClick={onClose}>
                Close
              </button>
            </div>
          ) : (
            <form onSubmit={handleRegister}>
              <div className="lr-doors" role="tablist">
                <button
                  type="button"
                  className={`lr-door ${source === 'register' ? 'on' : ''}`}
                  onClick={() => setSource('register')}
                >
                  Register
                </button>
                <button
                  type="button"
                  className={`lr-door ${source === 'sales_rep' ? 'on' : ''}`}
                  onClick={() => setSource('sales_rep')}
                >
                  Talk to a sales rep
                </button>
              </div>

              <div className="fld">
                <label htmlFor="lr-company">Company</label>
                <input
                  id="lr-company"
                  type="text"
                  value={company}
                  onChange={e => setCompany(e.target.value)}
                  required
                  placeholder="Company name"
                />
              </div>
              <div className="f2">
                <div className="fld">
                  <label htmlFor="lr-contact-name">Contact name</label>
                  <input
                    id="lr-contact-name"
                    type="text"
                    value={contactName}
                    onChange={e => setContactName(e.target.value)}
                    required
                    autoComplete="name"
                    placeholder="Full name"
                  />
                </div>
                <div className="fld">
                  <label htmlFor="lr-role">Your role</label>
                  <input
                    id="lr-role"
                    type="text"
                    value={role}
                    onChange={e => setRole(e.target.value)}
                    placeholder="e.g. Music supervisor"
                  />
                </div>
              </div>
              <div className="f2">
                <div className="fld">
                  <label htmlFor="lr-reg-email">Work email</label>
                  <input
                    id="lr-reg-email"
                    type="email"
                    value={regEmail}
                    onChange={e => setRegEmail(e.target.value)}
                    required
                    autoComplete="email"
                    placeholder="you@company.com"
                  />
                </div>
                <div className="fld">
                  <label htmlFor="lr-phone">Phone</label>
                  <input
                    id="lr-phone"
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    required
                    autoComplete="tel"
                    placeholder="(555) 555-5555"
                  />
                </div>
              </div>
              <div className="fld">
                <label htmlFor="lr-use-case">Use case</label>
                <select id="lr-use-case" value={useCase} onChange={e => setUseCase(e.target.value)}>
                  <option value="">Select a use case</option>
                  {USE_CASE_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              {registerError && <p className="err">{registerError}</p>}

              <button className="lr-submit" type="submit" disabled={registerSubmitting}>
                {registerSubmitting
                  ? 'Submitting…'
                  : source === 'sales_rep'
                    ? 'Request a call'
                    : 'Create account'}
              </button>

              <div className="lr-divider">or</div>
              <p className="lr-switch">
                Already have an account?{' '}
                <button type="button" onClick={() => setTab('login')}>
                  Login
                </button>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

// Duplicated from app/sync/page.tsx's landing wordmark (one of the 5 logo
// explorations, "hidden Nūn" option A) so the modal carries the same brand
// identity wherever it is mounted, without requiring the landing page's
// module (which is not otherwise safe to import into a client component
// tree without pulling in its server-only catalogue fixture usage).
function NuunGlyph() {
  return (
    <span className="lr-nuun" aria-hidden="true">
      <svg width="0.76em" height="0.98em" viewBox="-2 -34 104 134" style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <linearGradient id="lrNuunDot" x1="0" y1="0" x2="1" y2="1">
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
          fill="url(#lrNuunDot)"
        />
        <path
          d="M 8.5 24 L 8.5 70 C 8.5 92, 26 96.5, 50 96.5 C 74 96.5, 91.5 92, 91.5 70 L 91.5 11 L 85 7 L 64.5 31 L 64.5 69 C 64.5 80, 35.5 80, 35.5 69 L 35.5 34 Z"
          fill="currentColor"
        />
      </svg>
    </span>
  )
}

// The scrim/modal/mh/mb2/x/err/fld/f2 rules below are reused VERBATIM from
// CatalogBrowserLight's private CSS constant (not re-exported anywhere, so
// duplicated here rather than invented) — this keeps the two modals
// pixel-identical in chrome. Everything under the `lr-` prefix is net-new,
// scoped narrowly to this component's own tab/door/remember-me/divider
// additions, per the plan's "small tab/field additions only" instruction.
const LR_CSS = `
.fnbl .scrim{position:fixed;inset:0;background:rgba(36,26,77,.42);backdrop-filter:blur(3px);z-index:90;display:none;align-items:flex-start;justify-content:center;padding:30px;overflow-y:auto;}
.fnbl .scrim.open{display:flex;}
.fnbl .modal{background:#fff;border-radius:20px;width:100%;max-width:640px;box-shadow:0 50px 110px -30px rgba(36,26,77,.55);overflow:hidden;margin:auto;max-height:calc(100vh - 60px);display:flex;flex-direction:column;}
.fnbl .modal .mh{padding:30px 34px 22px;border-bottom:1px solid var(--line);display:flex;align-items:flex-start;gap:18px;flex:none;}
.fnbl .modal .mh h2{margin:0;font-size:23px;font-weight:800;}
.fnbl .modal .mh p{margin:6px 0 0;font-size:15px;color:var(--ink-2);}
.fnbl .modal .mh .x{margin-left:auto;background:none;border:none;color:var(--ink-3);padding:4px;}
.fnbl .modal .mh .x svg{width:22px;height:22px;stroke-width:2.4;}
.fnbl .modal .mb2{padding:26px 34px 30px;overflow-y:auto;flex:1;min-height:0;}
.fnbl .fld{margin-bottom:18px;}
.fnbl .fld label{display:block;font-size:11px;letter-spacing:.15em;text-transform:uppercase;font-weight:800;color:var(--ink-3);margin-bottom:8px;}
.fnbl .fld input,.fnbl .fld select,.fnbl .fld textarea{width:100%;border:1.5px solid var(--line-2);border-radius:10px;padding:13px 14px;font:500 15px 'Inter',system-ui,sans-serif;color:var(--ink);background:#fff;outline:none;}
.fnbl .fld input:focus,.fnbl .fld select:focus,.fnbl .fld textarea:focus{border-color:var(--indigo);box-shadow:0 0 0 3px rgba(109,90,224,.16);}
.fnbl .f2{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
.fnbl .err{color:var(--req-fg);font-size:13.5px;font-weight:600;margin:0 0 14px;}
.fnbl .lr-brand{margin-bottom:10px;}
.fnbl .lr-wordmark{display:inline-flex;align-items:baseline;gap:1px;font-size:15px;font-weight:900;letter-spacing:-.01em;}
.fnbl .lr-nuun{display:inline-flex;align-items:baseline;}
.fnbl .lr-tabs{display:flex;gap:6px;background:var(--wash);border-radius:999px;padding:4px;margin-bottom:22px;}
.fnbl .lr-tab{flex:1;border:none;background:none;border-radius:999px;padding:11px 14px;font-size:13px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--indigo);}
.fnbl .lr-tab.on{background:var(--grad);color:#fff;box-shadow:0 8px 18px -8px rgba(109,90,224,.5);}
.fnbl .lr-doors{display:flex;gap:8px;margin-bottom:20px;}
.fnbl .lr-door{flex:1;border:1.5px solid var(--line-2);background:#fff;border-radius:10px;padding:10px 12px;font-size:12.5px;font-weight:700;color:var(--indigo);}
.fnbl .lr-door.on{background:var(--grad);border-color:transparent;color:#fff;}
.fnbl .lr-remember{display:flex;align-items:center;justify-content:space-between;margin:-6px 0 18px;font-size:13.5px;color:var(--ink-2);flex-wrap:wrap;gap:8px;}
.fnbl .lr-remember label{display:flex;align-items:center;gap:8px;font-weight:600;color:var(--ink-2);text-transform:none;letter-spacing:normal;}
.fnbl .lr-remember input{width:16px;height:16px;accent-color:var(--indigo);}
.fnbl .lr-remember a{color:var(--indigo);font-weight:700;text-decoration:none;}
.fnbl .lr-remember a:hover{text-decoration:underline;}
.fnbl .lr-submit{width:100%;border:none;border-radius:10px;background:var(--grad);color:#fff;font-size:15px;font-weight:800;padding:15px;box-shadow:0 12px 28px -12px rgba(109,90,224,.6);}
.fnbl .lr-submit:disabled{opacity:.6;cursor:not-allowed;}
.fnbl .lr-divider{display:flex;align-items:center;gap:12px;margin:22px 0 14px;color:var(--ink-3);font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;}
.fnbl .lr-divider::before,.fnbl .lr-divider::after{content:"";flex:1;height:1px;background:var(--line);}
.fnbl .lr-switch{text-align:center;font-size:14px;color:var(--ink-2);margin:0;}
.fnbl .lr-switch button{background:none;border:none;color:var(--indigo);font-weight:800;padding:0;}
.fnbl .lr-switch button:hover{color:var(--fuchsia);}
.fnbl .lr-confirm{text-align:center;padding:20px 0 8px;}
.fnbl .lr-confirm h3{margin:0 0 10px;font-size:18px;font-weight:800;color:var(--ink);}
.fnbl .lr-confirm p{margin:0;font-size:14.5px;line-height:1.6;color:var(--ink-2);}
.fnbl .lr-confirm button{margin-top:22px;border:1.5px solid var(--line-2);background:#fff;border-radius:10px;color:var(--indigo);font-size:14.5px;font-weight:700;padding:12px 22px;}
@media (max-width:640px){
  .fnbl .f2{grid-template-columns:1fr;}
}
`
