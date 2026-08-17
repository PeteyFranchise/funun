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
// Deliberately dependency-free (no `URL` global, no npm package) so this
// file is loadable identically from two very different runtimes:
//   1. k6's JS VM, via `require('./target.js')` in run-ramp.js — k6 supports
//      CommonJS `require`/`module.exports` natively alongside its built-in
//      ES-module imports (`import http from 'k6/http'`), per k6's documented
//      module system.
//   2. Plain Node, via `node -e "require('./scripts/load/target.js')..."` —
//      this is the acceptance-criteria "unit-style guard" that proves the
//      refusal fires WITHOUT installing k6 or touching a live target. This
//      is also how this file's own tests (if added later) would run.
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

// Minimal absolute-URL hostname extraction — intentionally NOT using the
// `URL` global. k6's JS VM (goja-based) has historically lagged behind
// Node's `URL` support, and this file must behave identically in both
// runtimes; a hand-rolled, well-tested regex removes that variable.
// Accepts `scheme://host[:port][/path...]` and returns the lowercased host
// (without port). Returns '' for anything that isn't a plausible absolute
// URL — resolveTarget() below turns that into a clear thrown error rather
// than silently proceeding with an empty target.
function extractHostname(rawUrl) {
  const value = String(rawUrl == null ? '' : rawUrl).trim()
  const match = value.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/([^/?#]+)/)
  if (!match) return ''
  // Strip a trailing `:port` and any userinfo (`user:pass@`) prefix, in
  // case someone hand-constructs a target URL that way.
  const authority = match[1]
  const hostPart = authority.includes('@') ? authority.slice(authority.lastIndexOf('@') + 1) : authority
  const hostname = hostPart.replace(/:\d+$/, '')
  return hostname.toLowerCase()
}

// Exact match OR any subdomain (`www.funun.studio`, `app.funun.studio`,
// ...) counts as production — a suffix check anchored on a leading dot
// so `notfunun.studio` or `funun.studio.evil.example` do NOT false-match.
function isProductionHostname(hostname) {
  const h = String(hostname == null ? '' : hostname).trim().toLowerCase()
  if (!h) return false
  return PRODUCTION_HOSTNAMES.some((prod) => h === prod || h.endsWith('.' + prod))
}

function readEnv(name) {
  // k6 runtime: __ENV is a k6-injected global, never present under Node.
  if (typeof __ENV !== 'undefined' && __ENV && typeof __ENV[name] === 'string') {
    return __ENV[name]
  }
  // Plain Node (the unit-style guard, or any future test file).
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
      `${TARGET_ENV_VAR}="${raw}" is not a valid absolute URL (expected e.g. "https://host[:port]").`
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

  return raw.replace(/\/+$/, '')
}

module.exports = {
  resolveTarget,
  isProductionHostname,
  extractHostname,
  TARGET_ENV_VAR,
  PRODUCTION_HOSTNAMES,
}
