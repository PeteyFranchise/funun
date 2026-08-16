// ─── Guest viewer-key cookie (31-13, R13) ──────────────────────────────────
// The single-sourced cookie name shared between the SSR page (reads it via
// next/headers cookies() to hydrate a returning guest's own reactions) and
// the client player (mints + persists it via document.cookie on first
// visit). NOT a fingerprint, NOT a login — a random per-browser id used
// only to correlate a guest's own reaction rows across visits to the SAME
// Selects link (consent-first, mirrors [[project_guest_lead_identification]]
// — "shared-link attribution", never fingerprinting or bought data).
export const SELECTS_VIEWER_COOKIE = 'funun_svk'
