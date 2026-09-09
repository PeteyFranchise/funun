// ─────────────────────────────────────────────────────────────────────────
// Green Room placement constants and types — CLIENT-SAFE
//
// Split out of `placements-admin.ts` by phase 38.0.3 plan 04.
//
// WHY THIS FILE EXISTS. `components/admin/PlacementAdmin.tsx` is a
// `'use client'` component and needs these values for its form. It used to
// import them from `placements-admin.ts`. That was fine while that module
// imported nothing but a type — but plan 04 gave it a real dependency on
// `@/lib/supabase/server`, which imports `next/headers`, which cannot appear
// in a client bundle. The production build failed on exactly that, and
// `tsc --noEmit` cannot see it because it is a bundler constraint, not a
// type error.
//
// RULE FOR THIS FILE: it must never import anything that touches
// `next/headers`, `next/server`, the service-role key, or any other
// server-only module. If you need to add something that does, it belongs in
// `placements-admin.ts` instead. Client components import from HERE;
// server code may import from either.
// ─────────────────────────────────────────────────────────────────────────

export const PLACEMENT_KIND_VALUES = ['featured', 'sponsored', 'partner', 'program', 'opportunity'] as const
export type PlacementKind = (typeof PLACEMENT_KIND_VALUES)[number]

export const PLACEMENT_STATUS_VALUES = ['draft', 'active', 'paused', 'archived'] as const
export type PlacementStatus = (typeof PLACEMENT_STATUS_VALUES)[number]

export const PLACEMENT_DESTINATION_VALUES = ['profile', 'project', 'track', 'opportunity', 'post', 'external'] as const
export type PlacementDestinationType = (typeof PLACEMENT_DESTINATION_VALUES)[number]

export const PLACEMENT_LABEL_MAX = 80
export const PLACEMENT_TITLE_MAX = 160
export const PLACEMENT_BODY_MAX = 500
export const PLACEMENT_PRIORITY_MIN = -100
export const PLACEMENT_PRIORITY_MAX = 100
