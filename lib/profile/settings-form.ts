// ── Artist Settings shared form model + pure tab logic ──────────────────
// The artist Settings page is split across three linkable routes
// (/settings, /settings/profile, /settings/payouts) that share one client
// provider mounted in app/(artist)/settings/layout.tsx. Everything in this
// module is PURE — no React, no fetch, no next/navigation — because that is
// the only way it can be tested: jest.config.js runs `testEnvironment:
// 'node'` and this repo has neither jsdom nor @testing-library, so the
// save-on-switch behavior cannot be exercised through a component at all.
// Keeping the orchestration here, with `save` and `navigate` injected, is
// what makes the two silently-regressing cases (a failed save must block
// navigation; a clean switch must not write) assertable.

import type { UserProfile, OpenTo, ProfileRole } from '@/types'

// ── Shared field classes ────────────────────────────────────────────────
// Both tab groups render inputs with these, so they cannot live in either
// group's component file without one importing from the other.
export const inputClass =
  'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-white/30'
export const labelClass = 'block text-xs font-medium uppercase tracking-wide text-white/40'

export type FormState = {
  artist_name: string
  genre: string
  location: string
  bio: string
  instagram_handle: string
  threads_handle: string
  tiktok_handle: string
  spotify_url: string
  career_stage: 1 | 2 | 3 | 4
  genres: string[]
  isrc_country_code: string
  isrc_registrant_code: string
  pro: string
  ipi: string
  publisher: string
  administrator: string
  mlc_id: string
  soundexchange_id: string
  isni: string
  // Generation prefixes (migration 082, 16-11) — self-assign_with_prefix
  // schemes draw from these; placed with the ISRC registrant fields per
  // the same edit surface, not a separate screen.
  gs1_company_prefix: string
  grid_issuer_code: string
  catalog_number_prefix: string
  legal_first_name: string
  legal_middle_name: string
  legal_last_name: string
  legal_name_suffix: string
  contact_phone: string
  mailing_address: string
  mailing_address_structured: Record<string, string> | null
  industry_roles: string[]
  roles: ProfileRole[]
  open_to: OpenTo[]
  allow_resharing: boolean
}

export function toForm(p: UserProfile): FormState {
  return {
    artist_name: p.artist_name ?? '',
    genre: p.genre ?? '',
    location: p.location ?? '',
    bio: p.bio ?? '',
    instagram_handle: p.instagram_handle ?? '',
    threads_handle: p.threads_handle ?? '',
    tiktok_handle: p.tiktok_handle ?? '',
    spotify_url: p.spotify_url ?? '',
    career_stage: p.career_stage ?? 1,
    genres: Array.isArray(p.genres) ? p.genres : [],
    isrc_country_code: p.isrc_country_code ?? '',
    isrc_registrant_code: p.isrc_registrant_code ?? '',
    pro: p.pro ?? '',
    ipi: p.ipi ?? '',
    publisher: p.publisher ?? '',
    administrator: p.administrator ?? '',
    mlc_id: p.mlc_id ?? '',
    soundexchange_id: p.soundexchange_id ?? '',
    isni: p.isni ?? '',
    gs1_company_prefix: p.gs1_company_prefix ?? '',
    grid_issuer_code: p.grid_issuer_code ?? '',
    catalog_number_prefix: p.catalog_number_prefix ?? '',
    legal_first_name: p.legal_first_name ?? '',
    legal_middle_name: p.legal_middle_name ?? '',
    legal_last_name: p.legal_last_name ?? '',
    legal_name_suffix: p.legal_name_suffix ?? '',
    contact_phone: p.contact_phone ?? '',
    mailing_address: (p.mailing_address as { raw?: string } | null)?.raw ?? '',
    mailing_address_structured: (p.mailing_address as Record<string, string> | null) ?? null,
    industry_roles: Array.isArray(p.industry_roles) ? p.industry_roles : [],
    roles: Array.isArray(p.roles) ? p.roles : [],
    open_to: Array.isArray(p.open_to) ? p.open_to : [],
    allow_resharing: p.allow_resharing ?? true,
  }
}

// ── Tabs ────────────────────────────────────────────────────────────────
// `segment` lines up with useSelectedLayoutSegment(), which returns null on
// the index route (/settings). Do NOT switch this to a usePathname() prefix
// test — '/settings' is a prefix of all three routes and would mark every
// tab active at once.
export type SettingsTabId = 'rights' | 'profile' | 'payouts'

export type SettingsTab = {
  id: SettingsTabId
  href: string
  label: string
  segment: string | null
}

export const SETTINGS_TABS: readonly SettingsTab[] = [
  { id: 'rights', href: '/settings', label: 'Rights & contracts', segment: null },
  { id: 'profile', href: '/settings/profile', label: 'Public profile', segment: 'profile' },
  { id: 'payouts', href: '/settings/payouts', label: 'Payouts', segment: 'payouts' },
] as const

// ── Field ownership ─────────────────────────────────────────────────────
// These two arrays ARE the split. A FormState key present in neither one is
// a key that silently stops being written the moment the page is split into
// tabs — no type error, no runtime error, the field just quietly stops
// saving. `genre` (singular, superseded by genres[] and inputless for a long
// time) is exactly that shape of trap, which is why it is listed explicitly
// below rather than dropped. The coverage guard in settings-form.test.ts
// ('every FormState key belongs to exactly one group') is what keeps a newly
// added field from landing nowhere.

// Legal Identity, Contact, Rights & Royalties, ISRC registrant, Release
// identifier prefixes — the /settings tab.
export const RIGHTS_FIELDS: readonly (keyof FormState)[] = [
  'legal_first_name',
  'legal_middle_name',
  'legal_last_name',
  'legal_name_suffix',
  'contact_phone',
  'mailing_address',
  'pro',
  'ipi',
  'publisher',
  'administrator',
  'mlc_id',
  'soundexchange_id',
  'isni',
  'isrc_country_code',
  'isrc_registrant_code',
  'gs1_company_prefix',
  'grid_issuer_code',
  'catalog_number_prefix',
] as const

// Public Profile, Profile Badges & Availability, Industry Roles, Links —
// the /settings/profile tab.
export const PUBLIC_FIELDS: readonly (keyof FormState)[] = [
  'artist_name',
  'genre',
  'genres',
  'location',
  'bio',
  'career_stage',
  'roles',
  'open_to',
  'allow_resharing',
  'industry_roles',
  'instagram_handle',
  'threads_handle',
  'tiktok_handle',
  'spotify_url',
] as const

// Client-only companion to `mailing_address`: there is no
// mailing_address_structured column and no such key in the API's
// EDITABLE_FIELDS allowlist. It participates in RIGHTS dirtiness and is
// folded into the rights payload's `mailing_address` value, but is never
// sent under its own key.
export const CLIENT_ONLY_FIELDS: readonly (keyof FormState)[] = [
  'mailing_address_structured',
] as const

// Keys whose values are arrays or objects, so `!==` compares identity
// rather than content.
const DEEP_COMPARE_KEYS: readonly (keyof FormState)[] = [
  'genres',
  'roles',
  'open_to',
  'industry_roles',
  'mailing_address_structured',
] as const

function fieldsForTab(tab: SettingsTabId): readonly (keyof FormState)[] {
  if (tab === 'rights') return [...RIGHTS_FIELDS, ...CLIENT_ONLY_FIELDS]
  if (tab === 'profile') return PUBLIC_FIELDS
  return []
}

function changed(key: keyof FormState, form: FormState, baseline: FormState): boolean {
  if (DEEP_COMPARE_KEYS.includes(key)) {
    return JSON.stringify(form[key]) !== JSON.stringify(baseline[key])
  }
  return form[key] !== baseline[key]
}

/**
 * True when any field owned by `tab` differs from the baseline. The payouts
 * tab owns no fields, so it is never dirty — leaving it never writes.
 */
export function isTabDirty(tab: SettingsTabId, form: FormState, baseline: FormState): boolean {
  return fieldsForTab(tab).some(key => changed(key, form, baseline))
}

/**
 * The PATCH body for one tab — only that tab's keys. sanitize() in
 * app/api/profile/route.ts skips any allowlisted key absent from the body
 * (`if (!(key in body)) continue`), so a partial body is already safe with
 * no backend change.
 */
export function buildTabPayload(tab: SettingsTabId, form: FormState): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  if (tab === 'payouts') return payload

  const fields = tab === 'rights' ? RIGHTS_FIELDS : PUBLIC_FIELDS
  for (const key of fields) {
    payload[key] = form[key]
  }

  if (tab === 'rights') {
    // Reproduces exactly what the single-form save sent: the structured
    // object when Google verified the address, else a raw wrapper, else
    // null for a blank field.
    const raw = form.mailing_address.trim()
    payload.mailing_address = raw ? (form.mailing_address_structured ?? { raw }) : null
  }

  return payload
}

// ── Save-on-switch ──────────────────────────────────────────────────────
export type SaveResult = { ok: true } | { ok: false; error: string }

export type TabSaver = {
  dirty: boolean
  save: () => Promise<SaveResult>
}

export type SaveThenNavigateResult = {
  navigated: boolean
  error: string | null
  writes: number
}

/**
 * The ordered savers to run when LEAVING `tab`.
 *
 * The public-profile tab returns two, and that is the point at which Privacy
 * joins save-on-switch: as its own request to /api/profile/visibility,
 * sequenced after the profile PATCH, never merged into it. Those two columns
 * have no authenticated UPDATE grant (migration 058), so folding them into
 * the /api/profile body would not just be untidy — it would silently not
 * write.
 *
 * Payouts owns no fields, so leaving it never writes.
 *
 * Kept pure and dependency-injected so the composition is assertable under
 * jest's node environment, where no component can be rendered.
 */
export function buildSaversForTab(
  tab: SettingsTabId,
  deps: {
    profileDirty: boolean
    saveProfile: () => Promise<SaveResult>
    visibilityDirty: boolean
    saveVisibility: () => Promise<SaveResult>
  }
): TabSaver[] {
  const profileSaver: TabSaver = { dirty: deps.profileDirty, save: deps.saveProfile }

  if (tab === 'rights') return [profileSaver]
  if (tab === 'profile') {
    return [profileSaver, { dirty: deps.visibilityDirty, save: deps.saveVisibility }]
  }
  return []
}

/**
 * Save every dirty saver, in order, and only then navigate.
 *
 * The failure path deliberately does NOT navigate. The owner chose
 * save-on-switch over a "you have unsaved changes" warn dialog precisely so
 * a failed write can never strand an edit on a page the artist has already
 * left — if the save fails, the artist must still be looking at the fields
 * that hold their values, with a retry-able error.
 *
 * `writes` is returned rather than inferred so the "a clean tab switch
 * issues zero writes and does not spin" guarantee is directly assertable.
 */
export async function saveThenNavigate(
  savers: readonly TabSaver[],
  navigate: () => void
): Promise<SaveThenNavigateResult> {
  const pending = savers.filter(s => s.dirty)

  if (pending.length === 0) {
    navigate()
    return { navigated: true, error: null, writes: 0 }
  }

  let writes = 0
  for (const saver of pending) {
    writes += 1
    const result = await saver.save()
    if (!result.ok) {
      return { navigated: false, error: result.error, writes }
    }
  }

  navigate()
  return { navigated: true, error: null, writes }
}
