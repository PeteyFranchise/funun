// ─── Playbook IT-room doc pages — page-to-file map + content render ────
// Wave 0 test (33-06 Task 2). Locks the D-10 page-to-file map exactly and
// proves each of the 4 IT-room doc pages' actual wiring — DOC_PAGE_FILE
// (nav.ts) -> readObservabilityDoc (read-doc.ts) — resolves to non-empty
// markdown locally. Deliberately does NOT import react-markdown (no RSC
// render here) to avoid the ESM-Jest transform issue documented in
// 33-RESEARCH.md Common Pitfall 3; the actual RSC render + production
// file-tracing are covered by 33-03's build-trace gate + manual UAT.

import { DOC_PAGE_FILE } from '@/lib/playbook/nav'
import { readObservabilityDoc } from '@/lib/playbook/read-doc'

describe('Playbook IT-room doc pages — page-to-file map (D-10)', () => {
  it('maps the 4 doc slugs to exactly the D-10 filenames', () => {
    expect(DOC_PAGE_FILE).toEqual({
      'vendor-directory': 'VENDOR-DIRECTORY.md',
      runbook: 'RUNBOOK.md',
      'operating-rhythm': 'OPERATING-RHYTHM.md',
      thresholds: 'THRESHOLDS-AND-SEVERITY.md',
    })
  })

  const slugs = Object.keys(DOC_PAGE_FILE) as Array<keyof typeof DOC_PAGE_FILE>

  it.each(slugs)('resolves non-empty markdown content for "%s"', async (slug) => {
    const content = await readObservabilityDoc(DOC_PAGE_FILE[slug])
    expect(typeof content).toBe('string')
    expect(content.length).toBeGreaterThan(0)
  })
})
