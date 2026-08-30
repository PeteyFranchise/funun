// ─── AI contract verification ────────────────────────────────────────
// Reads an uploaded contract PDF with Claude (native PDF document block)
// and checks it for COMPLETENESS & ACCURACY — not legal review. Returns a
// structured set of checks the Contract Locker renders. Server-only.
import Anthropic from '@anthropic-ai/sdk'
import type { DocumentType, VerificationCheck } from '@/types'

const MODEL = 'claude-sonnet-4-6'

export type VerifyContext = {
  docType: DocumentType
  releaseTitle: string
  isrcs: string[]
  /** Expected writer splits captured in the Vault, for cross-checking. */
  expectedWriters: { name: string; split: number }[]
}

export type VerifyResult = {
  // 'verified' = assessed and clean. 'failed' = assessed and a clear problem
  // was found. 'unverified' = could NOT be assessed (unparseable, truncated,
  // missing checks, or the model punted on everything) — the fail-closed
  // state, an existing value in migration 011's verification_status CHECK.
  status: 'verified' | 'failed' | 'unverified'
  summary: string
  checks: VerificationCheck[]
}

const VALID_STATES = new Set(['pass', 'fail', 'pending'])

/**
 * Turns a parsed model response (or null, when nothing parseable came back)
 * into a verdict. Fail-closed by construction: 'verified' is reachable ONLY
 * when the response parsed, every required check returned a valid state, none
 * failed, and at least one affirmatively passed. A single clear problem is
 * 'failed'; everything else — malformed, truncated, missing checks, an
 * unknown state, or an all-'pending' punt — is 'unverified'. Pure and
 * dependency-free so the decision can be tested without the network.
 */
export function decideVerification(parsed: Record<string, unknown> | null): VerifyResult {
  const rawChecks = (parsed?.checks ?? {}) as Record<string, { state?: string; detail?: string }>

  // A check is ASSESSED only when the model returned one of the three allowed
  // states for it. A missing key or an unknown state is not-assessed — never
  // silently a pass. parsed === null makes rawChecks empty, so every check is
  // unassessed and the whole thing lands on 'unverified'.
  let allAssessed = parsed !== null
  const checks: VerificationCheck[] = CHECK_DEFS.map(c => {
    const raw = rawChecks[c.key]?.state
    const assessed = typeof raw === 'string' && VALID_STATES.has(raw)
    if (!assessed) allAssessed = false
    const state = raw === 'pass' ? 'pass' : raw === 'fail' ? 'fail' : 'pending'
    return { key: c.key, label: c.label, detail: rawChecks[c.key]?.detail ?? 'Not assessed', state }
  })

  const anyFail = checks.some(c => c.state === 'fail')
  const anyPass = checks.some(c => c.state === 'pass')

  const status: VerifyResult['status'] = anyFail
    ? 'failed'
    : allAssessed && anyPass
      ? 'verified'
      : 'unverified'

  // For 'unverified' the model's own summary is untrustworthy (it may be a
  // hallucinated "looks complete", or absent), so it is never surfaced.
  const summary =
    status === 'failed'
      ? typeof parsed?.summary === 'string'
        ? parsed.summary
        : 'Issues found — review the flagged checks.'
      : status === 'verified'
        ? typeof parsed?.summary === 'string'
          ? parsed.summary
          : 'Looks complete and consistent.'
        : 'Could not verify automatically — please review this document yourself.'

  return { status, summary, checks }
}

const DOC_LABEL: Record<DocumentType, string> = {
  split_sheet: 'split sheet',
  copyright_registration: 'copyright registration',
  hire_right: 'work-for-hire agreement',
  sample_clearance: 'sample clearance license',
  distribution_agreement: 'distribution agreement',
  blanket_agreement: 'sync library agreement',
}

function extractJson(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = fenced ? fenced[1] : text
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1) return null
  try {
    return JSON.parse(raw.slice(start, end + 1))
  } catch {
    return null
  }
}

const CHECK_DEFS: { key: string; label: string }[] = [
  { key: 'splits_total', label: 'Splits total 100%' },
  { key: 'parties_present', label: 'All parties present' },
  { key: 'signatures_present', label: 'Signatures present' },
  { key: 'terms_match', label: 'Terms match release' },
]

function buildPrompt(ctx: VerifyContext): string {
  const writers = ctx.expectedWriters.length
    ? ctx.expectedWriters.map(w => `${w.name} (${w.split}%)`).join(', ')
    : '(none captured in the Vault)'
  return `You are verifying a ${DOC_LABEL[ctx.docType]} an artist uploaded to their catalogue. Check it for COMPLETENESS and ACCURACY only — this is NOT legal advice or legal review.

Release context from the artist's Vault:
- Title: ${ctx.releaseTitle}
- ISRC(s): ${ctx.isrcs.length ? ctx.isrcs.join(', ') : '(none)'}
- Expected writers & splits: ${writers}

Evaluate exactly these four checks and respond with ONLY a JSON object:
{
  "checks": {
    "splits_total":     { "state": "pass|fail|pending", "detail": "<short>" },
    "parties_present":  { "state": "pass|fail|pending", "detail": "<short>" },
    "signatures_present":{ "state": "pass|fail|pending", "detail": "<short>" },
    "terms_match":      { "state": "pass|fail|pending", "detail": "<short>" }
  },
  "summary": "<one sentence overall verdict>"
}

Rules:
- "splits_total": pass only if payout percentages in the document add up to exactly 100% (for non-split documents, judge whether stated financial terms are internally consistent; use pending if N/A).
- "parties_present": pass if every named party/signatory block is filled in.
- "signatures_present": pass if every required signature block is signed/dated.
- "terms_match": pass if the title, ISRC(s) and dates in the document align with the release context above.
- Use "fail" for a clear problem, "pending" when the document doesn't contain enough to tell.
- "detail" must be under 8 words. Output JSON only.`
}

export async function verifyContractPdf(pdfBase64: string, ctx: VerifyContext): Promise<VerifyResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return {
      status: 'unverified',
      summary: 'Verification unavailable — AI is not configured.',
      checks: CHECK_DEFS.map(c => ({ ...c, detail: 'Could not verify', state: 'pending' as const })),
    }
  }

  const anthropic = new Anthropic({ apiKey })
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
          },
          { type: 'text', text: buildPrompt(ctx) },
        ],
      },
    ],
  })

  const text = msg.content.find(b => b.type === 'text')
  const parsed = text && text.type === 'text' ? extractJson(text.text) : null
  return decideVerification(parsed)
}
