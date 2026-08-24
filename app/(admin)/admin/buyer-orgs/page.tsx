import { redirect } from 'next/navigation'

// ─── Retired (31.1 plan 04, D-31.1-01) ─────────────────────────────────────
// Folded into the consolidated Client Partners room's leadership-only All
// tab. The leadership create-org action is preserved there (Client
// PartnersRoom's CreateClientPartnerPanel, same /api/admin/buyer-orgs POST
// route); per-org AE assignment moves to ClientPartnersList's Assigned-AE
// column + the plan 06 assign panel. Kept as a thin redirect so any
// bookmarked/linked URL still lands somewhere useful.
export default function LegacyBuyerOrgsRedirect() {
  redirect('/admin/client-partners')
}
