// ─── The public sync inbox ────────────────────────────────────────────────
// One address, defined once. Owner-created 2026-10-11 for sync questions and
// requests: sync representation, licensing a song, and getting a song into the
// catalog.
//
// It serves BOTH sides, which is why it lives in lib/sync-library/ rather than
// under lib/buyer/ — a supervisor asking about a label-signed artist and an
// artist asking how to get a song in both land here.
//
// Defined as a constant because it appears on several public surfaces and a
// mistyped address on one of them fails silently: the sender gets a bounce the
// product never sees, and we would never learn the enquiry existed.
//
// SPAM NOTE, stated so the tradeoff is a decision rather than a surprise: a
// plain mailto: on a public page will be harvested. That is the normal cost of
// being reachable and the owner chose it knowingly. If the volume becomes a
// problem the fix is a contact form posting to this inbox, not obfuscating the
// address.
export const SYNC_CONTACT_EMAIL = 'sync@funun.studio'

/** `mailto:` href with a subject, so an enquiry arrives already labelled. */
export function syncContactHref(subject?: string): string {
  return subject
    ? `mailto:${SYNC_CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`
    : `mailto:${SYNC_CONTACT_EMAIL}`
}
