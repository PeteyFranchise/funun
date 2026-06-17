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
  status: 'verified' | 'failed'
  summary: string
  checks: VerificationCheck[]
}

const DOC_LABEL: Record<DocumentType, string> = {
  split_sheet: 'split sheet',
  copyright_registration: 'copyright registration',
  hire_right: 'work-for-hire agreement',
  sample_clearance: 'sample clearance license',
  distribution_agreement: 'distribution agreement',
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
      status: 'failed',
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
  const rawChecks = (parsed?.checks ?? {}) as Record<string, { state?: string; detail?: string }>

  const checks: VerificationCheck[] = CHECK_DEFS.map(c => {
    const r = rawChecks[c.key]
    const state = r?.state === 'pass' ? 'pass' : r?.state === 'fail' ? 'fail' : 'pending'
    return { key: c.key, label: c.label, detail: r?.detail ?? 'Not assessed', state }
  })

  const anyFail = checks.some(c => c.state === 'fail')
  return {
    status: anyFail ? 'failed' : 'verified',
    summary: typeof parsed?.summary === 'string' ? parsed.summary : anyFail ? 'Issues found — review the flagged checks.' : 'Looks complete and consistent.',
    checks,
  }
}
