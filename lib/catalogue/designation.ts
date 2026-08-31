// ─── Writer designations — the DDEX / PRO-compliant role vocabulary ─────
// A writer party on a split sheet carries a role designation, so the sheet
// registers with a PRO (via the CWR writer-designation codes) and exports
// through a distributor's DDEX feed (via the DDEX work-contributor roles)
// with no re-keying. Owner directive 2026-08-30: keep credits + splits
// DDEX/PRO-compliant. This module is the single source of that vocabulary —
// pure, no I/O — consumed by the promote route, the roster picker, and any
// future export. Percentages are NEVER decided here (CAT-Q1a); this is only
// about WHAT a writer did, never how much they own.

export const WRITER_DESIGNATIONS = [
  'composer',
  'lyricist',
  'composer_lyricist',
  'arranger',
  'adapter',
  'translator',
] as const

export type WriterDesignation = (typeof WRITER_DESIGNATIONS)[number]

/** The three shown first in the picker; the rest sit behind a "more roles" reveal. */
export const PRIMARY_WRITER_DESIGNATIONS: WriterDesignation[] = [
  'composer',
  'lyricist',
  'composer_lyricist',
]

/** Formal label — the DDEX/PRO name, used where the credit is displayed. */
export const WRITER_DESIGNATION_LABELS: Record<WriterDesignation, string> = {
  composer: 'Composer',
  lyricist: 'Lyricist',
  composer_lyricist: 'Composer / Lyricist',
  arranger: 'Arranger',
  adapter: 'Adapter',
  translator: 'Translator',
}

/** Plain-language prompt label — what the writer actually did, for the picker. */
export const WRITER_DESIGNATION_PLAIN: Record<WriterDesignation, string> = {
  composer: 'Music',
  lyricist: 'Lyrics',
  composer_lyricist: 'Both music and lyrics',
  arranger: 'Arrangement',
  adapter: 'Adaptation',
  translator: 'Translation',
}

/** CWR (CISAC Common Works Registration) writer-designation codes — for PRO registration. */
export const WRITER_DESIGNATION_CWR: Record<WriterDesignation, string> = {
  composer: 'C',
  lyricist: 'A',
  composer_lyricist: 'CA',
  arranger: 'AR',
  adapter: 'AD',
  translator: 'TR',
}

/** DDEX work-contributor roles (Allowed Value Sets) — for a distributor's DDEX feed. */
export const WRITER_DESIGNATION_DDEX: Record<WriterDesignation, string> = {
  composer: 'Composer',
  lyricist: 'Lyricist',
  composer_lyricist: 'ComposerLyricist',
  arranger: 'Arranger',
  adapter: 'Adapter',
  translator: 'Translator',
}

/** Narrows unknown input to a valid designation, or null. */
export function asWriterDesignation(value: unknown): WriterDesignation | null {
  return typeof value === 'string' && (WRITER_DESIGNATIONS as readonly string[]).includes(value)
    ? (value as WriterDesignation)
    : null
}
