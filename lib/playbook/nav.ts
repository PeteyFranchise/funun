// ─── Playbook nav — single source for Rail 2 rooms + IT sub-pages ─────────
// Phase 33 (33-04). Pure data — no StaffRole import, deliberately decoupled
// from the role type (33-CONTEXT.md D-05/D-06). Whether the IT room is
// visible at all is a render-time decision made by the caller (the 33-05
// layout, from getStaffRole) — this module never gates itself.

export type PlaybookRoomId = 'company-wide' | 'ar' | 'ae-sales' | 'it-team' | 'tms' | 'leadership'

export type PlaybookRoom = {
  id: PlaybookRoomId
  label: string
  // D-05: five of the six rooms are "Coming soon" inert ghosts in v1.
  comingSoon: boolean
  // D-06: only the IT Team room is role-conditional (leadership + it).
  itGated: boolean
}

// The six mockup rooms, in mockup order (playbook-double-sidebar.html).
// Exactly five are comingSoon; only IT Team is itGated and NOT comingSoon.
export const PLAYBOOK_ROOMS: PlaybookRoom[] = [
  { id: 'company-wide', label: 'Company-wide', comingSoon: true, itGated: false },
  { id: 'ar', label: 'A&R', comingSoon: true, itGated: false },
  { id: 'ae-sales', label: 'AE / Sales', comingSoon: true, itGated: false },
  { id: 'it-team', label: 'IT Team', comingSoon: false, itGated: true },
  { id: 'tms', label: 'TMS', comingSoon: true, itGated: false },
  { id: 'leadership', label: 'Leadership', comingSoon: true, itGated: false },
]

export type ItSubpageSlug =
  | 'dashboard'
  | 'vendor-directory'
  | 'vendor-health'
  | 'runbook'
  | 'operating-rhythm'
  | 'thresholds'

export type ItSubpage = {
  slug: ItSubpageSlug
  label: string
  href: string
}

// The 6 IT sub-pages, in order — dashboard is the room's index page
// (33-CONTEXT.md D-06). Route segments live under /admin/playbook/it/*.
// vendor-health (260826-2qm) sits directly after vendor-directory — the
// static directory and its live per-vendor credential-check counterpart
// belong adjacent.
export const IT_SUBPAGES: ItSubpage[] = [
  { slug: 'dashboard', label: 'Monitoring Dashboard', href: '/admin/playbook/it/dashboard' },
  { slug: 'vendor-directory', label: 'Vendor Directory', href: '/admin/playbook/it/vendor-directory' },
  { slug: 'vendor-health', label: 'Vendor Health', href: '/admin/playbook/it/vendor-health' },
  { slug: 'runbook', label: 'Incident Runbook', href: '/admin/playbook/it/runbook' },
  { slug: 'operating-rhythm', label: 'Operating Rhythm', href: '/admin/playbook/it/operating-rhythm' },
  { slug: 'thresholds', label: 'Thresholds & Severity', href: '/admin/playbook/it/thresholds' },
]

// D-10: page → file map. The Monitoring Dashboard AND Vendor Health
// (260826-2qm) are bespoke React (not a markdown render) so neither has an
// entry here — only the 4 doc pages map to their docs/observability/*.md
// single source of truth.
export const DOC_PAGE_FILE: Record<Exclude<ItSubpageSlug, 'dashboard' | 'vendor-health'>, string> = {
  'vendor-directory': 'VENDOR-DIRECTORY.md',
  runbook: 'RUNBOOK.md',
  'operating-rhythm': 'OPERATING-RHYTHM.md',
  thresholds: 'THRESHOLDS-AND-SEVERITY.md',
}
