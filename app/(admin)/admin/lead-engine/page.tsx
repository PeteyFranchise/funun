import { redirect } from 'next/navigation'

// ─── /admin/lead-engine — retired into Crate Requests (R10) ───────────────
// The read-only brief feed this page used to render is now the intent-
// ranked, own-book, guest-aware Crate Requests room
// (app/(admin)/admin/crate-requests/page.tsx). R10 explicitly absorbs this
// surface rather than leaving two parallel feeds — every prior link/bookmark
// to /admin/lead-engine lands on the real room instead of a 404 or a stale
// read-only view.
export default function LeadEnginePage() {
  redirect('/admin/crate-requests')
}
