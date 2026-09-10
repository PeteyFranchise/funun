// ─── The Crate entry gate, at the readiness-item level (2026-09-10) ──────
// Two defects found by design review and verified in source, both in
// readinessItemsForProject():
//
//   DEFECT 1  `hire_right` returned 'missing' when a project had ZERO
//             producer agreements. For a SELF-PRODUCED recording that is
//             the wrong fact: nobody was hired, so no agreement is
//             required. Because the six-item sync entry gate demands
//             'complete', that kept self-produced songs — most of an
//             independent-artist catalogue — out of The Crate entirely.
//
//   DEFECT 3  `copyright` never looked at a document's status, so a
//             'pending' row (an artist clicking "Mark as filed", nothing
//             attached) satisfied a gate that lets a buyer license the
//             song.
//
// These tests are written against the ENTRY GATE, not just the item, where
// the gate is the thing that was broken — isSyncEntryComplete() is the
// predicate isRightsReady() calls (lib/deals/catalog.ts), so a test that
// only asserted an item's status could stay green while the catalogue
// stayed shut.
import { readinessItemsForProject } from '@/lib/vault/readiness'
import { isSyncEntryComplete, syncReadinessForTrack } from '@/lib/sync-library/readiness'
import type { ReadinessItem } from '@/types'

function itemFor(key: string, items: ReadinessItem[]): ReadinessItem {
  const item = items.find(i => i.key === key)
  if (!item) throw new Error(`${key} missing from readinessItemsForProject output`)
  return item
}

// A single with EVERY sync entry item satisfied except hire_right, which is
// left to the derivation under test. No producer, no mixing engineer, no
// mastering engineer — the artist made this record themselves.
const SELF_PRODUCED_TRACK = {
  id: 'track-1',
  isrc: null,
  iswc: null,
  metadata: {
    composers: [{ name: 'Jane Writer', role: 'composer_lyricist', pro: 'ascap', split: 100 }],
  },
  producers: null,
  mixing_engineer: null,
  mastering_engineer: null,
}

// The same record, except a producer was hired.
const HIRED_PRODUCER_TRACK = {
  ...SELF_PRODUCED_TRACK,
  producers: ['Marcus Beats'],
}

const FIVE_OTHER_ITEMS_COMPLETE = {
  type: 'single' as const,
  assets: [{ type: 'cover_art' }],
  documents: [
    { type: 'copyright_registration', status: 'signed' },
    { type: 'split_sheet', status: 'signed' },
  ],
}

describe('defect 1 — a self-produced song can enter The Crate', () => {
  it('PASSES the six-item entry gate with no hired collaborators and the other five items complete', () => {
    const items = readinessItemsForProject({
      ...FIVE_OTHER_ITEMS_COMPLETE,
      tracks: [SELF_PRODUCED_TRACK],
    })

    // The gate — the thing that was actually broken.
    expect(isSyncEntryComplete(items)).toBe(true)

    // And the item says WHY it is satisfied, rather than claiming a
    // document exists: not-applicable, with a recorded reason.
    const hireRight = itemFor('hire_right', items)
    expect(hireRight.status).toBe('complete')
    expect(hireRight.notApplicable).toBe(true)
    expect(hireRight.note).toBe(
      'Not required — this recording credits no hired producer or engineer.'
    )

    // The fixture really does carry no producer agreement — otherwise this
    // test would be asserting nothing.
    expect(FIVE_OTHER_ITEMS_COMPLETE.documents.some(d => d.type === 'hire_right')).toBe(false)
  })

  it('still FAILS for a project that DID hire a producer and has no signed agreement', () => {
    const items = readinessItemsForProject({
      ...FIVE_OTHER_ITEMS_COMPLETE,
      tracks: [HIRED_PRODUCER_TRACK],
    })

    expect(isSyncEntryComplete(items)).toBe(false)

    const hireRight = itemFor('hire_right', items)
    expect(hireRight.status).toBe('missing')
    expect(hireRight.notApplicable).toBeUndefined()
  })

  it('still FAILS when the hired collaborator is a mixing or mastering engineer, not a producer', () => {
    for (const track of [
      { ...SELF_PRODUCED_TRACK, mixing_engineer: 'Dee Mixdown' },
      { ...SELF_PRODUCED_TRACK, mastering_engineer: 'Ana Masters' },
    ]) {
      const items = readinessItemsForProject({ ...FIVE_OTHER_ITEMS_COMPLETE, tracks: [track] })
      expect(isSyncEntryComplete(items)).toBe(false)
      expect(itemFor('hire_right', items).status).toBe('missing')
    }
  })

  it('does NOT declare not-applicable from data the caller never fetched', () => {
    // No producers/mixing_engineer/mastering_engineer PROPERTIES at all —
    // a caller whose SELECT omitted those columns. "I did not look" must
    // not read as "there is nobody", so this keeps the pre-fix behaviour
    // and stays out of the catalogue.
    const items = readinessItemsForProject({
      ...FIVE_OTHER_ITEMS_COMPLETE,
      tracks: [{ id: 'track-1', isrc: null, iswc: null, metadata: SELF_PRODUCED_TRACK.metadata }],
    })

    expect(itemFor('hire_right', items).status).toBe('missing')
    expect(itemFor('hire_right', items).notApplicable).toBeUndefined()
    expect(isSyncEntryComplete(items)).toBe(false)
  })

  it('lets an EXISTING producer agreement outrank the derivation, whatever the credits say', () => {
    // The artist raised a hire_right document and has not signed it. That
    // document is their own evidence the requirement applies to this
    // project, and it beats "no producer is credited on the track row".
    const items = readinessItemsForProject({
      ...FIVE_OTHER_ITEMS_COMPLETE,
      documents: [...FIVE_OTHER_ITEMS_COMPLETE.documents, { type: 'hire_right', status: 'pending' }],
      tracks: [SELF_PRODUCED_TRACK],
    })

    const hireRight = itemFor('hire_right', items)
    expect(hireRight.status).toBe('warning')
    expect(hireRight.notApplicable).toBeUndefined()
    expect(isSyncEntryComplete(items)).toBe(false)
  })

  it('reaches the per-track sync checklist too, not only the project-level engine', () => {
    // syncReadinessForTrack() is what the STAFF worklist and the admit gate
    // read. If the hire credits did not flow through it, staff would still
    // see "Producer agreements — missing" on a song the buyer gate admits.
    const items = syncReadinessForTrack({
      type: 'single',
      track: SELF_PRODUCED_TRACK,
      assets: FIVE_OTHER_ITEMS_COMPLETE.assets,
      documents: FIVE_OTHER_ITEMS_COMPLETE.documents,
    })

    expect(items).toHaveLength(6)
    expect(isSyncEntryComplete(items)).toBe(true)
    expect(itemFor('hire_right', items).notApplicable).toBe(true)
  })
})

describe('defect 3 — the copyright item reads the document lifecycle', () => {
  // The real lifecycle, verified in source on 2026-09-10:
  //   'pending'  — "Mark as filed" / a generated CopyrightKit document. A
  //                self-declaration; POST .../documents refuses any other
  //                status, so every copyright document starts here.
  //   'signed'   — the eCO receipt PDF was uploaded (uploading IS the
  //                signing action, POST .../documents/[docId]/upload).
  //   'verified' — uploaded through /api/contracts/verify and the AI
  //                verification came back clean.
  // Both evidence states are reachable in the product, so gating on them
  // does not block everything — which is the risk that made this worth
  // investigating before changing.
  function copyrightStatusFor(documents: { type: string; status: string }[]) {
    const items = readinessItemsForProject({
      type: 'single',
      tracks: [SELF_PRODUCED_TRACK],
      assets: [{ type: 'cover_art' }],
      documents,
    })
    return itemFor('copyright', items).status
  }

  it('does NOT accept a PENDING registration — a self-declaration with nothing attached', () => {
    expect(copyrightStatusFor([{ type: 'copyright_registration', status: 'pending' }])).toBe(
      'warning'
    )
  })

  it('a pending registration does not open the entry gate', () => {
    const items = readinessItemsForProject({
      type: 'single',
      tracks: [SELF_PRODUCED_TRACK],
      assets: [{ type: 'cover_art' }],
      documents: [
        { type: 'copyright_registration', status: 'pending' },
        { type: 'split_sheet', status: 'signed' },
      ],
    })
    expect(isSyncEntryComplete(items)).toBe(false)
  })

  it('accepts SIGNED — the eCO receipt was uploaded', () => {
    expect(copyrightStatusFor([{ type: 'copyright_registration', status: 'signed' }])).toBe(
      'complete'
    )
  })

  it('accepts VERIFIED — uploaded through the contract verifier', () => {
    // Reachable via /api/contracts/verify, which writes status 'verified'.
    // If this read 'warning', the fix would block a registration that has
    // MORE evidence behind it than a plain upload.
    expect(copyrightStatusFor([{ type: 'copyright_registration', status: 'verified' }])).toBe(
      'complete'
    )
  })

  it('reads MISSING when no registration exists at all', () => {
    expect(copyrightStatusFor([])).toBe('missing')
  })

  it('reads WARNING when one of several registrations still has nothing attached', () => {
    expect(
      copyrightStatusFor([
        { type: 'copyright_registration', status: 'signed' },
        { type: 'copyright_registration', status: 'pending' },
      ])
    ).toBe('warning')
  })
})
