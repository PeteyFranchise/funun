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
