import {
  getCurrentBlanketAgreement,
  BLANKET_AGREEMENT_VERSION,
  BLANKET_AGREEMENT_SECTIONS,
  BLANKET_AGREEMENT_TITLE,
} from './agreement'

// ─── lib/sync-library/agreement.ts (26-04 Task 1) ──────────────────────
// Asserts the versioned/swappable template contract: a non-empty version,
// non-empty structured sections (so the PDF renderer never has to fall
// back to raw markdown), and a title matching the signing-surface copy
// used at mint time (app/api/sync-library/mint-agreement/route.ts).

describe('getCurrentBlanketAgreement', () => {
  it('exposes a non-empty version string', () => {
    expect(typeof BLANKET_AGREEMENT_VERSION).toBe('string')
    expect(BLANKET_AGREEMENT_VERSION.trim().length).toBeGreaterThan(0)
  })

  it('exposes non-empty sections, each with a heading and at least one paragraph', () => {
    expect(Array.isArray(BLANKET_AGREEMENT_SECTIONS)).toBe(true)
    expect(BLANKET_AGREEMENT_SECTIONS.length).toBeGreaterThan(0)

    for (const section of BLANKET_AGREEMENT_SECTIONS) {
      expect(section.heading.trim().length).toBeGreaterThan(0)
      expect(section.paragraphs.length).toBeGreaterThan(0)
      for (const paragraph of section.paragraphs) {
        expect(paragraph.trim().length).toBeGreaterThan(0)
      }
    }
  })

  it('bundles version, sections, and title from the same single source of truth', () => {
    const agreement = getCurrentBlanketAgreement()
    expect(agreement.version).toBe(BLANKET_AGREEMENT_VERSION)
    expect(agreement.sections).toBe(BLANKET_AGREEMENT_SECTIONS)
    expect(agreement.title).toBe(BLANKET_AGREEMENT_TITLE)
  })

  it('exposes the title matching the signing-surface copy used at mint time', () => {
    expect(getCurrentBlanketAgreement().title).toBe('Funūn Sync Library Agreement')
  })
})
