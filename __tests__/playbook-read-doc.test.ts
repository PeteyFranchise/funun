// ─── readObservabilityDoc() tests ──────────────────────────────────────
// Proves the fail-fast fs.readFile wrapper (mirrors lib/vault/pdf/fonts.ts's
// assertFontFileExists rationale — never a silent blank render) returns
// non-empty content for each of the 4 real Playbook IT-room doc files, and
// throws a descriptive Error naming the resolved path for a missing/renamed
// file. Deliberately does NOT import react-markdown/remark-gfm — this test
// stays pure-logic to avoid the ESM-Jest transform issue documented in
// 33-RESEARCH.md Common Pitfall 3.

import { readObservabilityDoc } from '@/lib/playbook/read-doc'

describe('readObservabilityDoc', () => {
  const realFiles = [
    'VENDOR-DIRECTORY.md',
    'RUNBOOK.md',
    'OPERATING-RHYTHM.md',
    'THRESHOLDS-AND-SEVERITY.md',
  ]

  it.each(realFiles)('returns non-empty content for %s', async (filename) => {
    const content = await readObservabilityDoc(filename)
    expect(typeof content).toBe('string')
    expect(content.length).toBeGreaterThan(0)
  })

  it('throws a descriptive Error naming the resolved path for a bogus filename', async () => {
    const bogusFilename = 'DOES-NOT-EXIST.md'
    await expect(readObservabilityDoc(bogusFilename)).rejects.toThrow(bogusFilename)
  })
})
