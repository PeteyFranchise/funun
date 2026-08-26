// ─── Vendor Health — live, read-only credential probes (260826-2qm) ───────
// Exists because Vercel secrets are write-only: once a value is saved, the
// settings screen shows only that it IS set, never what it holds. On
// 2026-08-26 that blind spot let RESEND_FROM_EMAIL hold the Resend API KEY
// value instead of a sender address in production — invites silently
// stopped sending, and the settings UI looked perfectly healthy the whole
// time. The only way anyone found it was a throwaway diagnostic endpoint.
// This module is that check made permanent: one live probe per vendor,
// each resolving to exactly one of three states (ok / failed /
// not-configured), run from the IT room whenever staff want an answer.
//
// THE SINGLE HARDEST RULE IN THIS FILE: a credential value never leaves
// it. `safeSenderDisplay` is the ONE audited exception — see its own
// comment below for why a sender address is different from every other
// credential here. Every other function in this module must never return,
// embed, or log a raw env value.

// ─── Constants ──────────────────────────────────────────────────────────

// Deliberately larger than SUPABASE_CHECK_TIMEOUT_MS (app/api/health
// /constants.ts, 2000ms) — these are third-party round-trips over the
// public internet, not a local DB read, so they get more budget.
export const VENDOR_PROBE_TIMEOUT_MS = 5000

// ─── Types ──────────────────────────────────────────────────────────────

export type VendorHealthState = 'ok' | 'failed' | 'not-configured'

export type CredentialClass = 'present' | 'missing' | 'placeholder'

export type VendorProbeResult = {
  id: string
  label: string
  envVar: string
  state: VendorHealthState
  detail: string
  durationMs: number
}

export type VendorHealthSummary = {
  ok: number
  failed: number
  notConfigured: number
  allOk: boolean
  checkedAt: string
}

// ─── Pure verdict logic ─────────────────────────────────────────────────

const PLACEHOLDER_MARKERS = [
  'placeholder',
  'your_',
  'your-',
  'changeme',
  'change_me',
  'todo',
  'example',
  'dummy',
  'xxxx',
  '<',
  '>',
]

/**
 * Classifies a raw env value without ever returning it. Trims first so
 * whitespace-only values count as missing, then checks for common
 * placeholder markers before falling through to "present".
 */
export function classifyCredential(raw: string | undefined): CredentialClass {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return 'missing'
  const lowered = trimmed.toLowerCase()
  if (PLACEHOLDER_MARKERS.some(marker => lowered.includes(marker))) return 'placeholder'
  return 'present'
}

/**
 * Maps a numeric HTTP status to ok/failed. The status code is the ENTIRE
 * signal — the vendor's response body is deliberately never read here,
 * because several vendor APIs echo the submitted credential back in an
 * error payload, and reading that body would reintroduce the exact leak
 * this page exists to prevent.
 */
export function verdictFromHttpStatus(status: number): 'ok' | 'failed' {
  return status >= 200 && status < 300 ? 'ok' : 'failed'
}

// Conservative single-@ shape check: a non-empty local part, a domain with
// at least one dot, and no whitespace anywhere. Intentionally not
// RFC-5322-complete — this only needs to separate "looks like an address"
// from "looks like an API key", not validate deliverability.
const EMAIL_SHAPE_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isEmailShaped(value: string): boolean {
  return EMAIL_SHAPE_RE.test(value)
}

// The prefix Resend stamps on every API key it issues (console.resend.com).
// A value beginning with this is structurally a key, never a sender
// address, and is exactly the shape of the 2026-08-26 outage.
const RESEND_KEY_PREFIX = 're_'

/**
 * The SINGLE audited chokepoint in this module permitted to return an
 * environment variable's value — and only after that value passes
 * isEmailShaped AND does not begin with the Resend key prefix. A sender
 * address is printed in the header of every outbound email Funūn sends,
 * so it is already public by construction; a key-shaped value is not, and
 * the shape gate above structurally excludes one from ever reaching a
 * render. No other function in this module may return an env value —
 * that is the whole point of naming this one explicitly.
 */
export function safeSenderDisplay(raw: string | undefined): string | null {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return null
  if (!isEmailShaped(trimmed)) return null
  if (trimmed.toLowerCase().startsWith(RESEND_KEY_PREFIX)) return null
  return trimmed
}

/**
 * Builds a sender-row VendorProbeResult with no network call. Distinguishes
 * an unset optional sender (not-configured — a normal state) from a value
 * that IS set but wrong-shaped or key-shaped (failed — this is the
 * 2026-08-26 failure mode made visible).
 */
export function checkSenderAddress(
  raw: string | undefined,
  envVar: string,
  label: string
): VendorProbeResult {
  const trimmed = (raw ?? '').trim()

  if (!trimmed) {
    return {
      id: envVar.toLowerCase(),
      label,
      envVar,
      state: 'not-configured',
      detail: 'Not set — email from this sender is disabled until it is configured.',
      durationMs: 0,
    }
  }

  if (trimmed.toLowerCase().startsWith(RESEND_KEY_PREFIX)) {
    return {
      id: envVar.toLowerCase(),
      label,
      envVar,
      state: 'failed',
      detail:
        `${envVar} holds an API key rather than a sender address — this is the exact ` +
        'failure that caused the 2026-08-26 email outage. Replace it with a verified sender address.',
      durationMs: 0,
    }
  }

  const display = safeSenderDisplay(trimmed)
  if (!display) {
    return {
      id: envVar.toLowerCase(),
      label,
      envVar,
      state: 'failed',
      detail: `${envVar} is set but is not shaped like an email address.`,
      durationMs: 0,
    }
  }

  return {
    id: envVar.toLowerCase(),
    label,
    envVar,
    state: 'ok',
    detail: display,
    durationMs: 0,
  }
}

/**
 * Folds a result array into a summary. `not-configured` rows never flip
 * `allOk` false — an unset optional sender is a normal state, not an
 * outage, and treating it as one would train staff to ignore the page.
 */
export function summarizeVendorHealth(results: VendorProbeResult[]): VendorHealthSummary {
  let ok = 0
  let failed = 0
  let notConfigured = 0
  for (const result of results) {
    if (result.state === 'ok') ok++
    else if (result.state === 'failed') failed++
    else notConfigured++
  }
  return {
    ok,
    failed,
    notConfigured,
    allOk: failed === 0,
    checkedAt: new Date().toISOString(),
  }
}

// ─── Network layer — bounded, concurrent, read-only probes (Task 2) ──────
// Everything below this line performs I/O. Every outbound call is GET-only,
// sets a no-store cache directive, and is raced against a hard timeout so
// one hung vendor can only ever cost one bounded wait, never the whole page.

import { DOCUSEAL_API_BASE } from '@/lib/esign/docuseal'
import { getDashboardHealth } from '@/lib/playbook/digest'

/**
 * Belt-and-suspenders timeout, mirroring app/api/health/route.ts exactly:
 * an AbortController passed as `signal` is the primary mechanism, raced
 * against a plain timer promise so the call provably settles within
 * VENDOR_PROBE_TIMEOUT_MS even if a given transport or test mock never
 * observes the abort signal. The timer is always cleared.
 */
async function boundedFetch(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController()
  let timeoutId: ReturnType<typeof setTimeout>
  const timeoutPromise = new Promise<Response>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort()
      reject(new Error('vendor probe timed out'))
    }, VENDOR_PROBE_TIMEOUT_MS)
  })

  try {
    return await Promise.race([
      fetch(url, {
        ...init,
        signal: controller.signal,
        // Next.js patches `fetch` inside route handlers and Server
        // Components and caches by default — without this opt-out a
        // health page would confidently render a cached verdict from a
        // previous request, which is worse than showing nothing.
        cache: 'no-store',
      }),
      timeoutPromise,
    ])
  } finally {
    clearTimeout(timeoutId!)
  }
}

type ProbeCredentialedArgs = {
  id: string
  label: string
  envVar: string
  url: string
  headers: Record<string, string>
  /**
   * Extracts a short non-secret summary from a 2xx response body. Runs
   * inside its own try/catch — a parse failure never fails the whole
   * probe, it just falls back to a generic ok detail.
   */
  readDetail: (body: unknown) => string
}

/**
 * Shared shape for every credentialed vendor probe: reads the env var,
 * short-circuits to not-configured BEFORE any network call when the
 * credential is missing or placeholder-shaped, otherwise times a
 * boundedFetch and maps the status through verdictFromHttpStatus. Can
 * never throw — any exception (network failure, abort, unexpected shape)
 * becomes a `failed` result with a fixed generic detail built from the
 * numeric status and prose only. The vendor's response body is NEVER read
 * on a failure path, because several vendor APIs echo the submitted
 * credential back in an error payload.
 */
async function probeCredentialed(args: ProbeCredentialedArgs): Promise<VendorProbeResult> {
  const { id, label, envVar, url, headers, readDetail } = args
  const raw = process.env[envVar]
  const startedAt = Date.now()

  const credentialClass = classifyCredential(raw)
  if (credentialClass !== 'present') {
    return {
      id,
      label,
      envVar,
      state: 'not-configured',
      detail:
        credentialClass === 'placeholder'
          ? `${envVar} looks like a placeholder value — not checked.`
          : `${envVar} is not set — this vendor is not checked.`,
      durationMs: 0,
    }
  }

  try {
    const response = await boundedFetch(url, { method: 'GET', headers })
    const verdict = verdictFromHttpStatus(response.status)
    const durationMs = Date.now() - startedAt

    if (verdict === 'failed') {
      // Fixed prose + the numeric status only — the body is never read here.
      return {
        id,
        label,
        envVar,
        state: 'failed',
        detail: `Request failed with HTTP ${response.status}.`,
        durationMs,
      }
    }

    let detail = 'ok'
    try {
      const body = await response.json()
      detail = readDetail(body)
    } catch {
      detail = 'ok (response could not be summarized)'
    }

    return { id, label, envVar, state: 'ok', detail, durationMs }
  } catch {
    // Timeout, network failure, or any unexpected error — never throw.
    return {
      id,
      label,
      envVar,
      state: 'failed',
      detail: 'Request did not complete (network error or timeout).',
      durationMs: Date.now() - startedAt,
    }
  }
}

// ─── Individual vendor probes ──────────────────────────────────────────

/**
 * FREE: GET /domains lists domains already configured on the Resend
 * account — no email is sent and nothing is created. Detail reads only
 * the `name` and `status` fields, which are public DNS records, not
 * secrets.
 */
async function probeResend(): Promise<VendorProbeResult> {
  return probeCredentialed({
    id: 'resend',
    label: 'Resend',
    envVar: 'RESEND_API_KEY',
    url: 'https://api.resend.com/domains',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY ?? ''}` },
    readDetail: (body) => {
      const data = (body as { data?: { name?: string; status?: string }[] })?.data ?? []
      if (data.length === 0) return '0 domains configured'
      const names = data.map(d => `${d.name ?? '?'} (${d.status ?? '?'})`).join(', ')
      return `${data.length} domain(s): ${names}`
    },
  })
}

/**
 * FREE: GET /templates?limit=5 lists existing templates — DocuSeal bills
 * only on a COMPLETED document, so a templates listing never bills.
 * NEVER turn this into a call that creates a template or a submission —
 * a submission can mint real signature invites to real collaborators.
 */
async function probeDocuseal(): Promise<VendorProbeResult> {
  return probeCredentialed({
    id: 'docuseal',
    label: 'DocuSeal',
    envVar: 'DOCUSEAL_API_KEY',
    url: `${DOCUSEAL_API_BASE}/templates?limit=5`,
    headers: { 'X-Auth-Token': process.env.DOCUSEAL_API_KEY ?? '' },
    readDetail: (body) => {
      const data = (body as { data?: unknown[] })?.data
      const count = Array.isArray(data) ? data.length : Array.isArray(body) ? (body as unknown[]).length : 0
      return `${count} template(s) visible`
    },
  })
}

/**
 * FREE: GET /v1/models lists available models — consumes no tokens. NEVER
 * turn this into a message-completion call, which would bill on every
 * page view.
 */
async function probeAnthropic(): Promise<VendorProbeResult> {
  return probeCredentialed({
    id: 'anthropic',
    label: 'Anthropic',
    envVar: 'ANTHROPIC_API_KEY',
    url: 'https://api.anthropic.com/v1/models',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
      'anthropic-version': '2023-06-01',
    },
    readDetail: (body) => {
      const data = (body as { data?: unknown[] })?.data ?? []
      return `${Array.isArray(data) ? data.length : 0} model(s) visible`
    },
  })
}

/**
 * FREE: GET /v1/balance is a read of the account's current balance — it
 * creates nothing and has no side effects. Detail reads only the
 * `livemode` boolean, never a balance amount.
 */
async function probeStripe(): Promise<VendorProbeResult> {
  return probeCredentialed({
    id: 'stripe',
    label: 'Stripe',
    envVar: 'STRIPE_SECRET_KEY',
    url: 'https://api.stripe.com/v1/balance',
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY ?? ''}` },
    readDetail: (body) => {
      const livemode = (body as { livemode?: boolean })?.livemode
      return livemode === true ? 'live mode' : livemode === false ? 'test mode' : 'ok'
    },
  })
}

/**
 * Delegates to getDashboardHealth() (lib/playbook/digest.ts), which
 * already re-checks /api/health in-process (never a self-HTTP call) and is
 * already bounded by SUPABASE_CHECK_TIMEOUT_MS. This module defines no new
 * Supabase query — /api/health remains the single owner of that read.
 */
async function probeSupabase(): Promise<VendorProbeResult> {
  const startedAt = Date.now()
  const status = await getDashboardHealth()
  const durationMs = Date.now() - startedAt
  const stateMap: Record<typeof status, VendorHealthState> = {
    healthy: 'ok',
    degraded: 'failed',
    unknown: 'failed',
  }
  const detailMap: Record<typeof status, string> = {
    healthy: 'Healthy',
    degraded: 'Degraded — see /api/health',
    unknown: 'Could not be reached',
  }
  return {
    id: 'supabase',
    label: 'Supabase',
    envVar: 'SUPABASE_SERVICE_ROLE_KEY',
    state: stateMap[status],
    detail: detailMap[status],
    durationMs,
  }
}

// Deliberately NOT probed: DOCUSEAL_WEBHOOK_SECRET, RESEND_WEBHOOK_SECRET,
// STRIPE_WEBHOOK_SECRET, CRON_SECRET. A shared secret has no read-only
// verification endpoint — the only honest verdict available is "a value
// is set", and a page that prints a green tick next to a WRONG webhook
// secret is worse than one that stays silent about it.

/**
 * Fires every probe concurrently and folds the results through
 * summarizeVendorHealth. Row order puts site-critical vendors first:
 * Supabase, Resend, the Resend sender, DocuSeal, Anthropic, Stripe, then
 * the two optional senders.
 */
export async function runVendorHealthChecks(): Promise<{
  results: VendorProbeResult[]
  summary: VendorHealthSummary
}> {
  const [supabase, resend, resendSender, docuseal, anthropic, stripe, esignSender, pitchSender] =
    await Promise.all([
      probeSupabase(),
      probeResend(),
      Promise.resolve(
        checkSenderAddress(process.env.RESEND_FROM_EMAIL, 'RESEND_FROM_EMAIL', 'Resend sender')
      ),
      probeDocuseal(),
      probeAnthropic(),
      probeStripe(),
      // ESIGN_FROM_EMAIL / PITCH_FROM_EMAIL are optional overrides —
      // lib/email/index.ts no-ops rather than falling back to
      // RESEND_FROM_EMAIL when an override is explicitly passed, so unset
      // is not-configured here, never failed.
      Promise.resolve(
        checkSenderAddress(process.env.ESIGN_FROM_EMAIL, 'ESIGN_FROM_EMAIL', 'E-sign sender')
      ),
      Promise.resolve(
        checkSenderAddress(process.env.PITCH_FROM_EMAIL, 'PITCH_FROM_EMAIL', 'Pitch sender')
      ),
    ])

  const results = [supabase, resend, resendSender, docuseal, anthropic, stripe, esignSender, pitchSender]
  return { results, summary: summarizeVendorHealth(results) }
}
