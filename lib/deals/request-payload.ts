import type { UsageType, Territory } from '@/lib/deals/schema'

// ─── buildRequestBody (22-02 Task 1) ───────────────────────────────────────
// Pure mapper from the License modal's form state to the exact .strict()
// body app/api/buyer/requests/route.ts accepts. No fetch, no I/O — this is
// the only place the modal's free-form inputs (offer text, integer term
// select) get coerced into the route's real vocabulary (UsageType/Territory
// from lib/deals/schema.ts) and integer cents/months. The route re-derives
// org from the session and re-authorizes the target project server-side
// (T-22-02-01/02) — this function only ever emits the D-07 buyer dimensions,
// never buyer_org_id/created_by/stage/owner_id/commission_pct/
// gross_fee_cents/matched_precleared.

export type RequestForm = {
  usageType: UsageType | ''
  territory: Territory | ''
  termMonths: number
  exclusivity: boolean
  offer: string
  media: string
  message: string
  trackIds: string[]
}

export type RequestRow = {
  vaultProjectId: string
}

export type RequestBody = {
  vault_project_id: string
  track_ids: string[]
  usage_types: UsageType[]
  territories: Territory[]
  term_months: number
  exclusivity: boolean
  budget_cents: number
  need_by: string | null
  buyer_notes: string | null
}

export type BuildRequestBodyResult = { ok: true; body: RequestBody } | { ok: false; error: string }

// Strips currency symbols/grouping commas, parses dollars, and rounds to
// integer cents. Returns null on empty/non-numeric/negative input so the
// caller can surface a single buyer-friendly error.
function parseOfferToCents(offer: string): number | null {
  const cleaned = offer.replace(/[^0-9.]/g, '')
  if (cleaned.trim() === '') return null
  const dollars = Number(cleaned)
  if (!Number.isFinite(dollars) || dollars < 0) return null
  return Math.round(dollars * 100)
}

// Media folds into buyer_notes (the route has no media dimension) — a
// 'Media: {media}' line, omitted when media is empty or the "no filter"
// sentinel 'All media', joined with the free-text message. Null when both
// are empty so the route's optional buyer_notes stays unset rather than "".
function composeBuyerNotes(media: string, message: string): string | null {
  const lines: string[] = []
  const mediaTrim = media.trim()
  if (mediaTrim !== '' && mediaTrim !== 'All media') lines.push(`Media: ${mediaTrim}`)
  const messageTrim = message.trim()
  if (messageTrim !== '') lines.push(messageTrim)
  return lines.length === 0 ? null : lines.join('\n\n')
}

export function buildRequestBody(form: RequestForm, row: RequestRow): BuildRequestBodyResult {
  if (form.usageType === '') return { ok: false, error: 'Select a usage type.' }
  if (form.territory === '') return { ok: false, error: 'Select a territory.' }
  if (form.trackIds.length === 0) return { ok: false, error: 'Select at least one track.' }
  if (!Number.isInteger(form.termMonths) || form.termMonths < 1) {
    return { ok: false, error: 'Term length must be a whole number of months.' }
  }
  const budgetCents = parseOfferToCents(form.offer)
  if (budgetCents === null) return { ok: false, error: 'Enter an offer of $0 or more.' }

  return {
    ok: true,
    body: {
      vault_project_id: row.vaultProjectId,
      track_ids: form.trackIds,
      usage_types: [form.usageType],
      territories: [form.territory],
      term_months: form.termMonths,
      exclusivity: form.exclusivity,
      budget_cents: budgetCents,
      need_by: null,
      buyer_notes: composeBuyerNotes(form.media, form.message),
    },
  }
}
