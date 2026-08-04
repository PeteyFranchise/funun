// ─── Buyer theme cookie (per-buyer light/dark persistence) ────────────────
// LIGHT is the buyer-portal default (owner decision, 2026-08-03). A buyer
// opts into dark via ThemeToggle, which writes this cookie; the layout
// reads it server-side via readBuyerTheme so the correct `data-theme`
// attribute is present on the very first paint -- no light->dark flash.
export const BUYER_THEME_COOKIE = 'fnbl_theme'

export function readBuyerTheme(value: string | undefined | null): 'light' | 'dark' {
  return value === 'dark' ? 'dark' : 'light'
}
