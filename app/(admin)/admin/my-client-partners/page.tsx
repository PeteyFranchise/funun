import { redirect } from 'next/navigation'

// ─── Retired (31.1 plan 04, D-31.1-01) ─────────────────────────────────────
// Folded into the consolidated Client Partners room's My tab. This page's
// former responsibility (own-book scope, force-dynamic, 'it'/no-role
// redirect) now lives in app/(admin)/admin/client-partners/page.tsx +
// lib/client-partners/signals.ts's loadBook(). Kept as a thin redirect so
// any bookmarked/linked URL still lands somewhere useful.
export default function LegacyMyClientPartnersRedirect() {
  redirect('/admin/client-partners')
}
