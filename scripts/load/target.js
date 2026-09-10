'use strict'

// ─── scripts/load/target.js — production-hostname guard (R7 / D-11) ──────
// Phase 32 plan 09, Task 2. Resolves the k6 harness's target base URL from
// an env var and REFUSES to return a production hostname — the harness
// must never be pointed at funun.studio (or any funun.studio subdomain) by
// default; a production run requires separate written owner authorization
// that is entirely outside this tool's scope (SPEC prohibition row: "MUST
// NOT run the initial (or any) load test against production without
// separate written owner authorization").
//
// This file is the single most safety-critical file in the plan: its
// failure mode is not "a wrong number in a report", it is "a 500-VU load
// test against live production". It is therefore written to FAIL CLOSED —
// every input that cannot be positively parsed and positively shown to be
// non-production throws, rather than being passed through.
//
// Deliberately dependency-free (no `URL` global, no npm package) so this
// file is loadable identically from two very different runtimes:
//   1. k6's JS VM, via `require('./target.js')` in run-ramp.js — k6 supports
//      CommonJS `require`/`module.exports` natively alongside its built-in
//      ES-module imports (`import http from 'k6/http'`), per k6's documented
//      module system.
//   2. Plain Node — which is how scripts/load/target.test.ts exercises every
//      branch below WITHOUT installing k6 or touching a live target.
// CommonJS (`module.exports`, not `export`) is what makes both true at
// once — a plain `.js` file with no `"type": "module"` in package.json is
// parsed as CommonJS by Node by default, and k6 accepts CommonJS for local
// (non-`k6/*`) files without any transpile step on our side.

// Only funun.studio itself and any funun.studio subdomain (www., app., a
// future api., etc.) are treated as production. Non-prod targets are
// Vercel Preview URLs (`*.vercel.app`) or a local/staging host — neither of
// which can ever match this list, so there is no allowlist to keep in sync.
const PRODUCTION_HOSTNAMES = ['funun.studio']

// The single env var this harness reads for its target. k6 exposes env vars
// via the `__ENV` global (set with `k6 run -e K6_TARGET_URL=... `); plain
// Node exposes them via `process.env`. Neither global exists in the other
// runtime, so both are probed defensively.
const TARGET_ENV_VAR = 'K6_TARGET_URL'

// Only these two schemes can generate HTTP load. Anything else (file:,
// javascript:, data:, ftp:, a bare hostname with no scheme at all) is
// unparseable-as-a-target and is refused rather than guessed at.
const ALLOWED_SCHEMES = ['http', 'https']

// ─── hostname extraction ────────────────────────────────────────────────
// Minimal absolute-URL hostname extraction — intentionally NOT using the
// `URL` global. k6's JS VM (goja-based) has historically lagged behind
// Node's `URL` support, and this file must behave identically in both
// runtimes; a hand-rolled, explicitly-tested parser removes that variable.
//
// Returns the lowercased, trailing-dot-normalized host (no port, no
// userinfo), or '' for anything that is not a plausible absolute http(s)
// URL. resolveTarget() turns '' into a thrown error — never a silent pass.
//
// The bypass classes this is written against, each covered by a test in
// scripts/load/target.test.ts:
//   - case variation            HTTPS://WWW.FUNUN.STUDIO
//   - trailing dot (FQDN form)  https://funun.studio./     <- resolves to prod
//   - userinfo confusion        https://staging.example@funun.studio
//   - suffix lookalike          https://funun.studio.evil.com   (NOT prod)
//   - prefix lookalike          https://notfunun.studio         (NOT prod)
//   - path/query/fragment bait  https://funun.studio/@evil.example
//   - IP literals               http://203.0.113.10  (host check cannot apply)
//   - no scheme                 funun.studio
function extractHostname(rawUrl) {
  const value = String(rawUrl == null ? '' : rawUrl).trim()

  // scheme://authority, where the authority ends at the first / ? or #.
  // Terminating on / ? # BEFORE any userinfo handling is what makes
  // `https://funun.studio/@evil.example` resolve to funun.studio (correct)
  // rather than evil.example.
  const match = value.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/([^/?#]*)/)
  if (!match) return ''

  const scheme = match[1].toLowerCase()
  if (ALLOWED_SCHEMES.indexOf(scheme) === -1) return ''

  let authority = match[2]
  if (!authority) return ''

  // Strip userinfo. The LAST '@' wins, matching RFC 3986 / browser
  // behaviour: in `https://a@b@funun.studio` the real host is funun.studio.
  const at = authority.lastIndexOf('@')
  if (at !== -1) authority = authority.slice(at + 1)
  if (!authority) return ''

  // Split host from port. A bracketed IPv6 literal keeps its brackets and
  // must not have its internal colons treated as a port separator.
  let host
  if (authority.charAt(0) === '[') {
    const close = authority.indexOf(']')
    if (close === -1) return ''
    host = authority.slice(0, close + 1)
  } else {
    host = authority.replace(/:\d*$/, '')
  }

  host = host.trim().toLowerCase()
  if (!host) return ''

  // Embedded whitespace or a backslash means this is not a hostname we can
  // reason about — refuse rather than normalize something ambiguous.
  if (/[\s\\]/.test(host)) return ''

  // Normalize the trailing-dot FQDN form: `funun.studio.` and
  // `funun.studio` are the SAME host to DNS and to every HTTP client, so
  // they must be the same host to this guard. Without this line,
  // `https://funun.studio./` is a complete bypass of the production check.
  host = host.replace(/\.+$/, '')
  if (!host) return ''

  return host
}

// Exact match OR any subdomain (`www.funun.studio`, `app.funun.studio`,
// ...) counts as production — a suffix check anchored on a leading dot
// so `notfunun.studio` or `funun.studio.evil.example` do NOT false-match.
// Re-applies lowercase + trailing-dot normalization so this function is
// safe to call directly (it is exported, and tested directly) and not only
// on already-normalized output from extractHostname().
function isProductionHostname(hostname) {
  const h = String(hostname == null ? '' : hostname)
    .trim()
    .toLowerCase()
    .replace(/\.+$/, '')
  if (!h) return false
  return PRODUCTION_HOSTNAMES.some((prod) => h === prod || h.endsWith('.' + prod))
}

// ─── IP-literal handling ────────────────────────────────────────────────
// An IP literal bypasses hostname checking entirely — there is no name to
// compare against PRODUCTION_HOSTNAMES, so `isProductionHostname()` is
// structurally incapable of protecting us. Rather than let that through,
// a PUBLIC IP literal is refused outright: this harness's legitimate
// targets are a Vercel Preview hostname or a local/LAN staging box, and
// neither needs a public IP literal. Loopback and RFC1918 private ranges
// stay allowed so local/LAN staging still works.
function isIpLiteral(host) {
  const h = String(host == null ? '' : host).trim().toLowerCase()
  if (!h) return false
  if (h.charAt(0) === '[') return true // bracketed IPv6 literal
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(h)
}

function isLoopbackOrPrivateIp(host) {
  const h = String(host == null ? '' : host).trim().toLowerCase()
  if (h === '[::1]') return true
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) return false
  const octets = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])]
  if (octets.some((o) => o > 255)) return false
  const [a, b] = octets
  if (a === 127) return true // 127.0.0.0/8 loopback
  if (a === 10) return true // 10.0.0.0/8
  if (a === 192 && b === 168) return true // 192.168.0.0/16
  if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12
  return false
}

function readEnv(name) {
  // k6 runtime: __ENV is a k6-injected global, never present under Node.
  if (typeof __ENV !== 'undefined' && __ENV && typeof __ENV[name] === 'string') {
    return __ENV[name]
  }
  // Plain Node (target.test.ts, or a manual `node -e` spot check).
  if (typeof process !== 'undefined' && process.env && typeof process.env[name] === 'string') {
    return process.env[name]
  }
  return ''
}

// The one function run-ramp.js calls. Throws (never returns a falsy/empty
// value) for every unsafe or malformed input — "fail closed" by
// construction, matching D-11's "production is never the initial target"
// requirement. Returns the trimmed target URL with no trailing slash on
// success, so callers can safely do `${baseUrl}/some/path`.
function resolveTarget() {
  const raw = readEnv(TARGET_ENV_VAR).trim()

  if (!raw) {
    throw new Error(
      `${TARGET_ENV_VAR} is not set. The k6 harness refuses to guess a target — point it at a ` +
        `non-production Vercel Preview URL, e.g.:\n` +
        `  k6 run -e ${TARGET_ENV_VAR}=https://funun-<branch>-<org>.vercel.app scripts/load/run-ramp.js\n` +
        `See scripts/load/README.md.`
    )
  }

  const hostname = extractHostname(raw)
  if (!hostname) {
    throw new Error(
      `${TARGET_ENV_VAR}="${raw}" is not a usable absolute http(s) URL, so this harness cannot ` +
        `prove it is non-production. Expected e.g. "https://host[:port]". Refusing to run.`
    )
  }

  if (isProductionHostname(hostname)) {
    throw new Error(
      `Refusing to target a PRODUCTION hostname ("${hostname}"). R7 targets a non-production ` +
        `environment ONLY (D-11) — point ${TARGET_ENV_VAR} at a Vercel Preview deploy backed by a ` +
        `separate staging Supabase project. A production load test requires separate written owner ` +
        `authorization and is never this harness's default target. See scripts/load/README.md.`
    )
  }

  if (isIpLiteral(hostname) && !isLoopbackOrPrivateIp(hostname)) {
    throw new Error(
      `Refusing to target the public IP literal "${hostname}". An IP literal has no hostname to ` +
        `check against the production domain, so this guard cannot prove it is non-production. ` +
        `Use the staging/Preview HOSTNAME instead (loopback and private LAN ranges are allowed).`
    )
  }

  return raw.replace(/\/+$/, '')
}

module.exports = {
  resolveTarget,
  isProductionHostname,
  isIpLiteral,
  isLoopbackOrPrivateIp,
  extractHostname,
  TARGET_ENV_VAR,
  PRODUCTION_HOSTNAMES,
  ALLOWED_SCHEMES,
}
