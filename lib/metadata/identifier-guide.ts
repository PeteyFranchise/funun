// ─── Identifier guide — content + DDEX level map ─────────────────────
// The single source of truth for every industry identifier Funūn stores
// or references: what it identifies, which DDEX level it lives at, who
// issues it, how to obtain one, what it unlocks, and — the reason this
// module exists rather than a tooltip string — who should GENERATE it
// inside Funūn, who should NOT, and where to import it from instead.
//
// Consumed by components/vault/IdentifierGuide.tsx (MetadataStudio inline
// popovers + the full identifiers reference page). Pure, client-safe
// content: no Node deps, no imports from route code.
//
// COPY CONSTRAINT (D-16d): explain what each body does and how the
// process works, and link out. Never recommend which PRO, society, or
// distributor to choose — that is a consequential personal decision (see
// app/(artist)/vault/[projectId]/rights/page.tsx for the precedent this
// follows). No fees or turnaround times — those change and would go
// stale silently.

export type DdexLevel = 'party' | 'work' | 'resource' | 'release'

export const DDEX_LEVELS: DdexLevel[] = ['party', 'work', 'resource', 'release']

// Who mints this identifier, per D-16e/D-16f:
//   • platform_issued        — Funūn mints it under Funūn's OWN prefix/code
//                               (GRid only; see D-16f).
//   • self_assign_with_prefix — Funūn mints it, but only from a prefix the
//                               ARTIST holds (UPC, ISRC).
//   • no_authority            — no issuing body exists at all; purely
//                               self-invented (Catalog number).
//   • centrally_allocated     — allocated by a central body via a
//                               registration process; Funūn NEVER mints
//                               these, structurally, no override.
export type AssignmentMode =
  | 'platform_issued'
  | 'self_assign_with_prefix'
  | 'no_authority'
  | 'centrally_allocated'

export type IdentifierAssignment = {
  mode: AssignmentMode
  /** e.g. 'GS1 company prefix' — null when nothing is required to generate. */
  prefixRequired: string | null
  /** Who genuinely benefits from minting this in Funūn. */
  whoShouldGenerate: string
  /** Who must NOT, and the concrete harm if they do. */
  whoShouldNotGenerate: string
  /** Where it comes from instead, for everyone else. */
  importFrom: string
}

export type IdentifierGuideEntry = {
  id: string
  label: string
  ddexLevel: DdexLevel
  identifies: string
  issuedBy: string
  howToGet: string
  unlocks: string
  formatExample: string
  officialUrl: string
  /** Column/JSONB path Funūn persists it to, or null for informational-only entries. */
  storedAt: string | null
  assignment: IdentifierAssignment
  /** Optional extra honesty note surfaced alongside the entry (e.g. placeholder caveats). */
  note?: string
}

// ─── Every identifier Funūn stores as a real column/JSONB path ──────────
// (dpid and isan are deliberately excluded: dpid is environment config,
// not artist data; isan is informational-only, Funūn tracks neither.)
// The stored-identifier sync test asserts this list and the guide's
// storedAt-bearing entries stay in lockstep — adding a stored identifier
// without updating both fails CI.
export const STORED_IDENTIFIER_IDS = [
  'ipi',
  'isni',
  'ipn',
  'mlc_id',
  'iswc',
  'isrc',
  'upc',
  'grid',
  'catalog_number',
] as const

// The generator's supported scheme list (Task 4b, lib/metadata/generate.ts
// mirrors this exact set as its canonical scheme type). Defined here so
// the disjointness-from-centrally_allocated invariant is enforced at the
// single source of truth, not re-derived and risking drift.
export const GENERATABLE_SCHEME_IDS = ['grid', 'upc', 'catalog_number', 'isrc'] as const

export const IDENTIFIER_GUIDE: Record<string, IdentifierGuideEntry> = {
  // ─── PARTY level ────────────────────────────────────────────────────
  ipi: {
    id: 'ipi',
    label: 'IPI / CAE',
    ddexLevel: 'party',
    identifies: "A songwriter or publisher, for royalty attribution on compositions.",
    issuedBy: "CISAC, through the writer's or publisher's PRO.",
    howToGet:
      'Obtained automatically when you join a PRO (ASCAP, BMI, SESAC, or another performing rights organization) — the PRO assigns your IPI/CAE number as part of membership.',
    unlocks: 'Correct writer attribution on PRO and MLC registrations.',
    formatExample: '00378426339',
    officialUrl: 'https://www.cisac.org',
    storedAt: 'tracks.metadata.composers[].ipi and user_profiles.ipi',
    assignment: {
      mode: 'centrally_allocated',
      prefixRequired: null,
      whoShouldGenerate: 'No one — Funūn never mints an IPI.',
      whoShouldNotGenerate:
        'Everyone: a fabricated IPI passes format validation, then fails when your PRO or the MLC tries to match it, and can misattribute royalties in the interim.',
      importFrom: 'Your PRO, once you join and register as a writer or publisher.',
    },
  },
  isni: {
    id: 'isni',
    label: 'ISNI',
    ddexLevel: 'party',
    identifies:
      'Any public party — a recording artist, label, or publisher — for disambiguation across databases.',
    issuedBy: 'The ISNI International Agency, via a registration agency.',
    howToGet:
      'Apply directly through an ISNI registration agency, or receive one indirectly through a distributor, library, or collecting society that already assigns them.',
    unlocks: 'Disambiguation between same-named artists across databases and services.',
    formatExample: '0000 0001 2103 2683',
    officialUrl: 'https://isni.org',
    storedAt: 'tracks.metadata.performers[].isni and user_profiles.isni',
    assignment: {
      mode: 'centrally_allocated',
      prefixRequired: null,
      whoShouldGenerate: 'No one — Funūn never mints an ISNI.',
      whoShouldNotGenerate:
        'Everyone: a fabricated ISNI passes format validation, then fails to resolve in the real ISNI database, and can be confused with another party\'s real record.',
      importFrom:
        'The ISNI International Agency, or a distributor, library, or PRO that has already assigned you one.',
    },
  },
  ipn: {
    id: 'ipn',
    label: 'IPN',
    ddexLevel: 'party',
    identifies: 'A performer, for neighbouring-rights royalty attribution.',
    issuedBy:
      "The performer's neighbouring-rights collecting society (e.g. SoundExchange in the US, or the equivalent society elsewhere).",
    howToGet: 'Assigned when you register as a performer with a neighbouring-rights collecting society.',
    unlocks: 'Featured and non-featured performer royalty attribution on neighbouring-rights registrations.',
    formatExample: 'Format varies by society',
    officialUrl: 'https://www.soundexchange.com',
    storedAt: 'tracks.metadata.performers[].ipn',
    assignment: {
      mode: 'centrally_allocated',
      prefixRequired: null,
      whoShouldGenerate: 'No one — Funūn never mints an IPN.',
      whoShouldNotGenerate:
        'Everyone: a fabricated IPN fails at the collecting society and can misattribute neighbouring-rights royalties.',
      importFrom: 'Your neighbouring-rights collecting society, when you register as a performer.',
    },
  },
  mlc_id: {
    id: 'mlc_id',
    label: 'MLC Member ID',
    ddexLevel: 'party',
    identifies: 'A rightsholder registered with The MLC (the US mechanical licensing collective).',
    issuedBy: 'The Mechanical Licensing Collective (The MLC).',
    howToGet: 'Register as a member at themlc.com.',
    unlocks: 'Mechanical royalty collection and matching for US streaming and downloads.',
    formatExample: 'MLC-XXXXXXXX',
    officialUrl: 'https://www.themlc.com',
    storedAt: 'user_profiles.mlc_id',
    assignment: {
      mode: 'centrally_allocated',
      prefixRequired: null,
      whoShouldGenerate: 'No one — Funūn never mints an MLC Member ID.',
      whoShouldNotGenerate:
        'Everyone: a fabricated MLC Member ID fails at registration and can misattribute mechanical royalties.',
      importFrom: 'The MLC, once you register as a member.',
    },
  },
  dpid: {
    id: 'dpid',
    label: 'DPID (DDEX Party ID)',
    ddexLevel: 'party',
    identifies: 'A company inside DDEX message exchange — labels, distributors, and other DDEX-member organizations.',
    issuedBy: 'DDEX, to its members.',
    howToGet: 'Register as a DDEX member and request a Party ID.',
    unlocks: 'Correctly attributed sender/recipient identity inside DDEX ERN delivery messages.',
    formatExample: 'PADPIDA0000000000Z',
    officialUrl: 'https://ddex.net',
    storedAt: null,
    assignment: {
      mode: 'centrally_allocated',
      prefixRequired: null,
      whoShouldGenerate:
        'No one on your team, personally — this is a label/distributor-level identifier most independent artists never hold.',
      whoShouldNotGenerate:
        'Everyone: Funūn reads its own sender DPID from the DDEX_DPID environment variable and falls back to a documented placeholder in ERN exports until Funūn registers its own.',
      importFrom: "DDEX, if your organization becomes a member; otherwise this identifies Funūn itself in exports, not you.",
    },
    note:
      'Environment config, not artist data. A null/placeholder DPID must never be mistaken for a registered identifier in real DDEX delivery.',
  },

  // ─── WORK level ─────────────────────────────────────────────────────
  iswc: {
    id: 'iswc',
    label: 'ISWC',
    ddexLevel: 'work',
    identifies: 'The underlying song as written — the composition, independent of any specific recording of it.',
    issuedBy: "CISAC, allocated centrally and returned through the writer's PRO after the work is registered.",
    howToGet: 'Register the work with your PRO; the PRO submits it and returns the CISAC-issued ISWC.',
    unlocks: 'Performance (PRO) and mechanical (MLC) royalty matching for the composition.',
    formatExample: 'T-034.524.680-1',
    officialUrl: 'https://www.iswc.org',
    storedAt: 'tracks.iswc',
    assignment: {
      mode: 'centrally_allocated',
      prefixRequired: null,
      whoShouldGenerate: 'No one — Funūn never mints an ISWC; it only validates and formats the check digit.',
      whoShouldNotGenerate:
        'Everyone: a self-assigned ISWC can pass the check-digit test, then fail PRO/MLC matching, and leave royalties unmatched.',
      importFrom: 'Your PRO, after registering the composition.',
    },
  },

  // ─── RESOURCE level ─────────────────────────────────────────────────
  isrc: {
    id: 'isrc',
    label: 'ISRC',
    ddexLevel: 'resource',
    identifies: 'One specific recording of a song — a remix, live version, or re-record each needs its own.',
    issuedBy: 'The national ISRC agency (in the US, the RIAA via usisrc.org).',
    howToGet:
      'Apply for a registrant code from your national ISRC agency, then self-assign codes under it — or let your distributor assign one for you at delivery.',
    unlocks: 'Streaming analytics, SoundExchange digital-performance royalties, and YouTube Content ID matching.',
    formatExample: 'US-S1Z-26-00014',
    officialUrl: 'https://www.usisrc.org',
    storedAt: 'tracks.isrc',
    assignment: {
      mode: 'self_assign_with_prefix',
      prefixRequired: 'Registrant code from your national ISRC agency',
      whoShouldGenerate:
        'An artist who holds their own ISRC registrant code and wants codes that stay theirs across distributor changes.',
      whoShouldNotGenerate:
        "No one is barred outright — but note the tradeoff: many distributors assign ISRCs free, in which case those codes are minted under the distributor's registrant code rather than yours.",
      importFrom: "Your distributor, if you don't hold your own registrant code — most assign ISRCs free at delivery.",
    },
  },

  // ─── RELEASE level ──────────────────────────────────────────────────
  upc: {
    id: 'upc',
    label: 'UPC / EAN',
    ddexLevel: 'release',
    identifies: 'The release as a retail product — the barcode DSPs and stores use for shelf identity.',
    issuedBy: 'GS1, via a company prefix; distributors also supply one at delivery under their own prefix.',
    howToGet:
      'Usually supplied free by your distributor at delivery. Can also be bought directly from GS1 if you want to hold your own prefix.',
    unlocks: 'Store/DSP shelf identity and chart reporting.',
    formatExample: '810023456789',
    officialUrl: 'https://www.gs1.org',
    storedAt: 'vault_projects.upc',
    assignment: {
      mode: 'self_assign_with_prefix',
      prefixRequired: 'Your own GS1 company prefix',
      whoShouldGenerate: 'Only an artist or label that holds their own GS1 company prefix.',
      whoShouldNotGenerate:
        "Anyone without a GS1 prefix: a UPC's leading digits ARE a company prefix owned by a specific company, so fabricating one emits a barcode under someone else's prefix — it will pass check-digit validation and still be wrong, and can collide with a real product. Funūn deliberately holds no GS1 prefix of its own and will never issue a UPC: Funūn is not your distributor, and a Funūn-issued UPC would compete with the one your distributor assigns at delivery — a release can only have one.",
      importFrom: 'Your distributor, who assigns one free at delivery — this is how most independent artists get theirs.',
    },
  },
  grid: {
    id: 'grid',
    label: 'GRid',
    ddexLevel: 'release',
    identifies: 'The Global Release Identifier — the digital-release counterpart to UPC.',
    issuedBy: 'IFPI / the International GRid Authority, via an issuer code; typically supplied by a distributor.',
    howToGet:
      'Funūn holds its own GRid issuer code and mints release numbers under it on your behalf, distributor-style, at no cost and requiring no prefix of your own. A label that already holds its own issuer code can use theirs instead.',
    unlocks: 'Digital-release identity in DDEX delivery and distributor systems.',
    formatExample: 'A1-2425G-ABC1234002-M',
    officialUrl: 'https://www.ifpi.org',
    storedAt: 'vault_projects.grid',
    assignment: {
      mode: 'platform_issued',
      prefixRequired: null,
      whoShouldGenerate:
        'Any artist releasing through Funūn — the default path is platform-issued, so no prefix or cost to you. A label that already holds its own GRid issuer code should use theirs instead.',
      whoShouldNotGenerate:
        "No one needs to avoid it structurally, but don't mint a second GRid if your distributor already supplied one for this release — one release, one GRid.",
      importFrom: 'Your distributor, if they already supplied a GRid for this release — enter theirs rather than minting a second one.',
    },
    note:
      'The resulting code says Funūn allocated this release identifier: Funūn guarantees it is never reused, and it remains valid and attributable even if you later leave Funūn. Unavailable until Funūn registers its own issuer code (deferred — see phase decisions).',
  },
  catalog_number: {
    id: 'catalog_number',
    label: 'Catalog number',
    ddexLevel: 'release',
    identifies: "The label's own internal release number — a purely internal reference, not looked up by any external database.",
    issuedBy: 'No issuing body — self-assigned.',
    howToGet: 'Set your own label prefix in settings; Funūn sequences the numbers under it.',
    unlocks: 'A consistent internal reference across your catalog, useful for anyone releasing regularly.',
    formatExample: 'FUN-0007',
    officialUrl: 'https://en.wikipedia.org/wiki/Catalog_number',
    storedAt: 'vault_projects.catalog_number',
    assignment: {
      mode: 'no_authority',
      prefixRequired: 'Your own label/catalog prefix (self-defined, e.g. "FUN")',
      whoShouldGenerate: 'Anyone releasing regularly who wants a consistent internal reference.',
      whoShouldNotGenerate: "An artist signed to a label — use the label's number instead of inventing your own.",
      importFrom: "Your label, if you're signed to one.",
    },
  },

  // ─── Informational-only (not stored) ───────────────────────────────
  isan: {
    id: 'isan',
    label: 'ISAN',
    ddexLevel: 'work',
    identifies: 'An audiovisual work (film, TV, or similar) — not a music-specific identifier.',
    issuedBy: 'The ISAN International Agency.',
    howToGet: 'Registered by the film/TV production or its representative through an ISAN registration agency.',
    unlocks: 'Cross-industry identification of the audiovisual work a sync placement is licensed into.',
    formatExample: 'ISAN 0000-0000-401A-0000-7-0000-0000-Y',
    officialUrl: 'https://www.isan.org',
    storedAt: null,
    assignment: {
      mode: 'centrally_allocated',
      prefixRequired: null,
      whoShouldGenerate: 'No one — Funūn does not track or mint ISAN codes.',
      whoShouldNotGenerate: 'Not applicable — this identifies the film/TV production licensing your music, not your release.',
      importFrom: 'The licensee (studio/production) that registers the audiovisual work, if you ever need to reference one.',
    },
    note:
      'Context only, since sync buyers licensing to film/TV may mention it — Funūn does not store or manage ISAN codes for your releases.',
  },
}

/** All entries at a given DDEX level, in insertion order. */
export function getIdentifiersForLevel(level: DdexLevel): IdentifierGuideEntry[] {
  return Object.values(IDENTIFIER_GUIDE).filter(e => e.ddexLevel === level)
}

/** A single entry by id, or null if unknown. */
export function getIdentifierEntry(id: string): IdentifierGuideEntry | null {
  return IDENTIFIER_GUIDE[id] ?? null
}
