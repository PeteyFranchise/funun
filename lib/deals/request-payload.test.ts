import { buildRequestBody, type RequestForm, type RequestRow } from './request-payload'

// ─── buildRequestBody contract (22-02 Task 1) ──────────────────────────────
// Locks the pure mapping from the License modal's form state to the exact
// .strict() body app/api/buyer/requests/route.ts accepts. No fetch, no I/O —
// this is a pure function test, mirroring lib/deals/matching.test.ts's style.

const baseForm: RequestForm = {
  usageType: 'film',
  territory: 'worldwide',
  termMonths: 12,
  exclusivity: false,
  offer: '$4,500',
  media: 'Broadcast',
  message: 'Trailer cut',
  trackIds: ['t1'],
}

const baseRow: RequestRow = { vaultProjectId: 'p1' }

describe('buildRequestBody', () => {
  it('maps the happy path to the route contract', () => {
    const result = buildRequestBody(baseForm, baseRow)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.body).toEqual({
      vault_project_id: 'p1',
      track_ids: ['t1'],
      usage_types: ['film'],
      territories: ['worldwide'],
      term_months: 12,
      exclusivity: false,
      budget_cents: 450000,
      need_by: null,
      buyer_notes: 'Media: Broadcast\n\nTrailer cut',
    })
  })

  // ── offer parsing ──
  it('parses a dollar-formatted offer with grouping commas', () => {
    const result = buildRequestBody(baseForm, baseRow)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.body.budget_cents).toBe(450000)
  })

  it('parses a bare numeric offer', () => {
    const result = buildRequestBody({ ...baseForm, offer: '4500' }, baseRow)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.body.budget_cents).toBe(450000)
  })

  it('parses an offer with cents', () => {
    const result = buildRequestBody({ ...baseForm, offer: '$4,500.50' }, baseRow)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.body.budget_cents).toBe(450050)
  })

  it('rejects an empty offer', () => {
    const result = buildRequestBody({ ...baseForm, offer: '' }, baseRow)
    expect(result).toEqual({ ok: false, error: 'Enter an offer of $0 or more.' })
  })

  it('rejects a non-numeric offer', () => {
    const result = buildRequestBody({ ...baseForm, offer: 'lots' }, baseRow)
    expect(result).toEqual({ ok: false, error: 'Enter an offer of $0 or more.' })
  })

  // ── term_months ──
  it('rejects a non-integer term', () => {
    const result = buildRequestBody({ ...baseForm, termMonths: 12.5 }, baseRow)
    expect(result).toEqual({ ok: false, error: 'Term length must be a whole number of months.' })
  })

  it('rejects a term below 1', () => {
    const result = buildRequestBody({ ...baseForm, termMonths: 0 }, baseRow)
    expect(result).toEqual({ ok: false, error: 'Term length must be a whole number of months.' })
  })

  // ── required fields ──
  it('rejects an empty track selection', () => {
    const result = buildRequestBody({ ...baseForm, trackIds: [] }, baseRow)
    expect(result).toEqual({ ok: false, error: 'Select at least one track.' })
  })

  it('rejects an empty usage type', () => {
    const result = buildRequestBody({ ...baseForm, usageType: '' }, baseRow)
    expect(result).toEqual({ ok: false, error: 'Select a usage type.' })
  })

  it('rejects an empty territory', () => {
    const result = buildRequestBody({ ...baseForm, territory: '' }, baseRow)
    expect(result).toEqual({ ok: false, error: 'Select a territory.' })
  })

  // ── buyer_notes composition ──
  it('omits the media line when media is "All media"', () => {
    const result = buildRequestBody({ ...baseForm, media: 'All media' }, baseRow)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.body.buyer_notes).toBe('Trailer cut')
  })

  it('omits the media line when media is empty', () => {
    const result = buildRequestBody({ ...baseForm, media: '' }, baseRow)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.body.buyer_notes).toBe('Trailer cut')
  })

  it('sets buyer_notes to null when both media and message are empty', () => {
    const result = buildRequestBody({ ...baseForm, media: '', message: '' }, baseRow)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.body.buyer_notes).toBeNull()
  })

  it('sets buyer_notes to null when media is "All media" and message is empty', () => {
    const result = buildRequestBody({ ...baseForm, media: 'All media', message: '   ' }, baseRow)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.body.buyer_notes).toBeNull()
  })

  // ── forbidden fields (T-22-02-01) ──
  it('never emits server-owned fields', () => {
    const result = buildRequestBody(baseForm, baseRow)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const body = result.body as Record<string, unknown>
    expect(body).not.toHaveProperty('buyer_org_id')
    expect(body).not.toHaveProperty('created_by')
    expect(body).not.toHaveProperty('stage')
    expect(body).not.toHaveProperty('owner_id')
    expect(body).not.toHaveProperty('commission_pct')
    expect(body).not.toHaveProperty('gross_fee_cents')
    expect(body).not.toHaveProperty('matched_precleared')
  })

  it('always emits track_ids/usage_types/territories as arrays of real enum values', () => {
    const result = buildRequestBody(baseForm, baseRow)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(Array.isArray(result.body.usage_types)).toBe(true)
    expect(Array.isArray(result.body.territories)).toBe(true)
    expect(Array.isArray(result.body.track_ids)).toBe(true)
  })
})
