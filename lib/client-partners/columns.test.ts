import {
  COMPANIES_COLUMNS,
  CLIENTS_COLUMNS,
  DEFAULT_SORT,
  sortRows,
  resolveHealth,
  type ClientPartnerRow,
} from './columns'

describe('COMPANIES_COLUMNS / CLIENTS_COLUMNS', () => {
  it('COMPANIES_COLUMNS has 12 entries, identity first and pinned', () => {
    expect(COMPANIES_COLUMNS).toHaveLength(12)
    expect(COMPANIES_COLUMNS[0].key).toBe('name')
    expect(COMPANIES_COLUMNS[0].isIdentity).toBe(true)
    expect(COMPANIES_COLUMNS.slice(1).every(c => c.isIdentity === false)).toBe(true)
  })

  it('CLIENTS_COLUMNS has 10 entries, identity first and pinned', () => {
    expect(CLIENTS_COLUMNS).toHaveLength(10)
    expect(CLIENTS_COLUMNS[0].key).toBe('name')
    expect(CLIENTS_COLUMNS[0].isIdentity).toBe(true)
    expect(CLIENTS_COLUMNS.slice(1).every(c => c.isIdentity === false)).toBe(true)
  })

  it('exactly one identity column per set (table can never reach zero columns)', () => {
    expect(COMPANIES_COLUMNS.filter(c => c.isIdentity)).toHaveLength(1)
    expect(CLIENTS_COLUMNS.filter(c => c.isIdentity)).toHaveLength(1)
  })
})

describe('DEFAULT_SORT (R1)', () => {
  it('is Next action, overdue-first, ascending', () => {
    expect(DEFAULT_SORT).toEqual({ key: 'nextAction', dir: 'asc' })
  })

  it('ranks overdue before today before soon before no next action', () => {
    const rows: ClientPartnerRow[] = [
      { id: 'a', name: 'A Co', nextActionState: 'soon' },
      { id: 'b', name: 'B Co', nextActionState: 'overdue' },
      { id: 'c', name: 'C Co', nextActionState: 'today' },
      { id: 'd', name: 'D Co', nextActionState: null },
    ]
    const out = sortRows(rows, DEFAULT_SORT.key, DEFAULT_SORT.dir).map(r => r.id)
    expect(out).toEqual(['b', 'c', 'a', 'd'])
  })
})

describe('sortRows stability — R2 backstop', () => {
  // All three rows share the same sort-key value (status), so the entire
  // comparison collapses to the identity tiebreak. If sortRows ever relied
  // on input-array order (e.g. a bare native .sort with no explicit
  // tiebreak on a non-transitive comparator), shuffling the input would
  // change the output order.
  const rowA: ClientPartnerRow = { id: '1', name: 'Zeta Co', status: 'active' }
  const rowB: ClientPartnerRow = { id: '2', name: 'Alpha Co', status: 'active' }
  const rowC: ClientPartnerRow = { id: '3', name: 'Mid Co', status: 'active' }

  it('produces the identity-tiebreak order regardless of input array order', () => {
    const expected = ['2', '3', '1'] // Alpha, Mid, Zeta — name ascending

    const orderings = [
      [rowA, rowB, rowC],
      [rowC, rowA, rowB],
      [rowB, rowC, rowA],
      [rowC, rowB, rowA],
    ]

    for (const input of orderings) {
      expect(sortRows(input, 'status', 'asc').map(r => r.id)).toEqual(expected)
    }
  })

  it('is stable under a repeated shuffle (same output every run)', () => {
    const rows = [rowA, rowB, rowC]
    const first = sortRows(rows, 'status', 'asc').map(r => r.id)
    for (let i = 0; i < 10; i++) {
      const shuffled = [...rows].sort(() => Math.random() - 0.5)
      expect(sortRows(shuffled, 'status', 'asc').map(r => r.id)).toEqual(first)
    }
  })
})

describe('resolveHealth', () => {
  it('defaults to unknown, never infers good', () => {
    expect(resolveHealth({})).toBe('unknown')
    expect(resolveHealth({ health: undefined })).toBe('unknown')
  })

  it('passes through an explicit computed value', () => {
    expect(resolveHealth({ health: 'good' })).toBe('good')
    expect(resolveHealth({ health: 'at_risk' })).toBe('at_risk')
  })

  it('sorts unknown health below good, above warning/at_risk', () => {
    const rows: ClientPartnerRow[] = [
      { id: 'g', name: 'Good Co', health: 'good' },
      { id: 'u', name: 'Unknown Co', health: undefined },
      { id: 'w', name: 'Warn Co', health: 'warning' },
      { id: 'r', name: 'Risk Co', health: 'at_risk' },
    ]
    const out = sortRows(rows, 'health', 'asc').map(r => r.id)
    expect(out).toEqual(['r', 'w', 'u', 'g'])
  })
})
