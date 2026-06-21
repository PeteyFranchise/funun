// ─── DDEX DSR flat-file ingest ───────────────────────────────────────
// Parses a DDEX Digital Sales Reporting (DSR) flat-file — the tab-separated
// format DSPs/distributors send (HEAD … record-typed rows … FOOT; tab = 1st
// delimiter, pipe = 2nd, UTF-8) — and aggregates sales/usage into earnings.
//
// DSR-F has many profiles and the exact column order varies, so this is a
// TOLERANT, heuristic reader: it locates ISRCs, monetary amounts, units,
// territory and currency wherever they appear in a row. Harden against the
// specific DSR profile/XSD before relying on it for accounting. Pure +
// client-safe.

export type DsrSalesLine = {
  isrc: string | null
  title: string | null
  territory: string | null
  units: number | null
  revenue: number | null
  currency: string | null
}

export type DsrIsrcTotal = { isrc: string; title: string | null; units: number; revenue: number }

export type DsrSummary = {
  recordCount: number
  byRecordType: Record<string, number>
  lines: DsrSalesLine[]
  totalRevenue: number
  totalUnits: number
  currency: string | null
  byIsrc: DsrIsrcTotal[]
  warnings: string[]
}

const ISRC_RE = /\b([A-Z]{2}[A-Z0-9]{3}\d{7})\b/
const ISRC_DASHED_RE = /\b([A-Z]{2})-?([A-Z0-9]{3})-?(\d{2})-?(\d{5})\b/
const CURRENCIES = new Set([
  'USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'SEK', 'NOK', 'DKK', 'BRL', 'MXN', 'KRW', 'INR', 'ZAR',
])
const TERRITORY_RE = /^[A-Z]{2}$/ // ISO 3166-1 alpha-2 (or "Worldwide")

function findIsrc(cells: string[]): string | null {
  for (const c of cells) {
    const m = c.match(ISRC_RE)
    if (m) return m[1]
    const d = c.match(ISRC_DASHED_RE)
    if (d) return `${d[1]}${d[2]}${d[3]}${d[4]}`
  }
  return null
}

function findCurrency(cells: string[]): string | null {
  for (const c of cells) if (CURRENCIES.has(c.trim().toUpperCase())) return c.trim().toUpperCase()
  return null
}

function findTerritory(cells: string[]): string | null {
  for (const c of cells) {
    const v = c.trim()
    if (v === 'Worldwide') return 'Worldwide'
    if (TERRITORY_RE.test(v)) return v
  }
  return null
}

// Decimal-looking cells → revenue candidate; integer cells → units candidate.
function findAmounts(cells: string[]): { revenue: number | null; units: number | null } {
  let revenue: number | null = null
  let units: number | null = null
  for (const c of cells) {
    const v = c.trim().replace(/,/g, '')
    if (!/^-?\d+(\.\d+)?$/.test(v)) continue
    const n = Number(v)
    if (!Number.isFinite(n)) continue
    if (v.includes('.')) {
      // Prefer the largest decimal as revenue (net amount usually dominates).
      if (revenue === null || n > revenue) revenue = n
    } else if (n >= 1 && n < 1e9) {
      if (units === null) units = n
    }
  }
  return { revenue, units }
}

export function parseDsrFlatFile(text: string): DsrSummary {
  const warnings: string[] = []
  const rows = text.split(/\r?\n/).filter(r => r.trim().length > 0)
  const byRecordType: Record<string, number> = {}
  const lines: DsrSalesLine[] = []

  for (const row of rows) {
    const cells = row.split('\t')
    const rt = (cells[0] ?? '').trim().toUpperCase()
    byRecordType[rt] = (byRecordType[rt] ?? 0) + 1
    if (rt === 'HEAD' || rt === 'FOOT' || rt === 'FHEA' || rt === 'FFOO') continue

    const isrc = findIsrc(cells)
    const { revenue, units } = findAmounts(cells)
    if (!isrc && revenue === null) continue // not a sales/usage-bearing row

    lines.push({
      isrc,
      title: null,
      territory: findTerritory(cells),
      units,
      revenue,
      currency: findCurrency(cells),
    })
  }

  if (rows.length === 0) warnings.push('Empty file.')
  if (!Object.keys(byRecordType).some(t => t === 'HEAD' || t === 'FHEA'))
    warnings.push('No HEAD record found — may not be a DSR flat-file.')
  if (lines.length === 0) warnings.push('No sales/usage rows recognised.')

  const currency = lines.find(l => l.currency)?.currency ?? null
  const totalRevenue = Math.round(lines.reduce((s, l) => s + (l.revenue ?? 0), 0) * 100) / 100
  const totalUnits = lines.reduce((s, l) => s + (l.units ?? 0), 0)

  const isrcMap = new Map<string, DsrIsrcTotal>()
  for (const l of lines) {
    if (!l.isrc) continue
    const cur = isrcMap.get(l.isrc) ?? { isrc: l.isrc, title: l.title, units: 0, revenue: 0 }
    cur.units += l.units ?? 0
    cur.revenue = Math.round((cur.revenue + (l.revenue ?? 0)) * 100) / 100
    isrcMap.set(l.isrc, cur)
  }
  const byIsrc = Array.from(isrcMap.values()).sort((a, b) => b.revenue - a.revenue)

  return {
    recordCount: rows.length,
    byRecordType,
    lines,
    totalRevenue,
    totalUnits,
    currency,
    byIsrc,
    warnings,
  }
}
