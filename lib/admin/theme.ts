// ─── Admin (Team Console) theme cookie ─────────────────────────────────
// DARK is the Team Console default (owner decision, 2026-08-05) — mirrors
// today's /admin + the rest of the app; light is opt-in. A Team Member
// flips to light via AdminThemeToggle, which writes this cookie; the
// layout reads it server-side via readAdminTheme so the correct
// `data-theme` attribute is present on the very first paint -- no
// dark->light flash. Deliberately a separate cookie from
// BUYER_THEME_COOKIE (lib/buyers/theme.ts) -- the two principal types'
// theme preferences are not coupled (T-25-13).
export const ADMIN_THEME_COOKIE = 'fnadmin_theme'

export function readAdminTheme(value: string | undefined | null): 'light' | 'dark' {
  return value === 'light' ? 'light' : 'dark'
}
