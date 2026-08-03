import { buildCodeSheet, type CodeSheetProjectRow, type CodeSheetTrackRow } from './code-sheet'

function project(overrides: Partial<CodeSheetProjectRow> & { id: string }): CodeSheetProjectRow {
  return {
    id: overrides.id,
    title: overrides.title ?? 'Untitled Release',
    release_date: overrides.release_date ?? null,
    upc: overrides.upc ?? null,
    grid: overrides.grid ?? null,
    catalog_number: overrides.catalog_number ?? null,
  }
}

function track(overrides: Partial<CodeSheetTrackRow> & { project_id: string }): CodeSheetTrackRow {
  return {
    project_id: overrides.project_id,
    title: overrides.title ?? 'Untitled Track',
    track_number: overrides.track_number ?? null,
    isrc: overrides.isrc ?? null,
    iswc: overrides.iswc ?? null,
    duration_seconds: overrides.duration_seconds ?? null,
  }
}

function rowsOf(csv: string): string[][] {
  const lines = csv.split('\n')
  return lines.slice(1).map(l => l.split(','))
}

describe('buildCodeSheet', () => {
  it('produces one row per track, carrying release + track identifiers and metadata', () => {
    const projects = [
      project({ id: 'p1', title: 'Neon Skies', release_date: '2026-03-01', upc: '810023456789', grid: 'A1-2425G-ABC1234002-M', catalog_number: 'FUN-0001' }),
    ]
    const tracks = [
      track({ project_id: 'p1', title: 'Runaway', track_number: 1, isrc: 'US-S1Z-26-00001', iswc: 'T-034524680', duration_seconds: 210 }),
    ]
    const csv = buildCodeSheet(projects, tracks)
    const rows = rowsOf(csv)
    expect(rows.length).toBe(1)
    const [releaseTitle, trackTitle, isrc, iswc, upc, grid, catalogNumber, duration, releaseDate] = rows[0]
    expect(releaseTitle).toBe('Neon Skies')
    expect(trackTitle).toBe('Runaway')
    expect(isrc).toBe('US-S1Z-26-00001')
    expect(iswc).toBe('T-034524680')
    expect(upc).toBe('810023456789')
    expect(grid).toBe('A1-2425G-ABC1234002-M')
    expect(catalogNumber).toBe('FUN-0001')
    expect(duration).toBe('210')
    expect(releaseDate).toBe('2026-03-01')
  })

  it('a track with no identifiers still produces a row with blank cells — not a filtered list', () => {
    const projects = [project({ id: 'p1', title: 'Bare Bones' })]
    const tracks = [track({ project_id: 'p1', title: 'Untagged', track_number: 1 })]
    const csv = buildCodeSheet(projects, tracks)
    const rows = rowsOf(csv)
    expect(rows.length).toBe(1)
    const [releaseTitle, trackTitle, isrc, iswc, upc, grid, catalogNumber] = rows[0]
    expect(releaseTitle).toBe('Bare Bones')
    expect(trackTitle).toBe('Untagged')
    expect(isrc).toBe('')
    expect(iswc).toBe('')
    expect(upc).toBe('')
    expect(grid).toBe('')
    expect(catalogNumber).toBe('')
  })

  it('sorts rows by release date descending, then track number ascending', () => {
    const projects = [
      project({ id: 'old', title: 'Old Release', release_date: '2024-01-01' }),
      project({ id: 'new', title: 'New Release', release_date: '2026-06-01' }),
    ]
    const tracks = [
      track({ project_id: 'old', title: 'Old Track', track_number: 1 }),
      track({ project_id: 'new', title: 'New Track 2', track_number: 2 }),
      track({ project_id: 'new', title: 'New Track 1', track_number: 1 }),
    ]
    const csv = buildCodeSheet(projects, tracks)
    const titles = rowsOf(csv).map(r => r[1])
    expect(titles).toEqual(['New Track 1', 'New Track 2', 'Old Track'])
  })

  it('places releases with no release date last (never crashes on null dates)', () => {
    const projects = [
      project({ id: 'dated', title: 'Dated', release_date: '2025-01-01' }),
      project({ id: 'undated', title: 'Undated', release_date: null }),
    ]
    const tracks = [
      track({ project_id: 'undated', title: 'Undated Track', track_number: 1 }),
      track({ project_id: 'dated', title: 'Dated Track', track_number: 1 }),
    ]
    const csv = buildCodeSheet(projects, tracks)
    const titles = rowsOf(csv).map(r => r[1])
    expect(titles).toEqual(['Dated Track', 'Undated Track'])
  })

  it('escapes CSV cells containing commas or quotes correctly', () => {
    const projects = [project({ id: 'p1', title: 'Salt, Sugar & "Spice"' })]
    const tracks = [track({ project_id: 'p1', title: 'A, B, C', track_number: 1 })]
    const csv = buildCodeSheet(projects, tracks)
    const lines = csv.split('\n')
    expect(lines[1]).toContain('"Salt, Sugar & ""Spice"""')
    expect(lines[1]).toContain('"A, B, C"')
  })

  it('an artist with zero projects produces a header-only sheet, not an error', () => {
    expect(() => buildCodeSheet([], [])).not.toThrow()
    const csv = buildCodeSheet([], [])
    const lines = csv.split('\n')
    expect(lines.length).toBe(1)
    expect(lines[0]).toContain('release_title')
  })
})
