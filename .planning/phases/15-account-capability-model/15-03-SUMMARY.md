---
phase: 15-account-capability-model
plan: "03"
subsystem: nav-unification
tags: [nav, capability-model, ui, d-05, d-06, d-07, d-08, d-09]
status: complete
dependency_graph:
  requires:
    - "Plan 01 — capability_grants table"
    - "Plan 02 — POST /api/capabilities/request (D-02 asymmetric gate)"
  provides:
    - "Capability-aware ArtistNav — hides rooms outside the account's capability set (D-08)"
    - "Unified sidebar — (industry) topbar layout retired (D-05)"
    - "CapabilityCta — D-09 footer entry point into the request flow"
  affects:
    - "Plan 04 — admin approval queue is the other half of the request flow this CTA opens"
tech_stack:
  added: []
  patterns:
    - "Server-component layout reads capability_grants via createServiceClient and passes capabilities as a plain string[] prop — never fetched client-side (T-15-11)"
    - "D-08 hides items entirely (array filter before render) rather than graying out disabled links"
    - "CapabilityCta reuses the INDUSTRY_ROLE_GROUPS chip picker pattern from MembersAdmin.tsx for the D-11 role pick"
key_files:
  created:
    - "components/nav/CapabilityCta.tsx"
  modified:
    - "components/nav/ArtistNav.tsx"
    - "app/(artist)/layout.tsx"
  moved:
    - "app/(industry)/opportunities/page.tsx -> app/(artist)/opportunities/page.tsx"
    - "app/(industry)/opportunities/new/page.tsx -> app/(artist)/opportunities/new/page.tsx"
    - "app/(industry)/opportunities/[opportunityId]/page.tsx -> app/(artist)/opportunities/[opportunityId]/page.tsx"
    - "app/(industry)/split-sheets/page.tsx -> app/(artist)/split-sheets/page.tsx"
  deleted:
    - "app/(industry)/layout.tsx"
decisions:
  - "D-06 cross-link implemented as a header note inside the moved split-sheets page ('Part of Contract Locker', linking to /contracts) rather than editing /contracts itself — the Contract Locker page was out of this plan's file scope (not listed in files_modified). The reciprocal link (Contract Locker -> Split Sheets) is a documented follow-up, not silently dropped."
  - "D-07's 'opportunities surfaced from the Antenna room' is satisfied at the URL/nav level (the pages now live under the unified sidebar with no new top-level nav item), but no cross-link was added from app/(artist)/antenna/page.tsx to /opportunities — that file was likewise out of this plan's file scope. Same follow-up pattern as D-06, recorded here rather than making an unplanned out-of-scope edit."
  - "CapabilityCta is not rendered when the sidebar is collapsed (component has no compact/icon-only variant) — matches the existing pattern where the profile footer's text fields are also conditionally hidden on collapse, avoiding a broken layout in the narrow rail."
metrics:
  duration: "~20 minutes"
  completed_date: "2026-07-12"
  tasks_completed: 2
  files_changed: 7
---

# Phase 15 Plan 03: Nav Unification + D-09 Capability CTA Summary

`ArtistNav` is now capability-aware: it takes a `capabilities: string[]` prop sourced server-side from `capability_grants` in `app/(artist)/layout.tsx`, and filters its item list so an account only ever sees rooms it can use (D-08). The separate `(industry)` topbar layout is retired (D-05); its three routes (opportunities list/new/detail, split sheets) moved into `(artist)` with URLs unchanged. A new `CapabilityCta` component gives accounts missing a capability a subtle footer entry point into the Plan 02 request flow (D-09).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Capability-aware ArtistNav + server-wired layout | `a1aea9c` | `components/nav/ArtistNav.tsx`, `app/(artist)/layout.tsx` |
| 2 | Relocate (industry) routes, retire industry layout, add D-09 CTA | `078e4c7` | 4 moved route files, `app/(industry)/layout.tsx` (deleted), `components/nav/CapabilityCta.tsx` (new), `components/nav/ArtistNav.tsx` (mount) |

## Key Artifacts

### `ArtistNav` — D-08 filtering

```typescript
type Item = {
  href: string; label: string; match: string
  Icon: (p: { gradient?: boolean; className?: string }) => React.ReactNode
  requiresCapability?: 'artist' | 'industry'
}
```

Artist-only rooms (Vault, Contract Locker, Collaborators, PitchPlug, Benchmarks, Launchpad, Rights Coach, Earnings) are tagged `requiresCapability: 'artist'`. Antenna and Settings are untagged — universal. Render loop:

```typescript
const visibleItems = ITEMS.filter(
  item => !item.requiresCapability || capabilities.includes(item.requiresCapability)
)
```

Items are removed entirely, not grayed out, per D-08's explicit instruction.

### `app/(artist)/layout.tsx` — server-side capability read

```typescript
const service = createServiceClient()
const { data: grants } = await service
  .from('capability_grants')
  .select('capability')
  .eq('profile_id', user.id)
  .eq('status', 'approved')
capabilities = (grants ?? []).map(g => g.capability)
```

No client-side fetch against `capability_grants` exists anywhere (T-15-11).

### `CapabilityCta` — D-09

`'use client'` component. Renders nothing if the account already holds both capabilities. Otherwise shows a small `+ Add {missing} access` button; clicking expands an inline panel reusing `INDUSTRY_ROLE_GROUPS` (from `@/lib/industry-roles`) as a toggleable chip picker, then POSTs `{ capability, role_slugs }` to `/api/capabilities/request`. Response handling:
- `201` + `status: 'approved'` → "Access granted — refresh to see your new rooms."
- `201` + `status: 'pending'` → "Request submitted for review."
- `409` → "You've already requested or have this capability."
- other non-OK → server's `error` message or a generic fallback.

Mounted in `ArtistNav` just above the profile footer `Link`, gated on `!collapsed`:

```tsx
{!collapsed && <CapabilityCta capabilities={capabilities} />}
```

### Route relocation

All four `git mv` moves preserved URLs exactly (`/opportunities`, `/opportunities/new`, `/opportunities/[opportunityId]`, `/split-sheets`) — `middleware.ts`'s `/split-sheets` protected-prefix entry needed no change. `app/(industry)/layout.tsx` deleted; the `app/(industry)/` directory no longer exists on disk.

## Verification Status

| Check | Status | Notes |
|-------|--------|-------|
| `npx tsc --noEmit` | PASS | Clean after clearing stale `.next/types` cache referencing the deleted `(industry)` routes |
| `app/(industry)/layout.tsx` absent | PASS | |
| `app/(industry)/` contains no route files | PASS | Directory removed |
| 4 moved files present at new `(artist)` paths | PASS | |
| `components/nav/CapabilityCta.tsx` exists, POSTs to `/api/capabilities/request` | PASS | |
| `grep -q "CapabilityCta" components/nav/ArtistNav.tsx` | PASS | |
| `/antenna` and `/settings` untagged in ITEMS | PASS | |

## Deviations from Plan

### D-06 / D-07 cross-links deferred (documented, not dropped)

Both `/contracts` (Contract Locker) and `app/(artist)/antenna/page.tsx` were out of this plan's `files_modified` scope. Rather than making unplanned edits to files this plan didn't declare, the D-06 intent was partially satisfied (a "Part of Contract Locker" header link was added to the moved split-sheets page itself, pointing to `/contracts`) and the reciprocal links are recorded here as follow-ups:
- Add a Split Sheets entry/link inside the Contract Locker page (`/contracts`).
- Add an opportunities-management link/section inside the Antenna page (`app/(artist)/antenna/page.tsx`) for industry-capable accounts.

Neither affects the security boundary (D-14/Plan 02 enforces access server-side regardless of nav discoverability) — this is purely an IA/discoverability polish item for a future small task.

## Manual-Only Verifications (per 15-VALIDATION.md)

No component-test infrastructure exists for this codebase, so the following require manual verification and are not covered by any automated check in this plan:
- [ ] Load as an industry-only account — confirm Vault, Launchpad, PitchPlug, Contract Locker, Collaborators, Benchmarks, Rights Coach, and Earnings are absent from the sidebar; only Antenna + Settings show.
- [ ] Load as an artist-only account — confirm the "Add industry access" CTA appears in the footer, and that no industry-only affordance (opportunity posting) is reachable via nav.
- [ ] Load as a dual-capability account — confirm CapabilityCta renders nothing.
- [ ] Confirm `/opportunities`, `/opportunities/new`, `/opportunities/[id]`, and `/split-sheets` all still resolve correctly under the unified sidebar (URLs unchanged).
- [ ] Submit a capability request via the CapabilityCta panel end-to-end against a live Supabase instance and confirm the three response states (instant grant, pending, duplicate 409) render the correct message.

## Known Stubs

None — `CapabilityCta` is fully wired to the live `/api/capabilities/request` route from Plan 02, not a placeholder.

## Threat Flags

| Threat | Mitigation | Status |
|--------|-----------|--------|
| T-15-10: nav hides a room but its route stays reachable by URL | Not relied upon for security — Plan 02's `hasCapability()` server check (D-14) is the actual boundary; this plan is UI-only | MITIGATED (by Plan 02, not this plan) |
| T-15-11: client-side fetch of `capability_grants` | Capability set read exclusively server-side in `app/(artist)/layout.tsx`; passed as a prop | MITIGATED |
| T-15-12: `CapabilityCta` POSTing a spoofed target `profile_id` | CTA sends only `{ capability, role_slugs }`; target identity derived server-side from the session (Plan 02) | MITIGATED |

## Self-Check: PASSED

- [x] `components/nav/ArtistNav.tsx` — modified, `requiresCapability` + `visibleItems` + `CapabilityCta` mount present
- [x] `app/(artist)/layout.tsx` — modified, reads `capability_grants` server-side
- [x] `components/nav/CapabilityCta.tsx` — found, POSTs to `/api/capabilities/request`, reuses `INDUSTRY_ROLE_GROUPS`
- [x] `app/(industry)/layout.tsx` — absent
- [x] `app/(industry)/` — no route files remain
- [x] 4 moved route files present at `(artist)` paths, URLs unchanged
- [x] Commits `a1aea9c`, `078e4c7` — found in git log
- [x] `npx tsc --noEmit` — zero errors project-wide
