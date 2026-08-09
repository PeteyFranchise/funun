// ─── Shared HTML-escape helper for transactional email templates ──────────
// Extracted from the identical esc() previously duplicated in
// lib/email/industryInvite.ts and lib/email/staffInvite.ts (27-RESEARCH
// "Don't Hand-Roll" — a 5th copy must not appear when 27-05's three new
// branded artist-invite templates are built; they import this module
// directly). Escapes the four characters an untrusted interpolated value
// (displayName, actionLink, etc.) needs escaped before landing inside an
// HTML email body: &, <, >, ".
export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
