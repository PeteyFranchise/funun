import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { injectNonce } from '@/lib/marketing/nonceInjection'

// ─── GET /marketing-document — the anonymous root's real document ────────
// Quick task 260930-ibp, Task 3. middleware.ts rewrites `/` to this path
// ONLY when there is no authenticated user (lib/marketing/rootRewrite.ts).
// A direct request to this path is redirected back to `/` by middleware —
// this route is never meant to be a second, independently-indexable copy
// of the page (T-ibp-02).
//
// Reads the pre-sanitized, committed artifact (assets/marketing/landing.html,
// produced by scripts/build-marketing-artifact.ts) and substitutes the
// per-request CSP nonce by string replacement only — no HTML parse, no
// reserialize, matching the artifact's own build-time rule.

const ARTIFACT_PATH = join(process.cwd(), 'assets/marketing/landing.html')
const MANIFEST_PATH = join(process.cwd(), 'assets/marketing/manifest.json')

type MarketingManifestShape = { nonceScriptCount?: number }

// Cached once per server instance: the static template and its expected
// placeholder count never change between requests, so re-reading both
// files from disk on every anonymous homepage load is pure waste. The
// nonce-substituted BODY below is never cached — see injectNonce below and
// the Cache-Control header on the response.
let cachedTemplate: string | null = null
let cachedExpectedNonceCount: number | null = null

function loadTemplate(): { template: string; expectedNonceCount: number } {
  if (cachedTemplate !== null && cachedExpectedNonceCount !== null) {
    return { template: cachedTemplate, expectedNonceCount: cachedExpectedNonceCount }
  }

  const template = readFileSync(ARTIFACT_PATH, 'utf8')
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as MarketingManifestShape
  // Read from the manifest rather than hardcoding a literal here: the
  // source scope document assumed 3 surviving inline scripts, and the
  // verified answer for the actual artifact is 1. A hardcoded number in
  // this route would be a loaded gun the next time the artifact changes.
  if (typeof manifest.nonceScriptCount !== 'number' || manifest.nonceScriptCount <= 0) {
    throw new Error('marketing manifest is missing a valid nonceScriptCount')
  }

  cachedTemplate = template
  cachedExpectedNonceCount = manifest.nonceScriptCount
  return { template, expectedNonceCount: manifest.nonceScriptCount }
}

export async function GET(req: NextRequest) {
  const nonce = req.headers.get('x-nonce')
  if (!nonce) {
    // Fails closed: the rewrite in middleware.ts is required to forward the
    // same x-nonce header createPassThroughResponse builds for every other
    // request. Its absence here means that contract broke, not that this
    // route should degrade to serving un-nonced markup the CSP would
    // reject anyway.
    return NextResponse.json({ error: 'Missing CSP nonce' }, { status: 500 })
  }

  let template: string
  let expectedNonceCount: number
  try {
    ;({ template, expectedNonceCount } = loadTemplate())
  } catch (err) {
    console.error('marketing-document: failed to load artifact/manifest:', err)
    return NextResponse.json({ error: 'Marketing document unavailable' }, { status: 500 })
  }

  let html: string
  try {
    html = injectNonce(template, nonce, expectedNonceCount).html
  } catch (err) {
    console.error('marketing-document: nonce injection failed:', err)
    return NextResponse.json({ error: 'Marketing document unavailable' }, { status: 500 })
  }

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // A nonce-bearing response is per-request and must never be shared
      // across requests/users by a cache (T-ibp-06).
      'Cache-Control': 'private, no-store',
    },
  })
}
