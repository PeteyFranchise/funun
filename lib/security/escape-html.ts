// ─── escapeHtml — XSS mitigation for interpolated untrusted values ─────────
// Escapes the five characters an untrusted value needs neutralized before it
// is interpolated into a string that will be rendered as HTML (e.g. a toast
// message fed to dangerouslySetInnerHTML, or any innerHTML sink). Use this on
// user/artist-controlled content (track titles, labels, names) rendered on
// public/buyer/staff surfaces.
//
// This is the security-surface twin of lib/email/esc.ts (which escapes the same
// characters for transactional-email bodies); kept separate so a client bundle
// never pulls in the email module, and so the two concerns can evolve
// independently. Coerces null/undefined to '' so a missing field never throws.
export function escapeHtml(s: string | null | undefined): string {
  return (s == null ? '' : String(s))
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
